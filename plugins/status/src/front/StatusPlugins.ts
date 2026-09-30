import { EPluginState, IPluginStatus } from '@kwirthmagnify/kwirth-common'
import { IHealthLabel } from './StatusLabels'

/*
    The Plugins tab's arithmetic, apart from the component so it can be tested.

    The figures (instances, connections) are the plugin's own: its channel counts them. A plugin whose
    channel does not is "not reported" — shown as a dash and counted apart, never folded into a zero,
    which would read as "nobody uses it" and invite uninstalling something in use.
*/

/*
    How each state is worded. A switch with a default and not a Record: a newer core may send a state
    this plugin does not know yet, and it has to be shown as such instead of breaking the tab.
*/
export const pluginStateLabel = (state: EPluginState): IHealthLabel => {
    switch (state) {
        case EPluginState.RUNNING: return { label: 'Running', color: 'success' }
        case EPluginState.REMOTE: return { label: 'Remote', color: 'default' }
        case EPluginState.NOT_STARTED: return { label: 'Not started', color: 'warning' }
        case EPluginState.FAILED: return { label: 'Failed', color: 'error' }
        default: return { label: 'Unknown', color: 'default' }
    }
}

// What needs a look first: broken, then not running, then elsewhere, then fine. Unknown ones before fine.
const ORDER: Record<EPluginState, number> = {
    [EPluginState.FAILED]: 0,
    [EPluginState.NOT_STARTED]: 1,
    [EPluginState.REMOTE]: 3,
    [EPluginState.RUNNING]: 4
}
const orderOf = (state: EPluginState): number => ORDER[state] ?? 2

export const sortPlugins = (plugins: IPluginStatus[]): IPluginStatus[] =>
    [...plugins].sort((a, b) => {
        const d = orderOf(a.state) - orderOf(b.state)
        return d !== 0 ? d : a.id.localeCompare(b.id)
    })

/** By id, name, version or state, case-insensitive. */
export const filterPlugins = (plugins: IPluginStatus[], filter: string): IPluginStatus[] => {
    if (!filter) return plugins
    const f = filter.toLowerCase()
    return plugins.filter(p =>
        p.id.toLowerCase().includes(f) ||
        p.name.toLowerCase().includes(f) ||
        p.version.toLowerCase().includes(f) ||
        pluginStateLabel(p.state).label.toLowerCase().includes(f))
}

/** The Home box's figures. */
export interface IPluginSummary {
    total: number
    /** Plugins in FAILED state. */
    failed: number
    /** Sum of instances over the plugins that report them. */
    instances: number
    /** Running plugins whose channel does not report its instances. */
    unreported: number
}

export const summarizePlugins = (plugins: IPluginStatus[]): IPluginSummary => ({
    total: plugins.length,
    failed: plugins.filter(p => p.state === EPluginState.FAILED).length,
    instances: plugins.reduce((n, p) => n + (p.instances?.instances ?? 0), 0),
    unreported: plugins.filter(p => p.state === EPluginState.RUNNING && !p.instances).length
})
