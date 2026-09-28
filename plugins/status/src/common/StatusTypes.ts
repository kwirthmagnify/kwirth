/*
    The contract between Kwirth Status's back end and front end.

    It lives in 'common' because both sides share it: were these loose string unions on each side, a
    change in one would be discovered at runtime and not at compile time.
*/

/** What kind of piece it is. It determines where it comes from in ClusterInfo and how it is drawn. */
export enum EComponentKind {
    PROVIDER = 'provider',
    PLUVIDER = 'pluvider',
    SENDER = 'sender',
    WEBHOOK = 'webhook',
    CHANNEL = 'channel'
}

/*
    How a piece is RIGHT NOW.

    The point of this enumeration is that an administrator should not confuse cases that look alike
    today: an installed extension that never started, one that started and fell over, and one that works
    but has its router unmounted. All three look the same from outside — "it does not work" — and are
    fixed in different ways.

    ACTIVE and IDLE appeared in S2, when 'IProvider.getStats()' made it possible to ask how many
    subscribers a provider has. INSTANTIATED still exists and is NOT a leftover: it is what is shown when
    the component does not implement that optional method — it is running, and whether anybody consumes
    it is unknown. A state that cannot be known is not guessed.
*/
export enum EComponentHealth {
    /** Instantiated and with at least one consumer. */
    ACTIVE = 'active',
    /** Instantiated and with nobody listening: it is emitting to nobody. */
    IDLE = 'idle',
    /** Instantiated, but it does not say how many consumers it has (it does not implement getStats). */
    INSTANTIATED = 'instantiated',
    /** Installed, but the core never set it going. `reason` says why. */
    NOT_INSTANTIATED = 'not-instantiated',
    /** Running, but something of its own needs a server restart to be available. */
    PENDING_RESTART = 'pending-restart',
    /** It tried to start and failed. `reason` carries the error. */
    FAILED = 'failed',
    /** There is no way to know. Different from "it is broken": the datum does not exist (RNF2). */
    UNKNOWN = 'unknown'
}

/** One piece of the inventory. */
export interface IStatusComponent {
    kind: EComponentKind
    id: string
    displayName: string
    health: EComponentHealth
    /**
     * WHY it is in that state, in the language of whoever reads it. It is the field that justifies the
     * whole screen: a bare 'not running' is what there already is today, and it solves nothing.
     */
    reason?: string
    version?: string
    /** Where it came from: a marketplace, 'dev', 'bundled'… the same the managers show. */
    installedFrom?: string
    /**
     * How many consumers it has, when the component can say (S2).
     *
     * `undefined` means **it does not say**, which is different from 0 — zero is a claim, and whoever
     * reads it may go and uninstall something. Hence it is optional and not a number with a default.
     */
    subscribers?: number
    /**
     * Deliveries accumulated since the component started (S4), when it can say.
     *
     * A running total, not a rate: the rate is computed by whoever reads it, subtracting two snapshots.
     * And `undefined` still means "it does not say", never 0 — the same rule as with consumers.
     */
    events?: number
    /**
     * How many of those consumers are IDENTIFIED in the graph (S3).
     *
     * When it is lower than `subscribers`, there are consumers the core did not intermediate and about
     * which all that is known is that they exist. The screen says so rather than drawing the ones it
     * knows and implying they are all of them.
     */
    knownConsumers?: number
}

/**
 * The complete inventory, exactly as it travels to the front end.
 *
 * `cluster` is there from day one even though today it is always the same one: the day there is a
 * federated view, the types need not change. It costs a field now and saves redoing the front end later.
 */
export interface IStatusInventory {
    cluster: string
    takenAt: number
    components: IStatusComponent[]
    /**
     * Who consumes whom. It may fall short of `IStatusComponent.subscribers`, and that is a datum, not a
     * fault: whoever subscribes to a provider **without going through the core** does not appear here.
     * `provider-debug` does exactly that, on purpose, with its own proxy.
     */
    edges: IStatusEdge[]
}

/**
 * One edge of the graph: who produces and who consumes.
 *
 * It comes from the CORE's registry (`ClusterInfo.getSubscriptions()`), not from the providers: the
 * subscription goes through the core with the channel up front, so that is where both ends are known.
 * A provider only knows how many subscribers it has, not who they are.
 */
export interface IStatusEdge {
    /** Who produces: a provider ('events') or a pluvider ('plugin:agora'). */
    providerId: string
    /**
     * Who consumes: a channel id ('agora'), or another provider with the core's prefix ('provider:aws')
     * now that a provider can subscribe to another one. Same value and name as the core's
     * ISubscription.consumerId.
     */
    consumerId: string
    since: number
}

/**
 * The tabs of the channel. String values with a meaning, set explicitly on each Tab: adding, removing or
 * reordering a tab must not shift the others.
 */
export enum EStatusTab {
    PROVIDERS = 'providers',
    GRAPH = 'graph',
    PERFORMANCE = 'performance',
    PLUGINS = 'plugins',
    EXTENSIONS = 'extensions'
}

/** The core's prefix for a consumer that is a provider (back/src/providers/Consumer.ts). */
export const PROVIDER_CONSUMER_PREFIX = 'provider:'

/**
 * A layer the graph pins a node to. The values are elk's own ('elk.layered.layering.layerConstraint'),
 * so they go straight into the layout options.
 */
export enum EGraphLayer {
    FIRST = 'FIRST',
    LAST = 'LAST'
}

/** What a data message of this channel carries. Today there is only one; the diagram and counters will come. */
export enum EStatusPayload {
    INVENTORY = 'inventory'
}

/**
 * Data message from the back end to the front end.
 *
 * The header (msgtype, channel, action, flow, type, instance) is what the core expects from any channel;
 * what belongs to this plugin is 'payloadType' and whatever hangs off it.
 */
export interface IStatusMessageResponse {
    msgtype: string
    channel: string
    action: string
    flow: string
    type: string
    instance: string
    payloadType: EStatusPayload
    inventory?: IStatusInventory
}

/** What the front end can ask for. The inventory is sent on start; this is for asking again. */
export enum EStatusCommand {
    REFRESH = 'refresh'
}
