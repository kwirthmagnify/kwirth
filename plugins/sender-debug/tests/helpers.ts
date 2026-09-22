// Mocks comunes para los tests unit de sender-debug (patrón provider-debug).
// No se levanta infraestructura: se inyecta un clusterInfo con un registro de senders falso y se
// captura el tráfico WebSocket con MockWs.
import { EInstanceMessageType, ISenderMessage, ISenderResult } from '@kwirthmagnify/kwirth-common-back'
import { ESenderDebugPayload, ISenderDebugMessageResponse, ISenderDebugResult, ISenderDebugSenderInfo } from '../src/common/SenderDebugTypes'

// WebSocket falso: guarda cada send() como string JSON y ofrece vistas tipadas del tráfico.
export class MockWs {
    readyState = 1
    bufferedAmount = 0
    sent: string[] = []
    send(s: string): void { this.sent.push(s) }
    close(): void {}
    parsed(): Array<Record<string, unknown>> { return this.sent.map(s => JSON.parse(s) as Record<string, unknown>) }
    clear(): void { this.sent = [] }

    private data(): ISenderDebugMessageResponse[] {
        return this.parsed().filter(m => m.type === EInstanceMessageType.DATA) as unknown as ISenderDebugMessageResponse[]
    }

    /** último catálogo de senders recibido */
    senders(): ISenderDebugSenderInfo[] | undefined {
        const all = this.data().filter(m => m.payloadType === ESenderDebugPayload.SENDERS)
        return all.length === 0 ? undefined : all[all.length - 1].senders
    }

    /** resultados de envío recibidos, en orden */
    results(): ISenderDebugResult[] {
        return this.data().filter(m => m.payloadType === ESenderDebugPayload.RESULT).map(m => m.result as ISenderDebugResult)
    }

    /** el último resultado de envío */
    lastResult(): ISenderDebugResult | undefined {
        const all = this.results()
        return all.length === 0 ? undefined : all[all.length - 1]
    }

    /** textos de las señales emitidas por el canal */
    signals(): string[] {
        return this.parsed().filter(m => m.type === EInstanceMessageType.SIGNAL).map(m => String(m.text))
    }
}

/**
 * Sender falso. Reproduce lo que el canal mira del contrato real: las configuraciones dadas de alta,
 * el tipo declarado (opcional), y si implementa o no sendBatch — que es lo que distingue la ruta de
 * lote de verdad de la emulación uno a uno.
 */
export class FakeSender {
    readonly id: string
    senderType?: 'filter' | 'output'
    configNames: string[]
    /** cada send() recibido, en orden */
    received: Array<{ configName: string, message: ISenderMessage }> = []
    /** cada sendBatch() recibido, en orden */
    receivedBatches: Array<{ configName: string, messages: ISenderMessage[] }> = []
    sendBatch?: (configName: string, messages: ISenderMessage[]) => Promise<ISenderResult | void>
    private result: ISenderResult | undefined = undefined
    private failure: string | undefined = undefined
    private configFailure: string | undefined = undefined

    constructor(id: string, configNames: string[] = ['default']) {
        this.id = id
        this.configNames = configNames
    }

    /** el sender devuelve un ISenderResult (un sender de ticketing devuelve la clave del ticket) */
    withResult(result: ISenderResult): FakeSender {
        this.result = result
        return this
    }

    /** el sender revienta al enviar. Es EL caso: por la vía del core esto se perdía en un log */
    withSendError(message = 'boom sending'): FakeSender {
        this.failure = message
        return this
    }

    /** el sender revienta al preguntarle por su configuración */
    withConfigError(message = 'boom checking config'): FakeSender {
        this.configFailure = message
        return this
    }

    /** el sender implementa sendBatch(): la ruta de lote es suya, no la emulación del core */
    withBatch(): FakeSender {
        this.sendBatch = async (configName: string, messages: ISenderMessage[]) => {
            this.receivedBatches.push({ configName, messages })
            if (this.failure) throw new Error(this.failure)
            return this.result
        }
        return this
    }

    withType(senderType: 'filter' | 'output'): FakeSender {
        this.senderType = senderType
        return this
    }

    hasConfig = (configName: string): boolean => {
        if (this.configFailure) throw new Error(this.configFailure)
        return this.configNames.includes(configName)
    }

    getConfigNames = (): string[] => this.configNames

    send = async (configName: string, message: ISenderMessage): Promise<ISenderResult | void> => {
        this.received.push({ configName, message })
        if (this.failure) throw new Error(this.failure)
        return this.result
    }
}

/**
 * El registro de senders del core, falseado. Reproduce el detalle que da sentido al catálogo:
 * getSender() es PEREZOSO — instancia al pedirlo — y listSenders() solo ve lo ya instanciado, así
 * que un sender instalado al que nadie ha enviado todavía no sale ahí.
 */
export class FakeRegistry {
    private senders = new Map<string, FakeSender>()
    private instantiated = new Set<string>()
    /** si se pone, listInstalled() revienta (un core que no puede leer su ConfigMap) */
    private installedFailure: string | undefined = undefined
    /** si se pone, listSenders() revienta */
    private liveFailure: string | undefined = undefined
    /** si se pone, getSender() revienta para ese id */
    private resolveFailures = new Set<string>()
    /** metadatos de instalación, por id */
    private metas = new Map<string, { displayName?: string, version?: string }>()

    /*
        OPCIONAL a propósito, igual que en el manager real visto desde el plugin: hay cores que no lo
        traen, y el canal tiene que seguir dando un catálogo con lo que haya. withoutListInstalled()
        lo quita para poder probar ese camino.
    */
    listInstalled?: () => Promise<Array<{ id: string, displayName?: string, version?: string, configNames: string[] }>>

    /** ids que el registro devuelve DOS veces, como hace el core con un sender instalado y en dev */
    private duplicated = new Map<string, { displayName?: string, version?: string }>()

    constructor() {
        this.listInstalled = async () => {
            if (this.installedFailure) throw new Error(this.installedFailure)
            const rows = Array.from(this.senders.values()).map(s => ({
                id: s.id,
                ...this.metas.get(s.id),
                configNames: s.getConfigNames()
            }))
            /*
                El core concatena el indice de instalados con los de dev SIN deduplicar, asi que la
                segunda copia va al final y con los metadatos de dev — que es exactamente el orden
                que se reproduce aqui.
            */
            for (const [id, meta] of this.duplicated) {
                const original = rows.find(r => r.id === id)
                if (original) rows.push({ ...original, ...meta })
            }
            return rows
        }
    }

    /** el mismo sender, otra vez al final de la lista, como lo sirve el core en un entorno de dev */
    withDuplicate(id: string, meta: { displayName?: string, version?: string } = { version: 'dev' }): FakeRegistry {
        this.duplicated.set(id, meta)
        return this
    }

    /** da de alta un sender INSTALADO pero todavía no instanciado */
    install(sender: FakeSender, meta: { displayName?: string, version?: string } = {}): FakeRegistry {
        this.senders.set(sender.id, sender)
        this.metas.set(sender.id, meta)
        return this
    }

    /** da de alta un sender ya INSTANCIADO (alguien le envió antes) */
    instantiate(sender: FakeSender, meta: { displayName?: string, version?: string } = {}): FakeRegistry {
        this.install(sender, meta)
        this.instantiated.add(sender.id)
        return this
    }

    withInstalledError(message = 'boom listing installed'): FakeRegistry {
        this.installedFailure = message
        return this
    }

    withLiveError(message = 'boom listing live'): FakeRegistry {
        this.liveFailure = message
        return this
    }

    withResolveError(senderId: string): FakeRegistry {
        this.resolveFailures.add(senderId)
        return this
    }

    /** un core anterior a listInstalled(): solo sabe decir qué hay instanciado */
    withoutListInstalled(): FakeRegistry {
        delete this.listInstalled
        return this
    }

    getSender = (id: string): FakeSender | undefined => {
        if (this.resolveFailures.has(id)) throw new Error(`boom resolving ${id}`)
        const sender = this.senders.get(id)
        if (!sender) return undefined
        this.instantiated.add(id)   // perezoso: pedirlo lo instancia, igual que el core
        return sender
    }

    listSenders = (): Array<{ id: string, configNames: string[] }> => {
        if (this.liveFailure) throw new Error(this.liveFailure)
        return Array.from(this.instantiated).map(id => ({ id, configNames: this.senders.get(id)!.getConfigNames() }))
    }

    /** ¿está instanciado ahora mismo? (para asertar el efecto perezoso del primer envío) */
    isInstantiated(id: string): boolean { return this.instantiated.has(id) }
}

export const makeClusterInfo = (registry?: FakeRegistry) => ({ senders: registry })

export const makeBackObj = () => {
    const logs: string[] = []
    const warnings: string[] = []
    const obj = {
        logInfo: (text: unknown) => { logs.push(String(text)) },
        logWarning: (text: unknown) => { warnings.push(String(text)) },
        logError: () => {}
    }
    return { obj, logs, warnings }
}

export const instanceConfigFor = (instance: string) => ({
    instance,
    accessKey: 'tester|permanent|cluster::::',
    data: { senderId: '', configName: '' }
})
