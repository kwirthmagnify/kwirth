/*
    The contract of the 'events' provider, as its consumers see it. Moved from the core
    (back/src/providers/events/EventsProvider.ts) when the provider became an extension. The consumers
    (Magnify, topology, pinocchio, censor, agora, excubitor, iter, montag) keep their own copy of what they
    use, so a field can be added here; renaming one breaks them.
*/

/** What a subscriber sends to addSubscriber. Strict opt-in: only the kinds listed are delivered. */
export interface IEventsSubscription {
    /** Kubernetes kinds to receive: Pod, Deployment, Service, Event, CustomResourceDefinition... */
    kinds?: string[]
    /** Also receive the instances of every CRD watched, and everything else regardless of kinds */
    syncInstances?: boolean
}

/** What each subscriber receives, once per change: the object as Kubernetes sent it. */
export interface IEventsDelivery {
    /** ADDED, MODIFIED or DELETED */
    type: string
    obj: IKubeObject
}

/** The one-off read (getData, and getEvents while excubitor still calls it): Kubernetes Events, all or about one object. */
export interface IEventsQuery {
    namespace?: string
    kind?: string
    name?: string
    /** At most this many, newest first (the HTTP route caps it at 500) */
    limit?: number
}

/** The part of a Kubernetes object the provider reads. */
export interface IKubeObject {
    kind?: string
    metadata?: { name?: string, namespace?: string, uid?: string, creationTimestamp?: string }
    [key: string]: unknown
}

/** The part of a Kubernetes Event (core/v1) the provider reads to sort and to gate the backlog. */
export interface IKubeEvent extends IKubeObject {
    eventTime?: string
    lastTimestamp?: string
    firstTimestamp?: string
}
