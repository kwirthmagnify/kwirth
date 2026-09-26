import { IChannel } from '../channels/IChannel'
import { IProviderRequirements } from './IProvider'
import { isPluviderId } from './Pluvider'

/*
    The other half of the symmetry that Pluvider.ts opened.

    A PLUVIDER is a channel that also PRODUCES: it already generates information, so it offers it to
    others. This file is about the opposite direction — a PROVIDER that also CONSUMES: it subscribes
    to another producer to do its own job.

    The case that forced it: a provider that owns the cloud credentials, and the aws/azure/gcp
    providers that need them. Until now only a channel could subscribe to a producer, because the
    handle asked for an IChannel and named the consumer through getChannelData(). A provider has
    neither of those, so it was left with reaching into 'clusterInfo.providers' behind the core's
    back — which is precisely what the handle exists to prevent, and what would make the core's
    registry of who-consumes-what false again.
*/

/*
    Anything that subscribes has to be able to NAME itself, or the registry ends up with anonymous
    edges. Two shapes exist and neither can be derived from the other: a channel names itself through
    getChannelData(), a provider through its own 'id'.
*/
export interface IProviderConsumer {
    readonly id: string
}

export type TSubscriptionConsumer = IChannel | IProviderConsumer

/*
    ⚠️ Namespaced, and composed by the CORE — never written by the extension author, same rule as
    pluvider ids. Without it a channel called 'aws' and a provider called 'aws' consuming the same
    producer would collapse into ONE edge in the registry, and the graph would show one consumer
    where there are two. It is not a correctness bug —the subscriber Set still counts both, so the
    edge does not die early— but it is a lie in the only place built to tell the truth about this.

    Note this is the id of a CONSUMER, a different thing from the 'plugin:' prefix, which identifies
    a pluvider as a PRODUCER. Nobody addresses a consumer id: it is a label in the core's registry,
    which is why it stays here and not in the published common package.
*/
export const PROVIDER_CONSUMER_ID_PREFIX = 'provider:'

export const providerConsumerId = (providerId: string): string => PROVIDER_CONSUMER_ID_PREFIX + providerId

/*
    Decided by the PRESENCE of getChannelData(), the same way a pluvider is decided by the presence of
    getPluviderData(). It is checked first on purpose: a pluvider is a channel that also produces, so
    it may well carry an 'id' too, and asking about 'id' first would file it as a provider.
*/
export const isChannelConsumer = (consumer: TSubscriptionConsumer): consumer is IChannel =>
    typeof (consumer as Partial<IChannel>).getChannelData === 'function'

/*
    Returns undefined when the consumer cannot name itself. The caller decides what to do with that:
    refusing the subscription would be worse than an unnamed edge, so it warns and carries on.
*/
export const consumerIdOf = (consumer: TSubscriptionConsumer): string | undefined => {
    if (isChannelConsumer(consumer)) return consumer.getChannelData()?.id
    const id = (consumer as Partial<IProviderConsumer>)?.id
    return typeof id === 'string' && id.length > 0 ? providerConsumerId(id) : undefined
}

/*
    Wiring phase: runs once, after EVERY provider and pluvider is registered and started, so a provider
    that consumes another can subscribe knowing its producer exists.

    It is a phase of its own and not a line inside startProvider() because whether a producer is already
    registered at that point depends on which of the two startup loops instantiated it —one pushes to
    the registry before starting and the other after— and on the order within the loop. The author of a
    provider cannot see any of that, so it would work or not for invisible reasons.

    No dependency graph was built, the same call already made for pluviders. This makes the one thing
    that needed determinism deterministic and nothing else: a provider that consumes another still has
    to survive its producer being absent, because it may genuinely not be installed.

    One failing does not take the rest down: consuming another producer is a SOFT dependency, exactly as
    it is for a channel subscribing to a pluvider that is not there.
*/
export const wireProviderConsumers = async (providers: IWireableProvider[], log: (providerId: string, err: unknown) => void): Promise<number> => {
    let wired = 0
    for (const provider of providers ?? []) {
        if (typeof provider?.onProvidersReady !== 'function') continue
        try {
            await provider.onProvidersReady()
            wired++
        }
        catch (err) { log(provider.id, err) }
    }
    return wired
}

/** Just enough of a provider to be wired: the rest of IProvider is none of this function's business. */
export interface IWireableProvider {
    readonly id: string
    onProvidersReady?: () => void | Promise<void>
}

/*
    Instantiation phase for providers that CONSUME others.

    The core only instantiates a provider if a CHANNEL asks for it or if it exposes a router. A
    producer that only another provider needs matches neither, so it was never created and the
    consumer got 'undefined' from getProvider() in onProvidersReady(). Here a provider declares what
    it consumes (IProvider.requirements) and the core closes the set transitively: what a consumer
    needs is instantiated, then what THAT one needs, and so on.

    Cycles cannot loop forever: a provider already present is never created again, and each id is
    attempted at most once, so the queue only ever grows by providers that did not exist before.

    Pluvider ids are skipped: a pluvider exists when its plugin is installed, the core cannot create
    one. A consumer that lists one by mistake still gets it through getProvider() if it is there.

    Soft dependency, like everything else in this file: an id that is not registered is reported and
    the rest carry on. The caller decides how to log it.
*/
export const resolveConsumedProviders = async <T extends IRequiringProvider>(
    consumers: T[],
    isPresent: (providerId: string) => boolean,
    isRegistered: (providerId: string) => boolean,
    instantiate: (providerId: string, consumerId: string) => Promise<T | undefined>
): Promise<IConsumedProvidersResolution<T>> => {
    const result: IConsumedProvidersResolution<T> = { added: [], missing: [] }
    const attempted = new Set<string>()
    const queue = [...(consumers ?? [])]
    while (queue.length > 0) {
        const consumer = queue.shift()!
        const wanted = consumer?.requirements?.providers
        if (!Array.isArray(wanted)) continue
        for (const providerId of wanted) {
            if (typeof providerId !== 'string' || providerId.length === 0) continue
            if (isPluviderId(providerId)) continue
            if (!isRegistered(providerId)) {
                result.missing.push({ consumerId: consumer.id, providerId })
                continue
            }
            if (isPresent(providerId) || attempted.has(providerId)) continue
            attempted.add(providerId)
            // instantiate() logs its own failure; a producer that could not be created is just absent
            const created = await instantiate(providerId, consumer.id)
            if (!created) continue
            result.added.push(created)
            queue.push(created)
        }
    }
    return result
}

/** Just enough of a provider to know what it consumes. */
export interface IRequiringProvider {
    readonly id: string
    requirements?: IProviderRequirements
}

export interface IMissingConsumedProvider {
    consumerId: string
    providerId: string
}

export interface IConsumedProvidersResolution<T extends IRequiringProvider = IRequiringProvider> {
    /** Providers instantiated by this phase, in creation order. */
    added: T[]
    /** Consumed ids that are not registered at all. One entry per consumer that asked. */
    missing: IMissingConsumedProvider[]
}
