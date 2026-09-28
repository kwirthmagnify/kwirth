/*
    Who is consuming a provider.

    Anything that subscribes to a producer has to be able to NAME itself, or the core's registry of
    who-consumes-what — the one the status graph is drawn from — ends up with anonymous edges, and a
    producer that keeps one credential per consumer (the cloud accounts, say) cannot tell who is asking.

    🔴 The identity is written by the CORE, never by the extension author: when the core wires an extension
    up to the providers it consumes, it STAMPS the instance with its qualified id — `sender:ses`,
    `webhook:gitlab`, `homepage:status`, `provider:aws` — and hands out a provider access already bound
    to it. A consumer therefore cannot claim to be somebody else and be handed that somebody's secret.

    Channels are the exception, for history: they name themselves through getChannelData() and their
    consumer id is the bare channel id. A pluvider is a channel that also produces, so it is filed as a
    channel — and the `plugin:` prefix is its id as a PRODUCER, a different thing.

    This lives in the published contract so that a PRODUCER can read the identity of whoever subscribes
    to it with the very same rule the core applies, instead of each one inventing its own.
*/

/** The property the core stamps a consumer instance with. A plain string key, so any producer can read it. */
export const KWIRTH_CONSUMER_ID = '__kwirthConsumerId'

/** Extension types whose consumer id carries a prefix. Channels do not: their id is the bare channel id. */
export type TConsumerType = 'provider' | 'sender' | 'webhook' | 'homepage' | 'login' | 'idp' | 'theme' | 'docs' | 'pack'

export const consumerIdFor = (type: TConsumerType, id: string): string => `${type}:${id}`

/** Stamps an instance with its qualified consumer id. The core's job; an extension has no reason to call it. */
export const stampConsumerId = (instance: object, consumerId: string): void => {
    Object.defineProperty(instance, KWIRTH_CONSUMER_ID, { value: consumerId, enumerable: false, configurable: true, writable: false })
}

/*
    The qualified id of whoever subscribed. The stamp wins; without it, the two legacy shapes: a channel
    names itself through getChannelData() (checked FIRST, because a pluvider also carries an `id`), and a
    bare `id` is taken for a provider wired by a core that did not stamp yet.

    Returns undefined when the consumer cannot name itself at all. The caller decides: a producer hands an
    anonymous consumer only what is meant for everyone, and the core warns and carries on.
*/
export const consumerIdOf = (consumer: unknown): string | undefined => {
    if (!consumer || typeof consumer !== 'object') return undefined
    const stamped = (consumer as Record<string, unknown>)[KWIRTH_CONSUMER_ID]
    if (typeof stamped === 'string' && stamped.length > 0) return stamped
    const c = consumer as { getChannelData?: () => { id?: string } | undefined, id?: unknown }
    if (typeof c.getChannelData === 'function') {
        const id = c.getChannelData()?.id
        return typeof id === 'string' && id.length > 0 ? id : undefined
    }
    return typeof c.id === 'string' && c.id.length > 0 ? consumerIdFor('provider', c.id) : undefined
}
