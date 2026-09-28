import { EStatusTab, IStatusComponent, IStatusInventory } from '../common/StatusTypes'

/*
    The tab's state: the latest snapshot and the previous one, and nothing else.

    TWO and not one because with two a rate can be given, and a rate is what tells a provider that is
    moving data now from one that moved it three days ago. TWO and no more because keeping a third is
    already a time series, which is explicitly outside the product — this screen shows the now, not the
    history.
*/
export interface IStatusData {
    /**
     * The open tab. It lives here and not in the component because switching the channel's tab unmounts
     * it: with a useState, coming back always returned you to the first tab.
     */
    view: EStatusTab
    /** What was typed into the filter, for the same reason. */
    filter: string
    /**
     * How many SECONDS between asking for a new snapshot. 0 = manual only, and it is the default.
     *
     * It lives here to survive a tab switch, like the rest. Starting at 0 is not timidity: the product
     * is "having a look", and whoever wants to watch turns it on knowing they are turning it on.
     */
    autoRefresh: number
    inventory?: IStatusInventory
    /**
     * The previous snapshot, and only that one.
     *
     * With two snapshots a rate can be given — deliveries per second between one and the other — which
     * is what really says whether something is moving: a running total of seven million does not tell a
     * provider at full tilt from one that was at full tilt three days ago. Keeping MORE than one would
     * be starting a time series, which is explicitly outside the product.
     */
    previous?: IStatusInventory
    /** Signals to be shown as text: channel errors, above all. */
    signals: string[]
    /** The core accepted the instance's configuration (the reply to the start). */
    configAccepted: boolean
    started: boolean
}

/*
    How many consumers the core did NOT broker: what the producer acknowledges minus what the core
    registered.

    It exists because the graph is drawn from what the core saw go by, and subscribing without going
    through the core is possible — you call the provider's 'addSubscriber' and that is it — and some
    do. When that number is not zero the graph is INCOMPLETE and it has to be said: keeping quiet
    turns a partial drawing into a false claim ("nobody is consuming") precisely when someone is.

    A component that does not report one of the two figures is skipped: 'undefined' is not zero, and
    subtracting with a hole in it produces an invented number. The result is clamped at zero, because
    the opposite mismatch — the core knowing more than the provider — is an unsubscribe the provider
    has not applied yet, not an anonymous consumer.
*/
export const countUnbrokeredConsumers = (components: IStatusComponent[]): number =>
    components.reduce((n, c) => {
        if (c.subscribers === undefined || c.knownConsumers === undefined) return n
        return n + Math.max(0, c.subscribers - c.knownConsumers)
    }, 0)

export class StatusData implements IStatusData {
    view: EStatusTab = EStatusTab.PROVIDERS
    filter = ''
    autoRefresh = 0
    inventory?: IStatusInventory
    previous?: IStatusInventory
    signals: string[] = []
    configAccepted = false
    started = false
}
