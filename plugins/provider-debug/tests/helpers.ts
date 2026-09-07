// Mocks comunes para los tests unit de provider-debug (patrón censor).
// No se levanta infraestructura: se inyecta un clusterInfo con providers falsos y se captura
// el tráfico WebSocket con MockWs.
import { EInstanceMessageType, IProvider, IProviderSubscriber } from '@kwirthmagnify/kwirth-common-back'
import { EProviderDebugPayload, IProviderDebugEvent, IProviderDebugMessageResponse, IProviderDebugProviderInfo, IProviderDebugSubscriptionHelp } from '../src/common/ProviderDebugTypes'

// WebSocket falso: guarda cada send() como string JSON y ofrece vistas tipadas del tráfico.
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

    /** textos de las señales emitidas por el canal */
    signals(): string[] {
        return this.parsed().filter(m => m.type === EInstanceMessageType.SIGNAL).map(m => String(m.text))
    }
}

/**
 * Provider falso que reproduce el detalle que importa del contrato real: los subscribers se
 * guardan en un Map indexado por el OBJETO subscriber, con su propio payload. Es lo que hace
 * que el proxy por instancia sea necesario, así que el mock no puede simplificarlo.
 */
export class FakeProvider implements IProvider {
    readonly id: string
    readonly providesRouter: boolean
    readonly requiresApiKeyApi = false
    router: unknown = undefined
    routerAlias: string | undefined = undefined
    apiKeyApi: unknown = undefined
    subscribers: Map<IProviderSubscriber, unknown> = new Map()
    /** si se define, el provider publica ayuda de suscripción; si no, no implementa el método */
    getSubscriptionHelp?: () => IProviderDebugSubscriptionHelp

    constructor(id: string, providesRouter = false) {
        this.id = id
        this.providesRouter = providesRouter
    }

    /** hace que el provider publique esta ayuda (encadenable) */
    withHelp(help: IProviderDebugSubscriptionHelp): FakeProvider {
        this.getSubscriptionHelp = () => help
        return this
    }

    /** hace que el provider reviente al pedirle la ayuda (encadenable) */
    withBrokenHelp(err = 'boom'): FakeProvider {
        this.getSubscriptionHelp = () => { throw new Error(err) }
        return this
    }

    addSubscriber = async (c: IProviderSubscriber, data: unknown) => { this.subscribers.set(c, data ?? {}) }
    removeSubscriber = async (c: IProviderSubscriber) => { this.subscribers.delete(c) }
    startProvider = async () => {}
    stopProvider = async () => {}

    /** dispara un evento a todos los subscribers, igual que hace un provider real */
    emit(event: unknown): void {
        for (const subscriber of this.subscribers.keys()) subscriber.processProviderEvent(this.id, event)
    }

    /** payload con el que se suscribió un subscriber concreto */
    dataOf(c: IProviderSubscriber): unknown { return this.subscribers.get(c) }
}

export const makeClusterInfo = (providers: FakeProvider[]) => ({ providers })

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
