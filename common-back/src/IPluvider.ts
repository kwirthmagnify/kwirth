import { IProviderSubscriber, IProviderSubscriptionHelp } from './IProvider'

/**
 * What the extension manager and provider-debug show about a pluvider. The consumer of a pluvider is
 * ANOTHER TEAM, so there has to be something to show without reading the code.
 */
export interface IPluviderData {
    /** What it produces, in one line. */
    description: string
    /** Name of the type of event it emits (e.g. 'IAgoraAlert'), to orient the consumer. */
    eventTypeName?: string
}

/**
 * A plugin that ALSO produces: it exposes in-process the information it already generates, so other
 * plugins can subscribe to it. It is not a second extension packaged inside the plugin: it is
 * implemented by the channel's SAME class, on the same instance and the same data.
 *
 * It does NOT extend IProvider, on purpose. A pluvider does not go through the provider machinery — it
 * is not put into 'clusterInfo.providers', which is what the loops that mount routers, write
 * 'apiKeyApi' or set 'started' walk over — so it has no 'id', 'router', 'routerAlias',
 * 'providesRouter', 'requiresApiKeyApi' or 'apiKeyApi'.
 *
 * Nor does the author write the id: the core composes it as '<PLUVIDER_ID_PREFIX><channelId>', so
 * nobody gets the prefix wrong.
 *
 * 'TSub' is the shape of the subscription filter. As with providers, each pluvider decides whether it
 * filters and with what shape; if it does not filter, the generic is left unspecified.
 *
 * Example:
 *
 *   class AgoraChannel implements IChannel, IPluvider<IAgoraAlertSubscription> { … }
 */
export interface IPluvider<TSub = unknown> {
    /**
     * The pluvider's metadata. Its PRESENCE is the declaration: a channel implementing this method
     * offers itself as a producer, and the core registers it. No flags, no duck-typing detection.
     */
    getPluviderData(): IPluviderData

    addSubscriber(c: IProviderSubscriber, data: TSub): Promise<void>
    removeSubscriber(c: IProviderSubscriber): Promise<void>
    updateSubscription?(c: IProviderSubscriber, data: TSub): Promise<void>

    /**
     * Starts production. The core calls it in the pluviders phase, that is BEFORE 'startChannel()':
     * the background work lives on this side and the front end hooks in afterwards.
     */
    startProvider(): Promise<void>
    stopProvider(): Promise<void>

    /**
     * Mandatory, unlike its namesake on IProvider, which is optional. A provider is usually consumed
     * by whoever wrote it; a pluvider is consumed by outsiders, and without this they have no way of
     * knowing what to write in the subscription or what they are going to receive.
     */
    getSubscriptionHelp(): IProviderSubscriptionHelp
}
