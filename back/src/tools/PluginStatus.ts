import { EPluginState, IChannelInstances, IPluginStatus } from '@kwirthmagnify/kwirth-common'
import { IChannel } from '@kwirthmagnify/kwirth-common-back'
import { IPluginMeta } from './PluginManager'

/*
    The installed plugins as the Status channel shows them (plan: plans/kwirth-status/PLAN-v2.md, S3).

    Everything here is something the core already knows: which plugins are installed, which of them
    registered a channel class, which channel is instantiated in this Kwirth and which is announced as
    remote. Only the figures come from the plugin itself — its channel's optional getInstances(), which is
    third-party code: if it throws or answers nonsense, that plugin goes without figures and the rest of
    the list still comes out.
*/

/*
    A channel as it may really be at runtime: getInstances() is required by common-back 0.6.0, but a
    plugin built against 0.5.x does not have it. The type says what can happen, not what should.
*/
type TReportingChannel = Partial<Pick<IChannel, 'getInstances'>>

/** What the core holds about its channels, read at the moment of asking. */
export interface IPluginSources {
    /** Every installed plugin (dev and installed). */
    metas: IPluginMeta[]
    /** The ids with a registered channel class. */
    registered: ReadonlySet<string>
    /** The channels instantiated in this Kwirth, by id. */
    running: ReadonlyMap<string, TReportingChannel>
    /** The ids of the 'single' channels this Kwirth only announces. */
    remote: ReadonlySet<string>
}

const stateOf = (id: string, s: IPluginSources): EPluginState => {
    if (s.running.has(id)) return EPluginState.RUNNING
    if (s.remote.has(id)) return EPluginState.REMOTE
    if (s.registered.has(id)) return EPluginState.NOT_STARTED
    return EPluginState.FAILED
}

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

/** The channel's own figures, or undefined when it does not give them — or gives something that is not them. */
export const instancesOf = (id: string, channel: TReportingChannel | undefined): IChannelInstances | undefined => {
    if (!channel?.getInstances) return undefined
    try {
        const r = channel.getInstances()
        if (!r || !isCount(r.instances) || !isCount(r.connections)) return undefined
        return { instances: r.instances, connections: r.connections }
    }
    catch (err) {
        console.error(`[plugins] getInstances() of plugin '${id}' failed: ${err}`)
        return undefined
    }
}

export const buildPluginStatuses = (s: IPluginSources): IPluginStatus[] =>
    s.metas.map(m => {
        const state = stateOf(m.id, s)
        const instances = state === EPluginState.RUNNING ? instancesOf(m.id, s.running.get(m.id)) : undefined
        return {
            id: m.id,
            name: m.displayName || m.name || m.id,
            version: m.version,
            ...(m.installedFrom ? { source: m.installedFrom } : {}),
            requiresRestart: m.requiresRestart === true,
            state,
            ...(instances ? { instances } : {})
        }
    })
