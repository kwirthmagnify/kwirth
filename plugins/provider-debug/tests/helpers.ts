// Common mocks for provider-debug's unit tests (the censor pattern).
// No infrastructure is brought up: a clusterInfo with fake providers is injected and the WebSocket
// traffic is captured with MockWs.
import { EInstanceMessageType, IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import { EProviderDebugPayload, IProviderDebugEvent, IProviderDebugMessageResponse, IProviderDebugProviderInfo, IProviderDebugSubscriptionHelp } from '../src/common/ProviderDebugTypes'

// Fake WebSocket: it keeps every send() as a JSON string and offers typed views of the traffic.
export class MockWs {
    readyState = 1
    bufferedAmount = 0
    sent: string[] = []
    send(s: string): void { this.sent.push(s) }
    close(): void {}
    parsed(): Array<Record<string, unknown>> { return this.sent.map(s => JSON.parse(s) as Record<string, unknown>) }
    clear(): void { this.sent = [] }

    private data(): IProviderDebugMessageResponse[] {
        return this.parsed().filter(m => m.type === EInstanceMessageType.DATA) as unknown as IProviderDebugMessageResponse[]
    }

    /** eventos de provider recibidos, en orden */
    events(): IProviderDebugEvent[] {
        return this.data().filter(m => m.payloadType === EProviderDebugPayload.EVENT).map(m => m.event as IProviderDebugEvent)
    }

    /** último catálogo de providers recibido */
    providersCatalogue(): IProviderDebugProviderInfo[] | undefined {
        const all = this.data().filter(m => m.payloadType === EProviderDebugPayload.PROVIDERS)
        return all.length === 0 ? undefined : all[all.length - 1].providers
    }

    /** texts of the signals emitted by the channel */
    signals(): string[] {
        return this.parsed().filter(m => m.type === EInstanceMessageType.SIGNAL).map(m => String(m.text))
    }
}

/**
 * A fake provider reproducing the detail that matters in the real contract: subscribers are kept in
 * a Map indexed by the subscriber OBJECT, each with its own payload. That is what makes the
 * per-instance proxy necessary, so the mock cannot simplify it away.
 */
export class FakeProvider implements IProvider {
    readonly id: string
    readonly providesRouter: boolean
    readonly requiresApiKeyApi = false
    router: unknown = undefined
    routerAlias: string | undefined = undefined
    apiKeyApi: unknown = undefined
    subscribers: Map<IProviderSubscriber, unknown> = new Map()
    /** when defined, the provider publishes subscription help; otherwise it does not implement the method */
    getSubscriptionHelp?: () => IProviderDebugSubscriptionHelp

    constructor(id: string, providesRouter = false) {
        this.id = id
        this.providesRouter = providesRouter
    }

    /** makes the provider publish this help (chainable) */
    withHelp(help: IProviderDebugSubscriptionHelp): FakeProvider {
        this.getSubscriptionHelp = () => help
        return this
    }

    /** makes the provider blow up when asked for its help (chainable) */
    withBrokenHelp(err = 'boom'): FakeProvider {
        this.getSubscriptionHelp = () => { throw new Error(err) }
        return this
    }

    /*
        Makes the provider blow up when registering or unregistering the subscriber (chainable). It is no
        rare case: addSubscriber() is async and this channel does not await its promise, so a provider
        that fails there took the core down with an unhandled rejection. It happened with 'trivy'.
    */
    withBrokenSubscribe(err = 'boom subscribing'): FakeProvider {
        this.addSubscriber = async () => { throw new Error(err) }
        return this
    }

    withBrokenUnsubscribe(err = 'boom unsubscribing'): FakeProvider {
        this.removeSubscriber = async () => { throw new Error(err) }
        return this
    }

    addSubscriber = async (c: IProviderSubscriber, data: unknown) => { this.subscribers.set(c, data ?? {}) }
    removeSubscriber = async (c: IProviderSubscriber) => { this.subscribers.delete(c) }
    startProvider = async () => {}
    stopProvider = async () => {}

    /** fires an event at every subscriber, just as a real provider does */
    emit(event: unknown): void {
        for (const subscriber of this.subscribers.keys()) subscriber.processProviderEvent(this.id, event)
    }

    /** the payload a particular subscriber subscribed with */
    dataOf(c: IProviderSubscriber): unknown { return this.subscribers.get(c) }
}

/**
 * A fake pluvider: a plugin that also produces. Unlike a provider it has NO 'id' of its own (the core
 * composes it as 'plugin:<channelId>' and uses it as the registry key), no routers, nothing of the
 * provider machinery. All it shares is the addSubscriber/removeSubscriber pair — which is precisely
 * what makes it debuggable just like a provider.
 */
export class FakePluvider {
    /** the id composed by the core; here it only serves to build the registry, as the core does */
    readonly id: string
    readonly description: string
    subscribers: Map<IProviderSubscriber, unknown> = new Map()
    getSubscriptionHelp?: () => IProviderDebugSubscriptionHelp

    constructor(id: string, description = 'lo que produce este plugin') {
        this.id = id
        this.description = description
    }

    getPluviderData = () => ({ description: this.description, eventTypeName: 'IFakeAlert' })

    withHelp(help: IProviderDebugSubscriptionHelp): FakePluvider {
        this.getSubscriptionHelp = () => help
        return this
    }

    addSubscriber = async (c: IProviderSubscriber, data: unknown) => { this.subscribers.set(c, data ?? {}) }
    removeSubscriber = async (c: IProviderSubscriber) => { this.subscribers.delete(c) }
    startProvider = async () => {}
    stopProvider = async () => {}

    /** fires an event at every subscriber, with the composed id as its origin */
    emit(event: unknown): void {
        for (const subscriber of this.subscribers.keys()) subscriber.processProviderEvent(this.id, event)
    }
}

/*
    The clusterInfo the channel sees, with the HANDLE the core hands out today: the channel no longer
    takes the provider object from the registry, it asks for 'getProvider(id, this)' and subscribes
    through that.

    Here the handle is the minimum the channel uses. What matters to reproduce from the real one is that
    'subscribe' RETURNS whatever the provider returns: on that depends whether a provider that fails when
    registering ends up as an error on screen and not as an unattended rejection that takes the process down.
*/
export const makeClusterInfo = (providers: FakeProvider[], pluviders: FakePluvider[] = []) => {
    const pluviderMap = new Map(pluviders.map(p => [p.id, p]))
    return {
        providers,
        pluviders: pluviderMap,
        getProvider: (id: string) => {
            const target = id.startsWith('plugin:') ? pluviderMap.get(id) : providers.find(p => p.id === id)
            if (!target) return undefined
            return {
                id,
                subscribe: (c: IProviderSubscriber, data: unknown) => target.addSubscriber(c, data),
                updateSubscription: (c: IProviderSubscriber, data: unknown) => target.addSubscriber(c, data),
                unsubscribe: (c: IProviderSubscriber) => target.removeSubscriber(c)
            }
        }
    }
}

export const makeBackObj = () => {
    const logs: string[] = []
    const obj = {
        logInfo: (text: unknown) => { logs.push(String(text)) },
        logWarning: () => {},
        logError: () => {}
    }
    return { obj, logs }
}

export const instanceConfigFor = (instance: string, providerId: string, subscriptionData = '') => ({
    instance,
    accessKey: 'tester|permanent|cluster::::',
    data: { providerId, subscriptionData }
})
