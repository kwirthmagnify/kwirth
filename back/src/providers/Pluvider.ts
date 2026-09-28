import { IChannel, IPluvider } from '@kwirthmagnify/kwirth-common-back'
import { PLUVIDER_ID_PREFIX } from '@kwirthmagnify/kwirth-common'
import { ELogComponent, logInfo, logWarning, providerLogger } from '../tools/Logging'

/*
    A PLUVIDER is a channel that ALSO produces: it exposes in-process the information it already
    generates, so that other plugins can subscribe to it. It is still one plugin, one class and one
    instance; the only thing that changes is that it has one more door.

    It does not go into 'clusterInfo.providers'. That array is walked by the loops that mount routers on
    the public providers route, write 'apiKeyApi' or mark 'started': a channel put in there would end up
    with its front end's router published on a route that does not demand an accessKey. That is why it
    lives in a registry of its own, and the only common door is ClusterInfo's resolution by id.
*/
export type TPluviderChannel = IChannel & IPluvider

/*
    Declaring it IS the PRESENCE of getPluviderData(): a channel that implements it offers itself as a
    producer. It is not detected through 'addSubscriber', which is too generic to decide on.
*/
export const isPluvider = (c: IChannel): c is TPluviderChannel =>
    typeof (c as Partial<IPluvider>).getPluviderData === 'function'

/*
    A pluvider's id is ALWAYS composed by the core out of the channel's id, never written by the plugin's
    author: that way there is no way of getting the prefix wrong.
*/
export const pluviderId = (channelId: string): string => PLUVIDER_ID_PREFIX + channelId

/* Whether a subscription id points at a pluvider ('plugin:agora') or at a provider ('events'). */
export const isPluviderId = (id: string): boolean => id.startsWith(PLUVIDER_ID_PREFIX)

/*
    Names that exist as both a provider and a pluvider: an 'agora' provider and an 'agora' plugin that
    also produces, that is, 'plugin:agora'.

    Technically there is NO ambiguity — they live in different registries and each is addressed by its own
    id, which is exactly what the prefix is for — but to a person reading a list or writing a subscription
    they are easy to confuse. Hence the warning. And only a warning: an installation is never rejected
    over this, among other reasons because both extensions may be third-party and the user may control
    neither.

    The BARE name is returned ('agora'), which is the part that really coincides.
*/
export const findNameCollisions = (pluviderIds: string[], providerIds: string[]): string[] =>
    pluviderIds
        .filter(isPluviderId)
        .map(id => id.substring(PLUVIDER_ID_PREFIX.length))
        .filter(name => providerIds.includes(name))

/*
    Warns about every coincidence. 'when' says at which moment it was detected, because the same clash is
    reported at three: installing the plugin, installing the provider, and every startup of the core.
*/
export const warnNameCollisions = (pluviderIds: string[], providerIds: string[], when: string): string[] => {
    const collisions = findNameCollisions(pluviderIds, providerIds)
    for (const name of collisions) {
        logWarning(ELogComponent.CORE, `Name collision (${when}): there is a provider '${name}' and a plugin '${name}' that also publishes as '${pluviderId(name)}'. Both stay usable and nothing is blocked — subscribe to '${name}' for the provider and to '${pluviderId(name)}' for the plugin — but the names are easy to mix up.`)
    }
    return collisions
}

/*
    What somebody asked for, and WHO asked for it. The pair is the point: an id on its own cannot be
    acted upon — with fifteen channels installed, knowing that 'syslog' is missing does not say which one
    to go and look at, nor whether what is wrong is the absent provider or the one demanding it.
*/
export interface ISubscriptionRequest {
    consumerId: string
    targetId: string
}

/** A target nobody could provide, with EVERY consumer that asked for it. */
export interface IMissingTarget {
    id: string
    consumers: string[]
}

/*
    Of everything the channels ASK FOR in 'requirements.providers', what is really not available. It is
    not the same as walking what is registered: an id that was asked for and is not registered appeared
    nowhere until somebody tried to subscribe to it.

    They come back separately because absence does NOT mean the same thing in each case. A provider that
    is declared and not registered is a misconfiguration. An absent pluvider is legitimate: its plugin may
    not be installed, or it may be a SINGLE channel announced here as remote — and the consumer has to go
    on working without it.

    One entry per missing TARGET, not per request: three channels asking for the same absent thing is one
    problem, and three identical lines at startup is noise. The consumers are gathered into that single
    entry instead, which is what turns the report into something actionable.
*/
export const findMissingSubscriptionTargets = (
    requests: ISubscriptionRequest[],
    registeredProviderIds: string[],
    pluviders: Map<string, TPluviderChannel>
): { missingProviders: IMissingTarget[], missingPluviders: IMissingTarget[] } => {
    const missingProviders = new Map<string, Set<string>>()
    const missingPluviders = new Map<string, Set<string>>()

    const note = (into: Map<string, Set<string>>, targetId: string, consumerId: string): void => {
        const consumers = into.get(targetId)
        if (consumers) consumers.add(consumerId)
        else into.set(targetId, new Set([consumerId]))
    }

    for (const { consumerId, targetId } of requests) {
        if (isPluviderId(targetId)) {
            if (!pluviders.has(targetId)) note(missingPluviders, targetId, consumerId)
        }
        else if (!registeredProviderIds.includes(targetId)) {
            note(missingProviders, targetId, consumerId)
        }
    }

    // Sorted so the same startup always reports the same way: a line that changes order between restarts
    // looks like a change when nothing changed.
    const asList = (found: Map<string, Set<string>>): IMissingTarget[] =>
        [...found].map(([id, consumers]) => ({ id, consumers: [...consumers].sort() }))

    return { missingProviders: asList(missingProviders), missingPluviders: asList(missingPluviders) }
}

/*
    Rebuilds the registry when a channel's INSTANCE is replaced — today that only happens on the hot
    reload of a dev plugin, but the problem is always the same: the registry holds the instance, not the
    class, so replacing one without touching the registry leaves the core talking to an object nobody uses
    any more. It serves its description, its subscription help and its filter EXACTLY AS THEY WERE, which
    is precisely what makes a freshly reloaded change look as though it had no effect.

    The live subscribers stay on the previous instance and cannot be migrated: whoever was listening has
    to subscribe again. Hence the warning.
*/
export const rebindPluvider = async (pluviders: Map<string, TPluviderChannel>, pluvId: string, newInstance: IChannel): Promise<void> => {
    const old = pluviders.get(pluvId)
    if (old) {
        try { await old.stopProvider() }
        catch (err) { providerLogger(pluvId).error(`Failed to stop while being replaced: ${err}`) }
        pluviders.delete(pluvId)
    }
    if (!isPluvider(newInstance)) return
    pluviders.set(pluvId, newInstance)
    try { await newInstance.startProvider() }
    catch (err) { providerLogger(pluvId).error(`Failed to start after being replaced: ${err}`) }
    if (old) providerLogger(pluvId).warning('Replaced — its subscribers were left on the previous instance and must subscribe again')
    else providerLogger(pluvId).info('Registered')
}

/*
    The pluviders' startup phase: it goes between the providers' one and the channels' one. A pluvider
    produces from its provider side, so by the time the first consumer calls startChannel() and
    subscribes, production is already alive.

    The order WITHIN this phase is not guaranteed, and that is deliberate: a pluvider that consumes
    another one may miss the first events, and that is accepted as a limitation rather than building a
    dependency graph. One failing to start does not take anybody down either: its channel carries on and
    whoever subscribes to it simply receives nothing, which is the soft dependency.
*/
export const startPluviders = async (pluviders: Map<string, TPluviderChannel>): Promise<void> => {
    if (pluviders.size === 0) return
    logInfo(ELogComponent.CORE, 'Starting pluviders:')
    for (const [pluvId, pluv] of pluviders) {
        try {
            await pluv.startProvider()
            providerLogger(pluvId).info('Started')
        }
        catch (err) {
            providerLogger(pluvId).error(`Failed to start: ${err}`)
        }
    }
}
