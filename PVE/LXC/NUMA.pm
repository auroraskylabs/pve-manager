package PVE::LXC::NUMA;

use strict;
use warnings;

use List::Util qw(uniq);

use PVE::Exception qw(raise_param_exc);
use PVE::Tools;

my $NODE_GLOB = '/sys/devices/system/node/node*';
my $CPU_SIBLING_FMT = '/sys/devices/system/cpu/cpu%d/topology/thread_siblings_list';

sub _parse_cpulist {
    my ($list) = @_;

    return [] if !defined($list) || $list eq '';

    my @cpus;
    for my $entry (split(/,/, $list)) {
        if ($entry =~ m/^(\d+)-(\d+)$/) {
            my ($start, $end) = ($1, $2);
            push @cpus, ($start <= $end ? ($start..$end) : ($end..$start));
        } elsif ($entry =~ m/^\d+$/) {
            push @cpus, int($entry);
        }
    }

    @cpus = sort { $a <=> $b } uniq @cpus;
    return \@cpus;
}

sub get_numa_topology {
    my ($sysfs_root) = @_;

    my $glob = defined($sysfs_root) ? "$sysfs_root/node*" : $NODE_GLOB;
    my %nodes;

    for my $path (glob($glob)) {
        my ($node) = $path =~ m{/node(\d+)$};
        next if !defined($node);

        my $cpulist = eval { PVE::Tools::file_get_contents("$path/cpulist"); };
        next if !defined($cpulist);
        chomp($cpulist);
        $nodes{$node} = _parse_cpulist($cpulist);
    }

    return \%nodes;
}

sub _thread_siblings {
    my ($cpu) = @_;

    my $path = sprintf($CPU_SIBLING_FMT, $cpu);
    my $list = eval { PVE::Tools::file_get_contents($path) };
    return [] if !$list;

    chomp($list);
    return _parse_cpulist($list);
}

sub _select_contiguous {
    my ($topology, $nodes, $count) = @_;

    my @cpus;
    NODE: for my $node (@$nodes) {
        my $available = $topology->{$node} // [];
        for my $cpu (@$available) {
            push @cpus, $cpu;
            last NODE if scalar(@cpus) >= $count;
        }
    }

    return \@cpus;
}

sub _select_smt {
    my ($topology, $nodes, $count) = @_;

    my @selected;
    my %seen;

    NODE: for my $node (@$nodes) {
        my $available = $topology->{$node} // [];
        my %node_cpus = map { $_ => 1 } @$available;
        for my $cpu (@$available) {
            next if $seen{$cpu};
            my $siblings = _thread_siblings($cpu);
            my @pair = grep { $node_cpus{$_} && !$seen{$_} } @$siblings;
            @pair = ($cpu) if !@pair;
            for my $entry (@pair) {
                next if $seen{$entry};
                push @selected, $entry;
                $seen{$entry} = 1;
                last NODE if scalar(@selected) >= $count;
            }
            last NODE if scalar(@selected) >= $count;
        }
    }

    return \@selected;
}

sub select_numa_cpus {
    my ($topology, $requested_nodes, $count, $mode) = @_;

    $requested_nodes //= [];
    $mode //= 'auto';
    $count //= 0;
    raise_param_exc({ cpus => "cannot select zero CPUs" }) if !$count;
    raise_param_exc({ mode => "unknown selection mode '$mode'" })
        if $mode ne 'auto' && $mode ne 'contiguous' && $mode ne 'smt';

    my @nodes = @$requested_nodes ? @$requested_nodes : sort { $a <=> $b } keys %$topology;
    for my $node (@nodes) {
        raise_param_exc({ numa_nodes => "node $node unavailable" }) if !exists $topology->{$node};
    }

    my $selector = $mode eq 'smt' ? \&_select_smt : \&_select_contiguous;
    my $cpus = $selector->($topology, \@nodes, $count);

    raise_param_exc({ cpus => "only " . scalar(@$cpus) . " CPUs available" }) if scalar(@$cpus) < $count;

    return $cpus;
}

sub generate_cpuset_config {
    my ($topology, $nodes, $count, $mode, $bind_memory) = @_;

    my $cpus = select_numa_cpus($topology, $nodes, $count, $mode);
    my $cpu_string = join(',', @$cpus);

    my $config = { 'lxc.cgroup2.cpuset.cpus' => $cpu_string };
    if ($bind_memory) {
        my @mems = @$nodes ? @$nodes : sort { $a <=> $b } keys %$topology;
        $config->{'lxc.cgroup2.cpuset.mems'} = join(',', @mems);
    }

    return $config;
}

1;

__END__

=pod

=head1 NAME

PVE::LXC::NUMA - NUMA-aware helpers for LXC CPU placement

=head1 DESCRIPTION

Provides helper routines to detect the host NUMA topology and derive
cpuset and memory binding settings for LXC containers.

=head1 FUNCTIONS

=head2 get_numa_topology($root)

Returns a hashref mapping NUMA node ids to sorted CPU arrays. If C<$root>
is provided it is used instead of the default sysfs path.

=head2 select_numa_cpus($topology, $nodes, $count, $mode)

Selects C<$count> CPUs from the provided topology. The optional C<$nodes>
array limits selection to the provided NUMA nodes. The C<$mode> parameter
supports C<contiguous>, C<smt>, and C<auto> (alias for contiguous).

=head2 generate_cpuset_config($topology, $nodes, $count, $mode, $bind_memory)

Builds a hashref with the cpuset cgroup keys for the selected CPUs and,
if requested, the corresponding memory node list.

=cut
