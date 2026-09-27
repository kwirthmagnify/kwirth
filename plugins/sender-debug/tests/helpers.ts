// Common mocks for sender-debug.s unit tests (the provider-debug pattern).
// No infrastructure is brought up: a clusterInfo with a fake sender registry is injected and the
// WebSocket traffic is captured with MockWs.
import { EInstanceMessageType, ISenderMessage, ISenderResult } from '@kwirthmagnify/kwirth-common-back'
import { ESenderDebugPayload, ISenderDebugMessageResponse, ISenderDebugResult, ISenderDebugSenderInfo } from '../src/common/SenderDebugTypes'

// Fake WebSocket: it keeps every send() as a JSON string and offers typed views of the traffic.
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

    /** the last send result */
    lastResult(): ISenderDebugResult | undefined {
        const all = this.results()
        return all.length === 0 ? undefined : all[all.length - 1]
    }

    /** texts of the signals emitted by the channel */
    signals(): string[] {
        return this.parsed().filter(m => m.type === EInstanceMessageType.SIGNAL).map(m => String(m.text))
    }
}

/**
 * Fake sender. It reproduces what the channel looks at in the real contract: the registered
 * configurations, the declared type (optional), and whether it implements sendBatch — which is what
 * tells the genuine batch path from the one-by-one emulation.
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

    /** the sender returns an ISenderResult (a ticketing sender returns the ticket key) */
    withResult(result: ISenderResult): FakeSender {
        this.result = result
        return this
    }

    /** the sender blows up on send. It is THE case: through the core.s route this was lost in a log */
    withSendError(message = 'boom sending'): FakeSender {
        this.failure = message
        return this
    }

    /** the sender blows up when asked for its configuration */
    withConfigError(message = 'boom checking config'): FakeSender {
        this.configFailure = message
        return this
    }

    /** the sender implements sendBatch(): the batch path is its own, not the core.s emulation */
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
 * The core.s sender registry, faked. It reproduces the detail that gives the catalogue its meaning:
 * getSender() is LAZY — it instantiates on request — and listSenders() only sees what is already
 * instantiated, so an installed sender nobody has sent anything to yet does not show up there.
 */
export class FakeRegistry {
    private senders = new Map<string, FakeSender>()
    private instantiated = new Set<string>()
    /** when set, listInstalled() blows up (a core that cannot read its ConfigMap) */
    private installedFailure: string | undefined = undefined
    /** when set, listSenders() blows up */
    private liveFailure: string | undefined = undefined
    /** when set, getSender() blows up for that id */
    private resolveFailures = new Set<string>()
    /** installation metadata, by id */
    private metas = new Map<string, { displayName?: string, version?: string }>()

    /*
        OPTIONAL on purpose, just as in the real manager seen from the plugin: there are cores that do not
        carry it, and the channel has to go on giving a catalogue with whatever there is.
        withoutListInstalled() removes it so that route can be tested.
    */
    listInstalled?: () => Promise<Array<{ id: string, displayName?: string, version?: string, configNames: string[] }>>

    /** ids the registry returns TWICE, as the core does with a sender both installed and in dev */
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
                The core concatenates the index of installed ones with the dev ones WITHOUT deduplicating,
                so the second copy goes at the end and with the dev metadata — which is exactly the order
                reproduced here.
            */
            for (const [id, meta] of this.duplicated) {
                const original = rows.find(r => r.id === id)
                if (original) rows.push({ ...original, ...meta })
            }
            return rows
        }
    }

    /** the same sender, again at the end of the list, as the core serves it in a dev environment */
    withDuplicate(id: string, meta: { displayName?: string, version?: string } = { version: 'dev' }): FakeRegistry {
        this.duplicated.set(id, meta)
        return this
    }

    /** registers a sender that is INSTALLED but not instantiated yet */
    install(sender: FakeSender, meta: { displayName?: string, version?: string } = {}): FakeRegistry {
        this.senders.set(sender.id, sender)
        this.metas.set(sender.id, meta)
        return this
    }

    /** registers a sender that is already INSTANTIATED (somebody sent to it earlier) */
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

    /** a core older than listInstalled(): all it can say is what is instantiated */
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

    /** is it instantiated right now? (to assert the lazy effect of the first send) */
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
