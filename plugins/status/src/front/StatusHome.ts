import { EComponentHealth, EComponentKind, IStatusComponent, IStatusInventory } from '../common/StatusTypes'
import { countUnbrokeredConsumers } from './StatusData'

/*
    The Home tab's arithmetic: one summary per tab, computed from the snapshot. Kept apart from the
    component so it can be tested — the figures on the boxes are claims, and a box that says "3 failed"
    when there are two is worse than no box.
*/

/** A list tab (Providers, Extensions) summed up: how many, of what kind, in what state. */
export interface IListSummary {
    total: number
    byKind: Record<EComponentKind, number>
    byHealth: Record<EComponentHealth, number>
    /** Failed, needing a restart or never started: what the tab is going to show first. */
    attention: number
}

/** The graph summed up: how many producers, how many distinct consumers and how many lines between them. */
export interface IGraphSummary {
    producers: number
    consumers: number
    edges: number
    /** Consumers the core did not broker: when above zero, the graph is INCOMPLETE and says so. */
    unbrokered: number
}

export interface IHomeSummary {
    providers: IListSummary
    extensions: IListSummary
    graph: IGraphSummary
}

/** The kinds the Providers tab lists, and the ones the Extensions tab lists. Channels are on neither. */
const PRODUCER_KINDS: ReadonlySet<EComponentKind> = new Set([EComponentKind.PROVIDER, EComponentKind.PLUVIDER])
const EXTENSION_KINDS: ReadonlySet<EComponentKind> = new Set([EComponentKind.SENDER, EComponentKind.WEBHOOK])

const ATTENTION: ReadonlySet<EComponentHealth> = new Set([EComponentHealth.FAILED, EComponentHealth.PENDING_RESTART, EComponentHealth.NOT_INSTANTIATED])

const zeroKinds = (): Record<EComponentKind, number> => ({
    [EComponentKind.PROVIDER]: 0,
    [EComponentKind.PLUVIDER]: 0,
    [EComponentKind.SENDER]: 0,
    [EComponentKind.WEBHOOK]: 0,
    [EComponentKind.CHANNEL]: 0
})

const zeroHealths = (): Record<EComponentHealth, number> => ({
    [EComponentHealth.ACTIVE]: 0,
    [EComponentHealth.IDLE]: 0,
    [EComponentHealth.INSTANTIATED]: 0,
    [EComponentHealth.NOT_INSTANTIATED]: 0,
    [EComponentHealth.PENDING_RESTART]: 0,
    [EComponentHealth.FAILED]: 0,
    [EComponentHealth.UNKNOWN]: 0
})

const summarizeList = (components: IStatusComponent[], kinds: ReadonlySet<EComponentKind>): IListSummary => {
    const rows = components.filter(c => kinds.has(c.kind))
    const byKind = zeroKinds()
    const byHealth = zeroHealths()
    let attention = 0
    for (const c of rows) {
        byKind[c.kind]++
        byHealth[c.health]++
        if (ATTENTION.has(c.health)) attention++
    }
    return { total: rows.length, byKind, byHealth, attention }
}

/*
    The graph's figures follow the graph's own rules: every producer is a node whether or not anybody
    consumes it, a consumer is whoever appears at the end of an edge, and the same consumer with three
    subscriptions is ONE consumer with three lines.
*/
const summarizeGraph = (inventory: IStatusInventory): IGraphSummary => ({
    producers: inventory.components.filter(c => PRODUCER_KINDS.has(c.kind)).length,
    consumers: new Set(inventory.edges.map(e => e.consumerId)).size,
    edges: inventory.edges.length,
    unbrokered: countUnbrokeredConsumers(inventory.components)
})

export const summarize = (inventory: IStatusInventory): IHomeSummary => ({
    providers: summarizeList(inventory.components, PRODUCER_KINDS),
    extensions: summarizeList(inventory.components, EXTENSION_KINDS),
    graph: summarizeGraph(inventory)
})
