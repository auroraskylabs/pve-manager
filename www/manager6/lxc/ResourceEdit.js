var labelWidth = 120;

Ext.define('PVE.lxc.MemoryEdit', {
    extend: 'Proxmox.window.Edit',

    initComponent: function () {
        var me = this;

        Ext.apply(me, {
            subject: gettext('Memory'),
            items: Ext.create('PVE.lxc.MemoryInputPanel'),
        });

        me.callParent();

        me.load();
    },
});

Ext.define('PVE.lxc.CPUEdit', {
    extend: 'Proxmox.window.Edit',
    alias: 'widget.pveLxcCPUEdit',

    viewModel: {
        data: {
            cgroupMode: 2,
        },
    },

    initComponent: function () {
        let me = this;
        me.getViewModel().set('cgroupMode', me.cgroupMode);

        Ext.apply(me, {
            subject: gettext('CPU'),
            items: Ext.create('PVE.lxc.CPUInputPanel'),
        });

        me.callParent();

        me.load();
    },
});

// The view model of the parent should contain a 'cgroupMode' variable (or params for v2 are used).
Ext.define('PVE.lxc.CPUInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveLxcCPUInputPanel',

    onlineHelp: 'pct_cpu',

    insideWizard: false,

    viewModel: {
        formulas: {
            cpuunitsDefault: (get) => (get('cgroupMode') === 1 ? 1024 : 100),
            cpuunitsMax: (get) => (get('cgroupMode') === 1 ? 500000 : 10000),
        },
    },

    onGetValues: function (values) {
        let me = this;
        let cpuunitsDefault = me.getViewModel().get('cpuunitsDefault');

        if (!values['numa_optimized']) {
            delete values.numa_nodes;
            delete values.numa_grouping;
            delete values.numa_bind_memory;
        } else {
            if (!values.numa_nodes) {
                delete values.numa_nodes;
            }
            PVE.Utils.delete_if_default(values, 'numa_grouping', '', me.insideWizard);
            PVE.Utils.delete_if_default(values, 'numa_bind_memory', '0', me.insideWizard);
        }

        PVE.Utils.delete_if_default(values, 'numa_optimized', '0', me.insideWizard);

        PVE.Utils.delete_if_default(values, 'cpulimit', '0', me.insideWizard);
        PVE.Utils.delete_if_default(values, 'cpuunits', `${cpuunitsDefault}`, me.insideWizard);

        return values;
    },

    advancedColumn1: [
        {
            xtype: 'numberfield',
            name: 'cpulimit',
            minValue: 0,
            value: '',
            step: 1,
            fieldLabel: gettext('CPU limit'),
            allowBlank: true,
            emptyText: gettext('unlimited'),
        },
        {
            xtype: 'proxmoxcheckbox',
            name: 'numa_optimized',
            reference: 'numaOptimized',
            fieldLabel: gettext('NUMA optimized'),
            defaultValue: 0,
            deleteDefaultValue: true,
            uncheckedValue: 0,
            listeners: {
                change: function (cb, value) {
                    let panel = cb.up('pveLxcCPUInputPanel');
                    panel.setNumaFieldsDisabled(!value);
                },
                afterrender: function (cb) {
                    cb.fireEvent('change', cb, cb.getValue());
                },
            },
        },
        {
            xtype: 'proxmoxtextfield',
            name: 'numa_nodes',
            reference: 'numaNodes',
            fieldLabel: gettext('NUMA nodes'),
            emptyText: gettext('auto'),
            allowBlank: true,
            disabled: true,
            labelWidth: labelWidth,
            regex: /^[0-9]+([,-][0-9]+)*$/,
            regexText: gettext('Use comma or hyphen separated node ids'),
        },
        {
            xtype: 'proxmoxKVComboBox',
            name: 'numa_grouping',
            reference: 'numaGrouping',
            fieldLabel: gettext('Core selection'),
            emptyText: Proxmox.Utils.defaultText,
            deleteEmpty: true,
            disabled: true,
            labelWidth: labelWidth,
            comboItems: [
                ['contiguous', gettext('Contiguous')],
                ['smt', 'SMT'],
                ['auto', gettext('Auto')],
            ],
        },
        {
            xtype: 'proxmoxcheckbox',
            name: 'numa_bind_memory',
            reference: 'numaBindMemory',
            fieldLabel: gettext('Bind memory'),
            uncheckedValue: 0,
            defaultValue: 0,
            deleteDefaultValue: true,
            disabled: true,
        },
    ],

    advancedColumn2: [
        {
            xtype: 'proxmoxintegerfield',
            name: 'cpuunits',
            fieldLabel: gettext('CPU units'),
            value: '',
            minValue: 8,
            maxValue: '10000',
            emptyText: '100',
            bind: {
                emptyText: '{cpuunitsDefault}',
                maxValue: '{cpuunitsMax}',
            },
            labelWidth: labelWidth,
            deleteEmpty: true,
            allowBlank: true,
        },
    ],

    initComponent: function () {
        var me = this;

        me.setNumaFieldsDisabled = (disabled) => {
            ['numaNodes', 'numaGrouping', 'numaBindMemory'].forEach((ref) => {
                let cmp = me.lookupReference(ref);
                if (cmp) {
                    cmp.setDisabled(disabled);
                }
            });
        };

        me.column1 = [
            {
                xtype: 'proxmoxintegerfield',
                name: 'cores',
                minValue: 1,
                maxValue: 8192,
                value: me.insideWizard ? 1 : '',
                fieldLabel: gettext('Cores'),
                allowBlank: true,
                deleteEmpty: true,
                emptyText: gettext('unlimited'),
            },
        ];

        me.callParent();
    },
});

Ext.define('PVE.lxc.MemoryInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveLxcMemoryInputPanel',

    onlineHelp: 'pct_memory',

    insideWizard: false,

    initComponent: function () {
        var me = this;

        var items = [
            {
                xtype: 'proxmoxintegerfield',
                name: 'memory',
                minValue: 16,
                value: '512',
                step: 32,
                fieldLabel: gettext('Memory') + ' (MiB)',
                labelWidth: labelWidth,
                allowBlank: false,
            },
            {
                xtype: 'proxmoxintegerfield',
                name: 'swap',
                minValue: 0,
                value: '512',
                step: 32,
                fieldLabel: gettext('Swap') + ' (MiB)',
                labelWidth: labelWidth,
                allowBlank: false,
            },
        ];

        if (me.insideWizard) {
            me.column1 = items;
        } else {
            me.items = items;
        }

        me.callParent();
    },
});
