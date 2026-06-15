import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, EInstanceConfigView, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject, IDaemonInstanceConfig, IDaemonEvent, IDaemonManager } from '@kwirthmagnify/kwirth-common'
import { ILlm, ILlmProvider, STORAGE_KEY_LLMS, STORAGE_KEY_PROVIDERS } from '@kwirthmagnify/kwirth-common-ai'
import { loadModels } from '@kwirthmagnify/kwirth-common-ai/back'
import { randomUUID } from 'crypto'
import { ECensorCommand, ICensorInstanceConfig, ICensorSession } from '../common/CensorTypes'
import { generateSessionName } from './nameGenerator'

const PROVIDERS_AVAILABLE = ['google', 'openai', 'openrouter', 'mistral', 'groq', 'deepseek']



interface ICensorCommandMessage extends IInstanceMessage {
    msgtype: 'censormessage'
    command: ECensorCommand
    data?: unknown
}

interface ICensorMessage {
    msgtype: 'censormessage'
    channel: string
    action: EInstanceMessageAction
    flow: EInstanceMessageFlow
    type: EInstanceMessageType
    instance: string
    kind: 'received' | 'business' | 'llminput' | 'llmoutput' | 'llmwarning' | 'llmerror' | 'regex' | 'status' | 'config' | 'configsaved' | 'providers' | 'analyzing' | 'stats' | 'regexstats' | 'assets' | 'tags' | 'sessions' | 'sessionstarted' | 'sessionstopped' | 'sessionconnected' | 'sessiondisconnected'
    timestamp?: string
    analyzing?: boolean
    text?: string
    lines?: { text: string, namespace: string, pod: string, container: string }[]
    namespace?: string
    pod?: string
    container?: string
    pattern?: string
    example?: string
    explanation?: string
    tags?: string[]
    processedCount?: number
    llmCount?: number
    tokensIn?: number
    tokensOut?: number
    pendingCount?: number
    instanceConfig?: ICensorInstanceConfig
    configs?: ICensorInstanceConfig[]
    llms?: ILlm[]
    providers?: ILlmProvider[]
    providersAvailable?: string[]
    assets?: { namespace: string, pod: string, container: string }[]
    sessions?: ICensorSession[]
    sessionId?: string
    sessionDescription?: string
    regexes?: { pattern: string, example: string, explanation: string, origin?: string }[]
    runnerKey?: string
    runnerStats?: Record<string, { processedCount: number, llmCount: number, llmLinesCount: number, totalBytesProcessed: number, tokensIn: number, tokensOut: number, syslogCount: number, pendingCount: number, analyzing: boolean }>
    runnerRegexes?: Record<string, { pattern: string, example: string, explanation: string, matches: number, origin?: string }[]>
}

interface IAsset {
    namespace: string
    pod: string
    container: string
}

interface IInstance {
    instanceId: string
    accessKey: AccessKey
    instanceConfig: IInstanceConfig
    cfg: ICensorInstanceConfig
    assets: IAsset[]
    paused: boolean
    analyzing: boolean
    llm?: ILlm
    sessionId?: string
    sessionUnsub?: () => void
    ephemeral?: boolean
    ephemeralDescription?: string
    _configReady?: Promise<void>
    _startupPromise?: Promise<void>
}

export class CensorChannel {
    readonly channelId = 'censor'
    readonly requirements = {
        storage: true,
        providers: ['events', 'business']
    }
    clusterInfo: unknown
    backChannelObject: IBackChannelObject
    connections: { webSocket: WebSocket, lastRefresh: number, instances: IInstance[] }[] = []
    providers: ILlmProvider[] = []

    constructor(clusterInfo: unknown, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    startChannel = async () => {
        const stored: ILlmProvider[] = (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_PROVIDERS, true)) ?? []
        this.providers = stored
        await loadModels(this.providers, this.backChannelObject)
    }

    private rebuildBusinessSubscription(): void {
        const spacesMap = new Map<string, Set<string>>()
        const addSpace = (cfg: ICensorInstanceConfig) => {
            this.backChannelObject.logInfo?.(`[censor] rebuildBusiness: businessPath='${cfg.businessPath}' space='${cfg.space}' type='${cfg.type}'`)
            if (!cfg.businessPath) return
            const spaceName = cfg.space ?? ''
            if (!spaceName) return
            const types = spacesMap.get(spaceName) ?? new Set<string>()
            types.add(cfg.type ?? '')
            spacesMap.set(spaceName, types)
        }
        for (const socket of this.connections) {
            for (const instance of socket.instances) addSpace(instance.cfg)
        }
        const spaces = Array.from(spacesMap.entries()).map(([name, types]) => ({ name, types: Array.from(types) }))
        this.backChannelObject.logInfo?.(`[censor] rebuildBusiness: subscribing with spaces=${JSON.stringify(spaces)}`)
        if (spaces.length > 0) {
            (this.clusterInfo as { addSubscriber: (id: string, c: unknown, config: unknown) => void }).addSubscriber('business', this, { spaces })
        }
    }

    getChannelData = (): BackChannelData => ({
        id: 'censor',
        routable: false,
        pauseable: true,
        modifiable: false,
        reconnectable: false,
        metrics: false,
        sources: [EClusterType.KUBERNETES],
        endpoints: [],
        websocket: false,
        cluster: true,
        resourced: true
    })

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'filter', 'view', 'cluster'].indexOf(scope)
    }

    processProviderEvent(providerId: string, event: unknown): void {
        if (providerId === 'events') {
            const { type, obj } = event as { type: string, obj: { kind: string, metadata: { name: string, namespace: string } } }
            if (obj.kind !== 'Pod' || type !== 'DELETED') return
            const podName = obj.metadata.name
            const namespace = obj.metadata.namespace
            // daemon handles pod deletion via its own events provider subscription — no channel action needed
            for (const socket of this.connections)
                for (const instance of socket.instances)
                    instance.assets = instance.assets.filter(a => !(a.pod === podName && a.namespace === namespace))
            return
        }

        // business events are handled directly by the daemon's own processProviderEvent
    }

    async processCommand(webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> {
        const msg = instanceMessage as ICensorCommandMessage
        if (msg.action !== EInstanceMessageAction.COMMAND) return false

        const instance = this.getInstance(webSocket, msg.instance)
        if (!instance) return false

        switch (msg.command) {
            case ECensorCommand.CONFIGGET:
                await this.executeConfigGet(webSocket, instance)
                return true
            case ECensorCommand.CONFIGSET: {
                const raw = msg.data as ICensorInstanceConfig & { _llms?: ILlm[], _allConfigs?: ICensorInstanceConfig[] }
                const { _llms, _allConfigs, ...cfg } = raw
                instance.cfg = cfg as ICensorInstanceConfig
                if (_llms) await this.backChannelObject.writeStorageCommon!(STORAGE_KEY_LLMS, false, _llms)
                const llmList: ILlm[] = _llms ?? (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
                instance.llm = llmList.find((l: ILlm) => l.id === instance.cfg.llmId)
                // If the frontend sent the full config list, save it atomically here (no separate CONFIGSAVE race)
                if (_allConfigs) {
                    await this.backChannelObject.writeStorage!('censor-configs', false, _allConfigs)
                }
                const activeConfigs: ICensorInstanceConfig[] | undefined = _allConfigs
                    ? _allConfigs.filter(c => c.active)
                    : undefined
                const dm = this.backChannelObject.daemonManager
                if (instance.ephemeral && instance.sessionId && dm) {
                    if (instance.sessionUnsub) { instance.sessionUnsub(); instance.sessionUnsub = undefined }
                    await dm.stopInstance(instance.sessionId).catch(() => {})
                    instance.sessionId = undefined
                    webSocket.send(JSON.stringify({ msgtype: 'censormessage', channel: 'censor', action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.DATA, instance: instance.instanceId, kind: 'configsaved' } as ICensorMessage))
                    instance._startupPromise = this.autoStartDaemon(webSocket, instance, dm, activeConfigs)
                        .finally(() => { instance!._startupPromise = undefined })
                    await instance._startupPromise
                } else if (instance.sessionId && dm) {
                    console.log(`[censor-back] CONFIGSET hot-reload: logstreamEnabled=${instance.cfg.logstreamEnabled} sources=${JSON.stringify(instance.cfg.logstreamSources)} assets=${instance.assets.length}`)
                    await dm.sendCommand(instance.sessionId, 'configset', { ...instance.cfg, _llms: llmList }).catch(() => {})
                    for (const asset of instance.assets) {
                        await dm.directAddObject(instance.sessionId, asset.namespace, asset.pod, asset.container).catch(() => {})
                    }
                } else if (dm) {
                    // No session yet (channel just opened) — start ephemeral daemon now
                    if (!instance._startupPromise) {
                        instance._startupPromise = this.autoStartDaemon(webSocket, instance, dm, activeConfigs)
                            .finally(() => { instance!._startupPromise = undefined })
                    }
                    await instance._startupPromise
                }
                await this.executeConfigGet(webSocket, instance, llmList)
                this.rebuildBusinessSubscription()
                return true
            }
            case ECensorCommand.PROVIDERSAVAILABLE:
                webSocket.send(JSON.stringify({
                    msgtype: 'censormessage', channel: 'censor',
                    action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE,
                    type: EInstanceMessageType.DATA, instance: instance.instanceId,
                    kind: 'providers', providersAvailable: PROVIDERS_AVAILABLE
                } as ICensorMessage))
                return true
            case ECensorCommand.PROVIDERSGET:
                webSocket.send(JSON.stringify({
                    msgtype: 'censormessage', channel: 'censor',
                    action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE,
                    type: EInstanceMessageType.DATA, instance: instance.instanceId,
                    kind: 'providers', providers: this.providers
                } as ICensorMessage))
                return true
            case ECensorCommand.CONFIGSAVE: {
                const cfgToSave = msg.data as ICensorInstanceConfig
                let configs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!('censor-configs', false)) ?? []
                const idx = configs.findIndex(c => c.name === cfgToSave.name && c.version === cfgToSave.version)
                if (idx >= 0) configs[idx] = cfgToSave
                else configs.push(cfgToSave)
                await this.backChannelObject.writeStorage!('censor-configs', false, configs)
                await this.executeConfigGet(webSocket, instance)
                return true
            }
            case ECensorCommand.CONFIGDELETE: {
                const { name, version } = msg.data as { name: string, version: string }
                const configs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!('censor-configs', false)) ?? []
                const filtered = configs.filter(c => !(c.name === name && c.version === version))
                await this.backChannelObject.writeStorage!('censor-configs', false, filtered)
                await this.executeConfigGet(webSocket, instance)
                return true
            }
            case ECensorCommand.ANALYZESTART:
                instance.analyzing = true
                if (instance.sessionId) {
                    const dm = this.backChannelObject.daemonManager
                    if (dm) {
                        const llms: ILlm[] = (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
                        const savedConfigs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!('censor-configs', false)) ?? []
                        const activeConfigs = savedConfigs.filter(c => c.active)
                        const allActive = activeConfigs.length > 0 ? activeConfigs : [instance.cfg]
                        const activeKeys = new Set(allActive.map(c => `${c.name}:${c.version}`))
                        // Sync runners: add missing, remove stale
                        const stats = await dm.sendCommand(instance.sessionId, 'statsget', null) as { runners?: Record<string, unknown> } | null
                        const currentKeys = new Set(Object.keys(stats?.runners ?? {}))
                        for (const rk of currentKeys) { if (!activeKeys.has(rk)) await dm.sendCommand(instance.sessionId, 'runnerremove', rk) }
                        for (const cfg of allActive) { if (!currentKeys.has(`${cfg.name}:${cfg.version}`)) await dm.sendCommand(instance.sessionId, 'configset', { ...cfg, _llms: llms }) }
                        dm.sendCommand(instance.sessionId, 'analyzestart', null)
                    }
                }
                webSocket.send(JSON.stringify({ msgtype: 'censormessage', channel: 'censor', action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED, type: EInstanceMessageType.DATA, instance: instance.instanceId, kind: 'analyzing', analyzing: true } as ICensorMessage))
                return true
            case ECensorCommand.ANALYZESTOP:
                instance.analyzing = false
                if (instance.sessionId) {
                    const dm = this.backChannelObject.daemonManager
                    if (dm) dm.sendCommand(instance.sessionId, 'analyzestop', msg.data ?? null)
                }
                webSocket.send(JSON.stringify({ msgtype: 'censormessage', channel: 'censor', action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED, type: EInstanceMessageType.DATA, instance: instance.instanceId, kind: 'analyzing', analyzing: false } as ICensorMessage))
                return true
            case ECensorCommand.REGEXDELETE: {
                const pattern = msg.data as string
                if (instance.sessionId) {
                    const dm = this.backChannelObject.daemonManager
                    if (dm) dm.sendCommand(instance.sessionId, 'regexdelete', pattern)
                }
                return true
            }
            case ECensorCommand.REGEXADD: {
                const addPayload = msg.data as { runnerKey: string, pattern: string, explanation: string }
                if (instance.sessionId) {
                    const dm = this.backChannelObject.daemonManager
                    if (dm) dm.sendCommand(instance.sessionId, 'regexadd', addPayload)
                }
                return true
            }
            case ECensorCommand.PROVIDERSSET:
                const newProviders = msg.data as ILlmProvider[]
                this.providers = newProviders
                await this.backChannelObject.writeStorageCommon!(STORAGE_KEY_PROVIDERS, true, newProviders)
                await loadModels(this.providers, this.backChannelObject)
                await this.executeConfigGet(webSocket, instance)
                return true
            case ECensorCommand.SESSIONLIST: {
                const dm = this.backChannelObject.daemonManager
                if (!dm) return false
                const sessions = await this.buildSessionList(dm, dm.listInstances('censor'))
                webSocket.send(JSON.stringify({ msgtype: 'censormessage', channel: 'censor', action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.DATA, instance: instance.instanceId, kind: 'sessions', sessions } as ICensorMessage))
                return true
            }
            case ECensorCommand.SESSIONSTART: {
                // Fire-and-forget: create a persistent session in the background, keep current channel on the ephemeral session
                const dm = this.backChannelObject.daemonManager
                if (!dm) return false
                const { description } = msg.data as { description: string }
                const id = randomUUID()
                const ic = instance.instanceConfig
                const isCluster = ic.view === EInstanceConfigView.CLUSTER
                const llmsForDaemon: ILlm[] = (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
                const savedConfigs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!('censor-configs', false)) ?? []
                const activeConfigs = savedConfigs.filter(c => c.active)
                const allActive: ICensorInstanceConfig[] = activeConfigs.length > 0 ? activeConfigs : [instance.cfg]
                console.log(`[censor-back] SESSIONSTART (fire-and-forget): isCluster=${isCluster} activeConfigs=${allActive.map(c => c.name + ':' + c.version).join(',')}`)
                const daemonInstanceConfig: IDaemonInstanceConfig = {
                    id, daemonId: 'censor', description,
                    view: ic.view, namespace: ic.namespace,
                    ...(ic.group ? { group: ic.group } : {}),
                    ...(ic.pod ? { pod: ic.pod } : {}),
                    ...(ic.container ? { container: ic.container } : {}),
                    data: { ...instance.cfg, _llms: llmsForDaemon, scope: isCluster ? 'cluster' : 'resource' }, started: true,
                    createdAt: new Date().toISOString()
                }
                await dm.createInstance('censor', daemonInstanceConfig)
                for (const activeCfg of allActive) {
                    console.log(`[censor-back] SESSIONSTART configset runner: ${activeCfg.name}:${activeCfg.version}`)
                    await dm.sendCommand(id, 'configset', { ...activeCfg, _llms: llmsForDaemon })
                }
                await dm.sendCommand(id, 'analyzestart', null)
                if (this.providers.length > 0) await dm.sendCommand(id, 'providersset', this.providers)
                if (!isCluster) {
                    for (const asset of instance.assets) {
                        await dm.directAddObject(id, asset.namespace, asset.pod, asset.container)
                    }
                }
                // Don't touch instance.sessionId or sessionUnsub — ephemeral session stays connected
                const sessions = await this.buildSessionList(dm, dm.listInstances('censor'))
                webSocket.send(JSON.stringify({ msgtype: 'censormessage', channel: 'censor', action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.DATA, instance: instance.instanceId, kind: 'sessions', sessions } as ICensorMessage))
                this.rebuildBusinessSubscription()
                return true
            }
            case ECensorCommand.SESSIONCONNECT: {
                const dm = this.backChannelObject.daemonManager
                if (!dm) return false
                const sessionId = msg.data as string
                const allInstances = dm.listInstances('censor')
                const target = allInstances.find(s => s.id === sessionId)
                if (!target) return false
                if (instance.sessionUnsub) instance.sessionUnsub()
                if (instance.ephemeral && instance.sessionId) {
                    await dm.stopInstance(instance.sessionId).catch(() => {})
                    instance.ephemeral = false
                }
                instance.sessionId = sessionId

                const subscribeToSession = () => {
                    if (instance.sessionUnsub) instance.sessionUnsub()
                    instance.sessionUnsub = dm.subscribe(sessionId, (event: IDaemonEvent) => this.forwardDaemonEvent(webSocket, instance, event))
                }
                subscribeToSession()

                // Gather all session state before notifying frontend (avoids timing issues with separate messages)
                type IRunnerStat = { processedCount: number, llmCount: number, llmLinesCount: number, totalBytesProcessed: number, tokensIn: number, tokensOut: number, syslogCount: number, pendingCount: number, analyzing: boolean }
                type IStats = { processedCount: number, llmCount: number, tokensIn: number, tokensOut: number, analyzing: boolean, runners?: Record<string, IRunnerStat> }
                type IRegexEntry = { pattern: string, example: string, explanation: string, matches: number, origin?: string }
                let stats: IStats | null = null
                let regexes: IRegexEntry[] = []
                let runnerRegexes: Record<string, IRegexEntry[]> | undefined = undefined
                try {
                    stats = await dm.sendCommand(sessionId, 'statsget', null) as IStats | null
                    if (!stats) {
                        // Daemon instance not running (e.g. server restarted) — seed it from channel assets
                        for (const asset of instance.assets) await dm.directAddObject(sessionId, asset.namespace, asset.pod, asset.container)
                        subscribeToSession()
                        stats = await dm.sendCommand(sessionId, 'statsget', null) as IStats | null
                    }
                    const regexResult = await dm.sendCommand(sessionId, 'regexget', null) as { regexes: IRegexEntry[], runnerRegexes?: Record<string, IRegexEntry[]> } | null
                    if (regexResult?.regexes) regexes = regexResult.regexes
                    if (regexResult?.runnerRegexes) runnerRegexes = regexResult.runnerRegexes
                } catch { /* ignore */ }

                const sessions = await this.buildSessionList(dm, allInstances)
                webSocket.send(JSON.stringify({
                    msgtype: 'censormessage', channel: 'censor',
                    action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE,
                    type: EInstanceMessageType.DATA, instance: instance.instanceId,
                    kind: 'sessionconnected', sessionId, sessionDescription: target.description, sessions,
                    processedCount: stats?.processedCount ?? 0,
                    llmCount: stats?.llmCount ?? 0,
                    tokensIn: stats?.tokensIn ?? 0,
                    tokensOut: stats?.tokensOut ?? 0,
                    analyzing: stats?.analyzing ?? false,
                    regexes,
                    ...(stats?.runners ? { runnerStats: stats.runners } : {}),
                    ...(runnerRegexes ? { runnerRegexes } : {})
                } as ICensorMessage))
                this.rebuildBusinessSubscription()
                return true
            }
            case ECensorCommand.SESSIONDISCONNECT: {
                const disconnectedSessionId = instance.sessionId
                if (instance.sessionUnsub) {
                    instance.sessionUnsub()
                    instance.sessionUnsub = undefined
                    instance.sessionId = undefined
                }
                webSocket.send(JSON.stringify({ msgtype: 'censormessage', channel: 'censor', action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.DATA, instance: instance.instanceId, kind: 'sessiondisconnected' } as ICensorMessage))
                return true
            }
            case ECensorCommand.SESSIONSTOP: {
                const dm = this.backChannelObject.daemonManager
                if (!dm) return false
                const sessionId = msg.data as string
                if (instance.sessionId === sessionId && instance.sessionUnsub) {
                    instance.sessionUnsub()
                    instance.sessionUnsub = undefined
                    instance.sessionId = undefined
                }
                await dm.stopInstance(sessionId)
                const sessions = await this.buildSessionList(dm, dm.listInstances('censor'))
                webSocket.send(JSON.stringify({ msgtype: 'censormessage', channel: 'censor', action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.DATA, instance: instance.instanceId, kind: 'sessionstopped', sessionId, sessions } as ICensorMessage))
                return true
            }
        }
    }

    private async buildSessionList(dm: IDaemonManager, instances: IDaemonInstanceConfig[]): Promise<ICensorSession[]> {
        const censorInstances = instances.filter(s => s.daemonId === 'censor')
        return Promise.all(censorInstances.map(async s => {
            let analyzing = false
            try {
                const stats = await dm.sendCommand(s.id, 'statsget', null) as { analyzing?: boolean } | null
                analyzing = stats?.analyzing ?? false
            } catch { /* ignore */ }
            return { id: s.id, description: s.description, namespace: s.namespace, group: s.group, pod: s.pod, container: s.container, createdAt: s.createdAt, analyzing }
        }))
    }

    private forwardDaemonEvent(webSocket: WebSocket, instance: IInstance, event: IDaemonEvent): void {
        if (event.type === 'assets' && Array.isArray((event.data as any).assets)) {
            // In cluster mode the daemon owns the asset list; in resource mode the plugin back manages it
            if (instance.instanceConfig.view === EInstanceConfigView.CLUSTER) {
                instance.assets = (event.data as any).assets as IAsset[]
            }
        }
        if (event.type === 'llmwarning') {
            const sid = instance.cfg.senderId
            const scn = instance.cfg.senderConfigName
            if (sid && scn) {
                const tagStr = (event.data as any).tags?.length > 0 ? ` [${(event.data as any).tags.join(', ')}]` : ''
                this.backChannelObject.senders?.send(sid, scn, {
                    body: `${(event.data as any).text}\n\n${(event.data as any).explanation}${tagStr}`,
                    subject: `Censor warning${tagStr}`,
                    level: 'warning'
                })
            }
        }
        const ws = webSocket as any
        if (ws.readyState !== 1) return
        // Backpressure: drop display-only events when WebSocket can't drain fast enough
        const LOW_PRIORITY = new Set(['received', 'stats', 'regexstats', 'llminput', 'llmoutput', 'tags'])
        if (LOW_PRIORITY.has(event.type) && ws.bufferedAmount > 256_000) return
        webSocket.send(JSON.stringify({
            msgtype: 'censormessage', channel: 'censor',
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA, instance: instance.instanceId,
            kind: event.type as ICensorMessage['kind'],
            ...(event.data as object)
        }))
    }

    async endpointRequest(_endpoint: string, _req: unknown, _res: unknown): Promise<void> {}

    async websocketRequest(_newWebSocket: WebSocket): Promise<void> {}

    containsAsset = (webSocket: WebSocket, ns: string, pod: string, container: string): boolean => {
        const socket = this.connections.find(s => s.webSocket === webSocket)
        return socket?.instances.some(i => i.assets.some(a => a.namespace === ns && a.pod === pod && a.container === container)) ?? false
    }

    containsInstance = (instanceId: string): boolean => {
        return this.connections.some(s => s.instances.some(i => i.instanceId === instanceId))
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, ns: string, pod: string, container: string): Promise<boolean> => {
        let socket = this.connections.find(s => s.webSocket === webSocket)
        if (!socket) {
            const len = this.connections.push({ webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.connections[len - 1]
        }

        let instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            const len = socket.instances.push({
                instanceId: instanceConfig.instance,
                accessKey: accessKeyDeserialize(instanceConfig.accessKey),
                instanceConfig,
                cfg: { name: '', version: '1', llmId: '', system: '', batchSize: 50, exampleJson: '{"patterns":[""]}', temperature: 0.2, active: false },
                assets: [],
                paused: false,
                analyzing: false
            })
            instance = socket.instances[len - 1]

            instance._configReady = (async () => {
                let savedCfg: ICensorInstanceConfig | null = null
                {
                    const rawConfigs = await this.backChannelObject.readStorage!('censor-configs', false)
                    const configs: ICensorInstanceConfig[] = (typeof rawConfigs === 'string' ? JSON.parse(rawConfigs) : rawConfigs) ?? []
                    savedCfg = configs.find(c => c.active) ?? savedCfg
                }
                const defaultCfg: ICensorInstanceConfig = { name: '', version: '1', llmId: '', system: '', batchSize: 50, exampleJson: '{"patterns":[""]}', temperature: 0.2, active: false }
                const cfg: ICensorInstanceConfig = (instanceConfig.data as ICensorInstanceConfig)?.llmId ? (instanceConfig.data as ICensorInstanceConfig) : (savedCfg ?? defaultCfg)
                const llms: ILlm[] = (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
                const llm = cfg.llmId ? llms.find(l => l.id === cfg.llmId) : undefined
                if (cfg.llmId && !llm) {
                    this.backChannelObject.logWarning?.(`[censor] LLM '${cfg.llmId}' not found in shared storage`)
                }
                instance!.cfg = cfg
                instance!.llm = llm
                await this.executeConfigGet(webSocket, instance!)
                this.rebuildBusinessSubscription()
            })()
        }

        if (instance._configReady) await instance._configReady

        if (instance.assets.some(a => a.namespace === ns && a.pod === pod && a.container === container)) return true

        const dm = this.backChannelObject.daemonManager
        if (!instance.sessionId && dm) {
            if (!instance._startupPromise) {
                instance._startupPromise = this.autoStartDaemon(webSocket, instance, dm)
                    .finally(() => { instance!._startupPromise = undefined })
            }
            await instance._startupPromise
        }

        const isClusterMode = ns === '*all' && pod === '*all' && container === '*all'

        if (!isClusterMode) {
            instance.assets.push({ namespace: ns, pod, container })
            this.sendAssets(webSocket, instance)
            if (instance.sessionId && dm) {
                await dm.directAddObject(instance.sessionId, ns, pod, container).catch(() => {})
            }
        }
        return true
    }

    private autoStartDaemon = async (webSocket: WebSocket, instance: IInstance, dm: IDaemonManager, activeConfigsOverride?: ICensorInstanceConfig[]) => {
        let allActive: ICensorInstanceConfig[]
        if (activeConfigsOverride !== undefined) {
            // Caller already determined which configs are active (no storage race)
            allActive = activeConfigsOverride
        } else {
            const savedConfigs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!('censor-configs', false)) ?? []
            const activeConfigs = savedConfigs.filter(c => c.active)
            // Fallback to instance.cfg only when there are no saved configs at all (fresh setup)
            allActive = activeConfigs.length > 0 ? activeConfigs : (savedConfigs.length === 0 ? [instance.cfg] : [])
        }
        if (allActive.length === 0) return

        const id = randomUUID()
        const ic = instance.instanceConfig
        const isCluster = ic.view === EInstanceConfigView.CLUSTER
        const llms: ILlm[] = (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
        const ephemeralDescription = generateSessionName(dm.listInstances('censor').map(s => s.description))
        instance.ephemeralDescription = ephemeralDescription
        const daemonCfg: IDaemonInstanceConfig = {
            id, daemonId: 'censor', description: ephemeralDescription,
            view: ic.view, namespace: ic.namespace,
            ...(ic.group ? { group: ic.group } : {}),
            ...(ic.pod ? { pod: ic.pod } : {}),
            ...(ic.container ? { container: ic.container } : {}),
            data: { ...instance.cfg, _llms: llms, scope: isCluster ? 'cluster' : 'resource' }, started: true,
            createdAt: new Date().toISOString()
        }
        await dm.createInstance('censor', daemonCfg)
        instance.sessionId = id
        instance.ephemeral = true
        instance.sessionUnsub = dm.subscribe(id, (event: IDaemonEvent) => this.forwardDaemonEvent(webSocket, instance, event))
        for (const activeCfg of allActive) {
            console.log(`[censor-back] autoStartDaemon configset runner: ${activeCfg.name}:${activeCfg.version}`)
            await dm.sendCommand(id, 'configset', { ...activeCfg, _llms: llms })
        }
        await dm.sendCommand(id, 'providersset', this.providers)
        if (!instance.analyzing) await dm.sendCommand(id, 'analyzestop', null)
        webSocket.send(JSON.stringify({ msgtype: 'censormessage', channel: 'censor', action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.DATA, instance: instance.instanceId, kind: 'config', sessionDescription: ephemeralDescription } as ICensorMessage))
    }

    private executeConfigGet = async (webSocket: WebSocket, instance: IInstance, llmsOverride?: ILlm[]): Promise<void> => {
        const llms: ILlm[] = llmsOverride ?? (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
        const configs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!('censor-configs', false)) ?? []
        const storedProviders: ILlmProvider[] = (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_PROVIDERS, true)) ?? []
        if (storedProviders.length > 0) {
            // reuse already-loaded models; load only providers not yet known
            const merged = storedProviders.map(sp => {
                const loaded = this.providers.find(p => p.name === sp.name)
                return (loaded && loaded.models.length > 0) ? loaded : sp
            })
            const needsLoad = merged.filter(p => p.models.length === 0)
            if (needsLoad.length > 0) await loadModels(needsLoad, this.backChannelObject)
            this.providers = merged
        }
        const dm = this.backChannelObject.daemonManager
        const sessions = dm ? await this.buildSessionList(dm, dm.listInstances('censor')) : []
        const derivedScope: 'cluster' | 'resource' = instance.instanceConfig.view === EInstanceConfigView.CLUSTER ? 'cluster' : 'resource'
        const msg: ICensorMessage = {
            msgtype: 'censormessage',
            channel: 'censor',
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            kind: 'config',
            instanceConfig: { ...instance.cfg, scope: derivedScope },
            configs,
            llms,
            providers: this.providers,
            providersAvailable: PROVIDERS_AVAILABLE,
            sessions,
            sessionDescription: instance.ephemeralDescription
        }
        webSocket.send(JSON.stringify(msg))
    }

    private sendAssets = (webSocket: WebSocket, instance: IInstance) => {
        webSocket.send(JSON.stringify({
            msgtype: 'censormessage', channel: 'censor',
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA, instance: instance.instanceId,
            kind: 'assets',
            assets: instance.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container }))
        } as ICensorMessage))
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, ns: string, pod: string, container: string): Promise<boolean> => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            instance.assets = instance.assets.filter(a => !(a.namespace === ns && a.pod === pod && (container === '' || a.container === container)))
            const dm = this.backChannelObject.daemonManager
            if (instance.sessionId && dm) {
                await dm.directDeleteObject(instance.sessionId, ns, pod, container).catch(() => {})
            }
            // daemon broadcasts 'assets' after deleteObject
        }
        return true
    }

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (!instance) return
        instance.paused = (action === EInstanceMessageAction.PAUSE)
        if (instance.sessionId) {
            const dm = this.backChannelObject.daemonManager
            if (dm) dm.sendCommand(instance.sessionId, action === EInstanceMessageAction.PAUSE ? 'pause' : 'continue', null).catch(() => {})
        }
    }

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            if (instance.sessionUnsub) instance.sessionUnsub()
            if (instance.ephemeral && instance.sessionId) {
                const dm = this.backChannelObject.daemonManager
                if (dm) dm.stopInstance(instance.sessionId).catch(() => {})
            }
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Smart censor instance stopped')
        }
        else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, 'Smart censor instance not found')
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.connections.find(s => s.webSocket === webSocket)
        if (socket) {
            const pos = socket.instances.findIndex(i => i.instanceId === instanceId)
            if (pos >= 0) socket.instances.splice(pos, 1)
        }
    }

    containsConnection = (webSocket: WebSocket): boolean => {
        return Boolean(this.connections.find(s => s.webSocket === webSocket))
    }

    removeConnection = (webSocket: WebSocket): void => {
        const socket = this.connections.find(s => s.webSocket === webSocket)
        if (socket) {
            const dm = this.backChannelObject.daemonManager
            for (const instance of socket.instances) {
                if (instance.sessionUnsub) instance.sessionUnsub()
                if (instance.ephemeral && instance.sessionId && dm) {
                    dm.stopInstance(instance.sessionId).catch(() => {})
                }
            }
            const pos = this.connections.findIndex(s => s.webSocket === webSocket)
            this.connections.splice(pos, 1)
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.connections.find(s => s.webSocket === webSocket)
        if (socket) {
            socket.lastRefresh = Date.now()
            return true
        }
        return false
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (const entry of this.connections) {
            if (entry.instances.find(i => i.instanceId === instanceId)) {
                entry.webSocket = newWebSocket
                return true
            }
        }
        return false
    }

    private getInstance = (webSocket: WebSocket, instanceId: string): IInstance | undefined => {
        const socket = this.connections.find(s => s.webSocket === webSocket)
        return socket?.instances.find(i => i.instanceId === instanceId)
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        const resp: ISignalMessage = {
            action, flow,
            channel: 'censor',
            instance: instanceId,
            type: EInstanceMessageType.SIGNAL,
            text, level
        }
        ws.send(JSON.stringify(resp))
    }
}

export default CensorChannel
