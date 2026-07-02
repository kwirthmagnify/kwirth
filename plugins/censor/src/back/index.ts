import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, EInstanceConfigView, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject } from '@kwirthmagnify/kwirth-common'
import { ILlm, ILlmProvider, STORAGE_KEY_LLMS, STORAGE_KEY_PROVIDERS } from '@kwirthmagnify/kwirth-common-ai'
import { loadModels, buildModel, zodFromExample, generateText, Output } from '@kwirthmagnify/kwirth-common-ai/back'
import { PassThrough } from 'stream'
import { ECensorCommand, ERegexOrigin, ICensorInstanceConfig } from '../common/CensorTypes'

const PROVIDERS_AVAILABLE = ['google', 'openai', 'openrouter', 'mistral', 'groq', 'deepseek']

// ── Motor de análisis (portado desde el daemon censor) ───────────────────────
const BATCH_SIZE = 50
const MAX_LINE_BUFFER = 25000

const cleanANSI = (text: string): string => text.replace(/\x1b\[[0-9;]*[mKHVfJrcegH]|\x1b\[\d*n/g, '')

const DEFAULT_SYSTEM = 'You are a log analysis assistant. Analyze the provided log lines and identify patterns for noise/boilerplate entries that are not useful for debugging. Return ONLY a valid JSON array of JavaScript-compatible regex pattern strings (no explanation, no markdown, no code blocks). Each pattern should match an entire noisy line. Example output: ["^.*heartbeat.*$","^\\d{4}-\\d{2}-\\d{2}.*INFO.*health check"]. If no noise patterns are found, return [].'
const DEFAULT_USER_PROMPT = (count: number) => `Analyze these ${count} log lines:`

const matchesLabelSelector = (labels: Record<string, string>, selector: string): boolean =>
    selector.split(',').every(part => {
        const p = part.trim()
        if (!p) return true
        if (p.startsWith('!')) return !(p.slice(1) in labels)
        const neq = p.indexOf('!=')
        if (neq >= 0) return labels[p.slice(0, neq).trim()] !== p.slice(neq + 2).trim()
        const eq = p.indexOf('=')
        if (eq >= 0) return labels[p.slice(0, eq).trim()] === p.slice(eq + 1).trim()
        return p in labels
    })

const extractText = (data: unknown, path: string): string | undefined => {
    const parts = path.split('.')
    let cur: unknown = data
    for (const part of parts) {
        if (cur === null || typeof cur !== 'object') return undefined
        cur = (cur as Record<string, unknown>)[part]
    }
    return cur !== undefined ? String(cur) : undefined
}

// Local ephemeral-session name generator (inlined to avoid depending on the back's kwirth-common runtime version)
const SESSION_ADJECTIVES = ['eager', 'silent', 'clever', 'swift', 'bold', 'dark', 'bright', 'cold', 'wild', 'calm', 'deep', 'sharp', 'quiet', 'fierce', 'lone', 'hidden', 'fast', 'ancient', 'distant', 'electric', 'phantom', 'rogue', 'broken', 'noble', 'hollow', 'frozen', 'burning', 'glowing', 'twisted', 'sacred']
const SESSION_NOUNS = ['turing', 'lovelace', 'hopper', 'knuth', 'dijkstra', 'shannon', 'neumann', 'boole', 'hamilton', 'liskov', 'ritchie', 'torvalds', 'euler', 'gauss', 'tesla', 'curie', 'feynman', 'cipher', 'trace', 'scanner', 'signal', 'pattern', 'filter', 'watcher', 'sentinel', 'probe', 'stream', 'lens', 'monitor', 'vector']
const generateSessionName = (usedNames: string[] = []): string => {
    const used = new Set(usedNames)
    for (let i = 0; i < 20; i++) {
        const adj = SESSION_ADJECTIVES[Math.floor(Math.random() * SESSION_ADJECTIVES.length)]
        const noun = SESSION_NOUNS[Math.floor(Math.random() * SESSION_NOUNS.length)]
        const name = `${adj}_${noun}`
        if (!used.has(name)) return name
    }
    return `session_${Date.now()}`
}



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
    kind: 'received' | 'business' | 'llminput' | 'llmoutput' | 'llmwarning' | 'llmerror' | 'regex' | 'status' | 'config' | 'providers' | 'analyzing' | 'stats' | 'regexstats' | 'assets' | 'tags'
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
    sessionDescription?: string
    regexes?: { pattern: string, example: string, explanation: string, origin?: string }[]
    runnerKey?: string
}

interface IAsset {
    namespace: string
    pod: string
    container: string
    // set once the channel opens the log stream itself (stream 1.3)
    passThroughStream?: PassThrough
    runnerIds?: Set<string>
}

interface IAccumRegex {
    pattern: string
    compiled: RegExp
    example: string
    explanation: string
    matches: number
    origin: ERegexOrigin
}

interface IConfigRunner {
    cfg: ICensorInstanceConfig
    analyzing: boolean
    processedCount: number
    llmCount: number
    llmLinesCount: number
    totalBytesProcessed: number
    tokensIn: number
    tokensOut: number
    lineBuffer: string[]
    regexes: IAccumRegex[]
    llmBusy: boolean
    llmErrorCooldownUntil: number
    llm?: ILlm
    cachedSchema?: ReturnType<typeof zodFromExample>
    cachedModel?: ReturnType<typeof buildModel>
    cachedProviderOptions?: Record<string, Record<string, unknown>>
    currentBatchSize?: number
    lastStatsBroadcast: number
    lastRegexStatsBroadcast: number
    pendingReceivedLines: { text: string; namespace: string; pod: string; container: string }[]
    receivedTimer?: NodeJS.Timeout
    flushTimer?: NodeJS.Timeout
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
    ephemeralDescription?: string
    _configReady?: Promise<void>
    _startupPromise?: Promise<void>
    // self-contained engine state (portado desde IDaemonInstance)
    runners: Map<string, IConfigRunner>
    scope?: 'cluster' | 'resource'
    pendingReceivedLines: { text: string; namespace: string; pod: string; container: string }[]
    receivedTimer?: NodeJS.Timeout
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
        const addSources = (cfg: ICensorInstanceConfig) => {
            const sources = cfg.businessSources?.length
                ? cfg.businessSources
                : (cfg.space || cfg.businessPath)
                    ? [{ space: cfg.space, type: cfg.type, businessPath: cfg.businessPath }]
                    : []
            for (const src of sources) {
                if (!src.businessPath || !src.space) continue
                const types = spacesMap.get(src.space) ?? new Set<string>()
                types.add(src.type ?? '')
                spacesMap.set(src.space, types)
            }
        }
        // Aggregate over the active runners' configs (they carry businessSources); fall back to instance.cfg before runners exist
        for (const socket of this.connections) {
            for (const instance of socket.instances) {
                if (instance.runners.size > 0) {
                    for (const runner of instance.runners.values()) addSources(runner.cfg)
                } else {
                    addSources(instance.cfg)
                }
            }
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
        switch (providerId) {
            case 'events':   this.handleClusterPodEvent(event); break
            case 'business': this.handleBusinessEvent(event); break
        }
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
                instance.scope = instance.instanceConfig.view === EInstanceConfigView.CLUSTER ? 'cluster' : 'resource'
                // Determine active configs (from the full list if provided, else from storage)
                const savedForActive: ICensorInstanceConfig[] = _allConfigs ?? ((await this.backChannelObject.readStorage!('censor-configs', false)) ?? [])
                const activeConfigs = savedForActive.filter(c => c.active)
                const allActive: ICensorInstanceConfig[] = activeConfigs.length > 0 ? activeConfigs : [instance.cfg]
                if (!instance.ephemeralDescription) {
                    const existing = this.connections.flatMap(s => s.instances).map(i => i.ephemeralDescription).filter((d): d is string => !!d)
                    instance.ephemeralDescription = generateSessionName(existing)
                }
                this.syncRunners(instance, allActive, llmList)
                for (const runner of instance.runners.values()) runner.analyzing = instance.analyzing
                // Re-seed streams: cluster re-discovers; resource keeps its selection (runnerIds already updated)
                if (instance.scope === 'cluster') await this.discoverClusterPods(instance)
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
            case ECensorCommand.ANALYZESTART: {
                instance.analyzing = true
                instance.scope = instance.instanceConfig.view === EInstanceConfigView.CLUSTER ? 'cluster' : 'resource'
                const llms: ILlm[] = (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
                const savedConfigs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!('censor-configs', false)) ?? []
                const activeConfigs = savedConfigs.filter(c => c.active)
                const allActive = activeConfigs.length > 0 ? activeConfigs : [instance.cfg]
                this.syncRunners(instance, allActive, llms)
                for (const [rk, runner] of instance.runners) {
                    runner.analyzing = true
                    runner.lineBuffer = []
                    if (runner.flushTimer) { clearTimeout(runner.flushTimer); runner.flushTimer = undefined }
                    if (runner.receivedTimer) { clearTimeout(runner.receivedTimer); runner.receivedTimer = undefined }
                    this.sendEvent(instance, 'analyzing', { analyzing: true, runnerKey: rk })
                }
                if (instance.scope === 'cluster') await this.discoverClusterPods(instance)
                return true
            }
            case ECensorCommand.ANALYZESTOP: {
                instance.analyzing = false
                const targetKey = typeof msg.data === 'string' ? msg.data : null
                const targetRunner = targetKey ? instance.runners.get(targetKey) : null
                if (targetRunner) {
                    targetRunner.analyzing = false
                    targetRunner.lineBuffer = []
                    if (targetRunner.flushTimer) { clearTimeout(targetRunner.flushTimer); targetRunner.flushTimer = undefined }
                    if (targetRunner.receivedTimer) { clearTimeout(targetRunner.receivedTimer); targetRunner.receivedTimer = undefined }
                    this.sendEvent(instance, 'analyzing', { analyzing: false, runnerKey: targetKey! })
                    await this.saveRegexesForConfig(targetRunner.cfg.name)
                } else {
                    const savedNames = new Set<string>()
                    for (const [rk, runner] of instance.runners) {
                        runner.analyzing = false
                        runner.lineBuffer = []
                        if (runner.flushTimer) { clearTimeout(runner.flushTimer); runner.flushTimer = undefined }
                        if (runner.receivedTimer) { clearTimeout(runner.receivedTimer); runner.receivedTimer = undefined }
                        this.sendEvent(instance, 'analyzing', { analyzing: false, runnerKey: rk })
                        savedNames.add(runner.cfg.name)
                    }
                    for (const name of savedNames) await this.saveRegexesForConfig(name)
                }
                return true
            }
            case ECensorCommand.REGEXDELETE: {
                const payload = typeof msg.data === 'string' ? { pattern: msg.data } : msg.data as { pattern: string, runnerKey?: string }
                const { pattern: delPattern, runnerKey: delRunnerKey } = payload
                const targets = delRunnerKey && instance.runners.has(delRunnerKey)
                    ? [instance.runners.get(delRunnerKey)!]
                    : [...instance.runners.values()]
                for (const runner of targets) {
                    const pos = runner.regexes.findIndex(r => r.pattern === delPattern)
                    if (pos >= 0) runner.regexes.splice(pos, 1)
                }
                return true
            }
            case ECensorCommand.REGEXADD: {
                const { runnerKey: addRunnerKey, pattern: addPattern, explanation: addExplanation, origin: addOrigin } = msg.data as { runnerKey: string, pattern: string, explanation: string, origin?: ERegexOrigin }
                const addRunner = instance.runners.get(addRunnerKey)
                if (addRunner && !addRunner.regexes.some(r => r.pattern === addPattern)) {
                    try {
                        const compiled = new RegExp(addPattern)
                        const effectiveOrigin = addOrigin ?? ERegexOrigin.MANUAL
                        addRunner.regexes.push({ pattern: addPattern, compiled, example: '', explanation: addExplanation, matches: 0, origin: effectiveOrigin })
                        this.sendEvent(instance, 'regex', { runnerKey: addRunnerKey, pattern: addPattern, example: '', explanation: addExplanation, origin: effectiveOrigin })
                    } catch {}
                }
                return true
            }
            case ECensorCommand.PROVIDERSSET: {
                const newProviders = msg.data as ILlmProvider[]
                this.providers = newProviders
                await this.backChannelObject.writeStorageCommon!(STORAGE_KEY_PROVIDERS, true, newProviders)
                await loadModels(this.providers, this.backChannelObject)
                // Invalidate cached models so runners rebuild against the new providers
                for (const socket of this.connections) for (const inst of socket.instances) for (const runner of inst.runners.values()) { runner.cachedModel = undefined; runner.cachedProviderOptions = undefined }
                await this.executeConfigGet(webSocket, instance)
                return true
            }
        }
        return false
    }

    // ── Motor autónomo: helpers (portados desde el daemon) ───────────────────────

    private effectiveBatchSize(runner: IConfigRunner): number {
        const max = runner.cfg.batchSize ?? BATCH_SIZE
        if (runner.cfg.batchMode !== 'auto') return max
        return runner.currentBatchSize ?? max
    }

    // Envío directo al WebSocket de la instancia (reemplaza broadcast+forwardDaemonEvent).
    // Localiza el socket vía connections para respetar reconexiones (updateConnection).
    private sendEvent(instance: IInstance, kind: ICensorMessage['kind'], data: Record<string, unknown>): void {
        const socket = this.connections.find(s => s.instances.includes(instance))
        if (!socket) return
        const ws = socket.webSocket as unknown as { readyState: number, bufferedAmount: number }
        if (ws.readyState !== 1) return
        // Backpressure: drop display-only events when WebSocket can't drain fast enough
        const LOW_PRIORITY = new Set(['received', 'stats', 'regexstats', 'llminput', 'llmoutput', 'tags'])
        if (LOW_PRIORITY.has(kind as string) && ws.bufferedAmount > 256_000) return
        socket.webSocket.send(JSON.stringify({
            msgtype: 'censormessage', channel: 'censor',
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA, instance: instance.instanceId,
            kind,
            ...data
        } as ICensorMessage))
    }

    // Throttled stats broadcast: max 4/sec; regex match counts separated into a low-freq event
    private broadcastStats(instance: IInstance, runner: IConfigRunner): void {
        const now = Date.now()
        const runnerKey = `${runner.cfg.name}:${runner.cfg.version}`
        if (now - runner.lastStatsBroadcast < 250) return
        runner.lastStatsBroadcast = now
        this.sendEvent(instance, 'stats', {
            runnerKey,
            processedCount: runner.processedCount,
            llmCount: runner.llmCount,
            llmLinesCount: runner.llmLinesCount,
            totalBytesProcessed: runner.totalBytesProcessed,
            tokensIn: runner.tokensIn,
            tokensOut: runner.tokensOut,
            pendingCount: runner.lineBuffer.length,
            currentBatchSize: runner.cfg.batchMode === 'auto' ? (runner.currentBatchSize ?? runner.cfg.batchSize ?? BATCH_SIZE) : undefined
        })
        if (now - runner.lastRegexStatsBroadcast >= 5000) {
            runner.lastRegexStatsBroadcast = now
            this.sendEvent(instance, 'regexstats', { runnerKey, regexMatches: runner.regexes.map(r => ({ pattern: r.pattern, matches: r.matches })) })
        }
    }

    // Throttled received broadcast: accumulate lines for 200ms, then emit a single batch (max 200 lines)
    private scheduleReceivedBroadcast(instance: IInstance): void {
        if (instance.receivedTimer) return
        instance.receivedTimer = setTimeout(() => {
            instance.receivedTimer = undefined
            if (instance.pendingReceivedLines.length === 0) return
            const toSend = instance.pendingReceivedLines.splice(0, 200)
            instance.pendingReceivedLines = []
            this.sendEvent(instance, 'received', { lines: toSend })
        }, 200)
    }

    // Persist the union of regexes across all runners of a given config name
    private async saveRegexesForConfig(configName: string): Promise<void> {
        const seen = new Set<string>()
        const regexes: { pattern: string, example: string, explanation: string, origin: ERegexOrigin }[] = []
        for (const socket of this.connections) {
            for (const instance of socket.instances) {
                for (const runner of instance.runners.values()) {
                    if (runner.cfg.name !== configName) continue
                    for (const r of runner.regexes) {
                        if (!seen.has(r.pattern)) {
                            seen.add(r.pattern)
                            regexes.push({ pattern: r.pattern, example: r.example, explanation: r.explanation, origin: r.origin })
                        }
                    }
                }
            }
        }
        await this.backChannelObject.writeStorage!(`censor-regexes-${configName}`, false, regexes)
    }

    private podMatchesRunnerCfg(cfg: ICensorInstanceConfig, namespace: string, podName: string): boolean {
        if (!cfg.logstreamEnabled) return false
        if (cfg.logstreamAll) return true
        const sources = cfg.logstreamSources ?? []
        if (sources.length === 0) return false
        return sources.some(src => {
            if (src.namespace && src.namespace !== namespace) return false
            if (src.podRegex) { try { if (!new RegExp(src.podRegex).test(podName)) return false } catch { return false } }
            return true
        })
    }

    // Create or update the runner for a config (keyed by name:version), preserving accumulated state
    private createOrUpdateRunner(instance: IInstance, cfg: ICensorInstanceConfig, llmList: ILlm[]): void {
        const rkey = `${cfg.name}:${cfg.version}`
        const existingRunner = instance.runners.get(rkey)
        if (existingRunner) {
            existingRunner.cfg = cfg
            existingRunner.llm = llmList.find(l => l.id === cfg.llmId)
            existingRunner.cachedSchema = undefined
            existingRunner.cachedModel = undefined
            existingRunner.cachedProviderOptions = undefined
            existingRunner.currentBatchSize = undefined
        } else {
            const newRunner: IConfigRunner = {
                cfg,
                analyzing: false,
                processedCount: 0, llmCount: 0, llmLinesCount: 0,
                totalBytesProcessed: 0, tokensIn: 0, tokensOut: 0,
                lineBuffer: [], regexes: [], llmBusy: false, llmErrorCooldownUntil: 0,
                llm: llmList.find(l => l.id === cfg.llmId),
                lastStatsBroadcast: 0, lastRegexStatsBroadcast: 0, pendingReceivedLines: []
            }
            instance.runners.set(rkey, newRunner)
        }
        // Retroactively populate runnerIds on existing assets for this runner
        for (const asset of instance.assets) {
            if (!asset.runnerIds) asset.runnerIds = new Set()
            if (this.podMatchesRunnerCfg(cfg, asset.namespace, asset.pod)) asset.runnerIds.add(rkey)
            else asset.runnerIds.delete(rkey)
        }
        // Tear down streams for cluster assets no longer matched by any runner (resource keeps its selection)
        if (instance.scope === 'cluster') {
            const toStop = instance.assets.filter(a => (a.runnerIds?.size ?? 0) === 0)
            for (const asset of toStop) {
                asset.passThroughStream?.removeAllListeners()
                asset.passThroughStream?.destroy()
            }
            instance.assets = instance.assets.filter(a => !toStop.includes(a))
        }
        this.sendEvent(instance, 'assets', { assets: instance.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
    }

    private processChunk(instance: IInstance, asset: IAsset, chunk: string): void {
        const lines = chunk.split('\n').filter(l => l.trim() !== '')
        if (lines.length === 0) return

        for (const rkey of (asset.runnerIds ?? [])) {
            const runner = instance.runners.get(rkey)
            if (!runner || !runner.analyzing) continue
            for (const line of lines) {
                runner.processedCount++
                runner.totalBytesProcessed += Buffer.byteLength(line, 'utf8')
                const clean = cleanANSI(line)
                const maxLen = runner.cfg.maxLineLength ?? 0
                const truncated = (maxLen > 0 && clean.length > maxLen) ? clean.slice(0, maxLen) : clean
                let filtered = false
                for (const r of runner.regexes) {
                    try { if (r.compiled.test(truncated)) { r.matches++; filtered = true } } catch {}
                }
                const batchSize = this.effectiveBatchSize(runner)
                if (!filtered && runner.lineBuffer.length < MAX_LINE_BUFFER) {
                    runner.lineBuffer.push(truncated)
                }
                if (runner.lineBuffer.length >= batchSize && !runner.llmBusy && Date.now() >= runner.llmErrorCooldownUntil) {
                    if (runner.flushTimer) { clearTimeout(runner.flushTimer); runner.flushTimer = undefined }
                    const batch = runner.lineBuffer.splice(0, batchSize)
                    this.callLlm(instance, batch, runner)
                } else if (runner.lineBuffer.length > 0 && runner.lineBuffer.length < batchSize && !runner.llmBusy && !runner.flushTimer) {
                    runner.flushTimer = setTimeout(() => {
                        runner.flushTimer = undefined
                        if (runner.lineBuffer.length > 0 && !runner.llmBusy && Date.now() >= runner.llmErrorCooldownUntil) {
                            const batch = runner.lineBuffer.splice(0, runner.lineBuffer.length)
                            this.callLlm(instance, batch, runner)
                        }
                    }, (runner.cfg.batchTimeout ?? 2) * 1000)
                }
            }
            this.broadcastStats(instance, runner)
        }
        // Only broadcast received lines when this asset matches at least one analyzing runner
        const assetIsActive = [...(asset.runnerIds ?? [])].some(rk => instance.runners.get(rk)?.analyzing)
        if (assetIsActive) {
            const receivedBatch = lines.map(text => ({ text, namespace: asset.namespace, pod: asset.pod, container: asset.container }))
            instance.pendingReceivedLines.push(...receivedBatch)
            if (instance.pendingReceivedLines.length > 1000) instance.pendingReceivedLines.splice(0, instance.pendingReceivedLines.length - 1000)
            this.scheduleReceivedBroadcast(instance)
        }
    }

    private async callLlm(instance: IInstance, lines: string[], runner: IConfigRunner): Promise<void> {
        const runnerKey = `${runner.cfg.name}:${runner.cfg.version}`
        runner.llmBusy = true
        let success = false
        try {
            if (!runner.llm && runner.cfg.llmId) {
                const storedLlms: ILlm[] = ((await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []) as ILlm[]
                runner.llm = storedLlms.find(l => l.id === runner.cfg.llmId)
            }
            if (!runner.llm) {
                this.backChannelObject.logWarning?.(`[censor] no LLM configured for instance ${instance.instanceId} llmId='${runner.cfg.llmId}' cfg.name='${runner.cfg.name}'`)
                return
            }
            if (this.providers.length === 0) {
                const stored: ILlmProvider[] = ((await this.backChannelObject.readStorageCommon!(STORAGE_KEY_PROVIDERS, true)) ?? []) as ILlmProvider[]
                if (stored.length > 0) {
                    this.providers = stored
                    await loadModels(this.providers, this.backChannelObject)
                }
            }
            if (!runner.cachedModel) {
                runner.cachedModel = buildModel(runner.llm, this.providers)
            }
            const model = runner.cachedModel
            if (!model) {
                this.backChannelObject.logWarning?.(`[censor] could not build model for LLM '${runner.llm.id}'`)
                return
            }

            const system = runner.cfg.system?.trim() || DEFAULT_SYSTEM
            const prompt = `${DEFAULT_USER_PROMPT(lines.length)}\n\n${lines.join('\n')}`

            if (!runner.cachedProviderOptions) {
                const opts: Record<string, Record<string, unknown>> = {}
                switch (runner.llm.provider) {
                    case 'google':   Object.assign(opts, { google: { structuredOutputs: true } }); break
                    case 'groq':     Object.assign(opts, { groq: { structuredOutputs: true } }); break
                    case 'mistral':  Object.assign(opts, { mistral: { strictJsonSchema: true, structuredOutputs: true } }); break
                    default:         Object.assign(opts, { openai: {} })
                }
                runner.cachedProviderOptions = opts
            }
            const providerOptions = runner.cachedProviderOptions

            if (!runner.cachedSchema) {
                let example: Record<string, unknown>
                try {
                    example = JSON.parse(runner.cfg.exampleJson?.trim() || '{"patterns":[""]}')
                } catch (err) {
                    this.backChannelObject.logWarning?.(`[censor] invalid exampleJson, using default. Error: ${err}`)
                    example = { patterns: [''] }
                }
                runner.cachedSchema = zodFromExample(example)
            }
            const schema = runner.cachedSchema

            runner.llmCount++
            runner.llmLinesCount += lines.length
            runner.lastStatsBroadcast = 0  // force next broadcastStats to fire immediately
            this.broadcastStats(instance, runner)
            this.sendEvent(instance, 'llminput', { runnerKey, lines })

            const { output, usage } = await generateText({
                model, system, prompt,
                temperature: runner.cfg.temperature ?? 0.2,
                providerOptions: providerOptions as never,
                output: Output.object({ schema })
            })

            runner.tokensIn += usage.inputTokens ?? 0
            runner.tokensOut += usage.outputTokens ?? 0
            runner.lastStatsBroadcast = 0  // force stats update after LLM response
            this.broadcastStats(instance, runner)
            this.sendEvent(instance, 'llmoutput', { runnerKey, text: JSON.stringify(output, null, 2) })

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const out = (output ?? {}) as any
            const patterns: string[] = (out.info ?? []).filter((x: any) => x.type === 'discard').map((x: any) => x.regex)

            const patternExplanations: Map<string, string> = new Map(
                out.info?.filter((x: any) => x.type === 'discard').map((x: any) => [x.regex as string, (x.explanation ?? '') as string]) ?? []
            )

            for (const val of Object.values(out as Record<string, unknown>)) {
                if (Array.isArray(val)) patterns.push(...val.filter((v): v is string => typeof v === 'string'))
            }

            const allTags: string[] = []
            for (const item of (out.info ?? [])) {
                if (Array.isArray(item.tags)) {
                    for (const tag of item.tags) {
                        if (typeof tag === 'string' && !allTags.includes(tag)) allTags.push(tag)
                    }
                }
            }
            if (allTags.length > 0) this.sendEvent(instance, 'tags', { runnerKey, tags: allTags })

            const warnings: { original: string, explanation: string, tags: string[] }[] =
                out.info?.filter((x: any) => x.type === 'warn')
                    .map((x: any) => ({ original: x.original ?? '', explanation: x.explanation ?? '', tags: Array.isArray(x.tags) ? x.tags.filter((tg: unknown) => typeof tg === 'string') : [] })) ?? []
            for (const w of warnings) {
                this.sendEvent(instance, 'llmwarning', { runnerKey, text: w.original, explanation: w.explanation, tags: w.tags })
                const sid = runner.cfg.senderId
                const scn = runner.cfg.senderConfigName
                if (sid && scn) {
                    const tagStr = w.tags.length > 0 ? ` [${w.tags.join(', ')}]` : ''
                    this.backChannelObject.senders?.send(sid, scn, {
                        body: `${w.original}\n\n${w.explanation}${tagStr}`,
                        subject: `Censor warning${tagStr}`,
                        level: 'warning'
                    })
                }
            }

            for (const pattern of patterns) {
                if (typeof pattern !== 'string') continue
                if (runner.regexes.some(r => r.pattern === pattern)) continue
                try {
                    const compiled = new RegExp(pattern)
                    const matchExample = lines.find(l => { try { return compiled.test(l) } catch { return false } }) ?? ''
                    const explanation = patternExplanations.get(pattern) ?? ''
                    if ((runner.cfg.mode ?? 'inference') === 'inference') {
                        runner.regexes.push({ pattern, compiled, example: matchExample, explanation, matches: 1, origin: ERegexOrigin.LLM })
                        this.sendEvent(instance, 'regex', { runnerKey, pattern, example: matchExample, explanation, origin: ERegexOrigin.LLM })
                    }
                }
                catch {
                    this.backChannelObject.logWarning?.(`[censor] invalid regex from LLM: '${pattern}'`)
                }
            }
            success = true
        }
        catch (err) {
            this.backChannelObject.logError?.(`[censor] LLM call error: ${err}`)
            this.sendEvent(instance, 'llmerror', { runnerKey, text: String(err), timestamp: new Date().toISOString(), inputLines: lines })
            runner.lineBuffer.unshift(...lines)
            runner.llmErrorCooldownUntil = Date.now() + 5_000
        }
        finally {
            runner.llmBusy = false
            if (success && runner.cfg.batchMode === 'auto') {
                const maxSize = runner.cfg.batchSize ?? BATCH_SIZE
                const minSize = runner.cfg.batchSizeMin ?? 1
                const current = runner.currentBatchSize ?? maxSize
                const pending = runner.lineBuffer.length
                if (pending >= current) {
                    runner.currentBatchSize = Math.min(maxSize, current + Math.max(1, Math.round(current * 0.2)))
                } else if (pending < current * 0.9) {
                    runner.currentBatchSize = Math.max(minSize, current - Math.max(1, Math.round(current * 0.2)))
                }
            }
            if (success) {
                const batchSize = this.effectiveBatchSize(runner)
                if (runner.lineBuffer.length >= batchSize) {
                    const batch = runner.lineBuffer.splice(0, batchSize)
                    this.callLlm(instance, batch, runner)
                }
            }
        }
    }

    // Low-level opener: start a follow log stream for a pod/container and wire it to processChunk.
    // Callers apply their own candidate filtering (resource addObject filters; cluster ADDED does not).
    private openLogStream(instance: IInstance, ns: string, pod: string, container: string): void {
        if (instance.assets.some(a => a.namespace === ns && a.pod === pod && a.container === container)) return
        const logStream = new PassThrough()
        const runnerIds = new Set<string>()
        for (const [rkey, runner] of instance.runners) {
            if (this.podMatchesRunnerCfg(runner.cfg, ns, pod)) runnerIds.add(rkey)
        }
        const asset: IAsset = { namespace: ns, pod, container, passThroughStream: logStream, runnerIds }
        instance.assets.push(asset)
        logStream.setEncoding('utf8')
        logStream.on('data', (chunk: string) => this.processChunk(instance, asset, chunk))
        logStream.on('end', () => {
            instance.assets = instance.assets.filter(a => a !== asset)
            this.sendEvent(instance, 'assets', { assets: instance.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
        })
        const logApi = (this.clusterInfo as { logApi: { log: (ns: string, pod: string, container: string, stream: PassThrough, opts: unknown) => Promise<void> } }).logApi
        logApi.log(ns, pod, container, logStream, { follow: true, pretty: false, timestamps: false, tailLines: 1 })
            .catch(err => {
                this.backChannelObject.logWarning?.(`[censor] log stream error for ${ns}/${pod}/${container}: ${err}`)
                instance.assets = instance.assets.filter(a => a !== asset)
                this.sendEvent(instance, 'assets', { assets: instance.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
            })
        this.sendEvent(instance, 'assets', { assets: instance.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
    }

    // Cluster-mode discovery: list all pods and open streams for those matching any runner's logstream config
    private async discoverClusterPods(instance: IInstance): Promise<void> {
        const runnerCfgs = [...instance.runners.values()].map(r => r.cfg).filter(c => c.logstreamEnabled)
        if (runnerCfgs.length === 0) return
        try {
            const coreApi = (this.clusterInfo as { coreApi: { listPodForAllNamespaces: () => Promise<{ items?: unknown[] }> } }).coreApi
            const podList = await coreApi.listPodForAllNamespaces()
            for (const podUnknown of (podList.items ?? [])) {
                const pod = podUnknown as { metadata?: { namespace?: string, name?: string, labels?: Record<string, string> }, spec?: { containers?: { name: string }[] } }
                const ns = pod.metadata?.namespace
                const name = pod.metadata?.name
                if (!ns || !name) continue
                const labels = pod.metadata?.labels ?? {}
                const containers = pod.spec?.containers ?? []
                const passes = runnerCfgs.some(cfg => {
                    if (cfg.logstreamAll) return true
                    const sources = cfg.logstreamSources ?? []
                    if (sources.length === 0) return false
                    const basicMatches = sources.filter(src => {
                        if (src.namespace && src.namespace !== ns) return false
                        if (src.podRegex) { try { if (!new RegExp(src.podRegex).test(name)) return false } catch { return false } }
                        return true
                    })
                    return basicMatches.some(src => !src.labelSelector || matchesLabelSelector(labels, src.labelSelector))
                })
                if (passes) for (const c of containers) this.openLogStream(instance, ns, name, c.name)
            }
        } catch (e) {
            this.backChannelObject.logWarning?.(`[censor] discoverClusterPods error: ${e}`)
        }
    }

    // Provider 'events': dynamic pod add/remove for cluster-scoped instances
    private handleClusterPodEvent(event: unknown): void {
        const { type, obj } = event as { type: string, obj: { kind: string, metadata: { name: string, namespace: string }, spec?: { containers?: { name: string }[] } } }
        if (obj.kind !== 'Pod') return
        const podName = obj.metadata.name
        const namespace = obj.metadata.namespace
        const allInstances = this.connections.flatMap(s => s.instances)

        if (type === 'DELETED') {
            for (const instance of allInstances) {
                const before = instance.assets.length
                const toRemove = instance.assets.filter(a => a.pod === podName && a.namespace === namespace)
                for (const asset of toRemove) { asset.passThroughStream?.removeAllListeners(); asset.passThroughStream?.destroy() }
                instance.assets = instance.assets.filter(a => !(a.pod === podName && a.namespace === namespace))
                if (instance.assets.length !== before) {
                    this.sendEvent(instance, 'assets', { assets: instance.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
                }
            }
            return
        }

        if (type === 'ADDED') {
            const containers = obj.spec?.containers?.map(c => c.name) ?? []
            if (containers.length === 0) return
            for (const instance of allInstances) {
                if (instance.scope !== 'cluster') continue
                for (const containerName of containers) this.openLogStream(instance, namespace, podName, containerName)
            }
        }
    }

    // Provider 'business': fan-out to each runner's businessSources
    private handleBusinessEvent(event: unknown): void {
        const bEvent = event as { last: { event: { space: string, type: string, data: unknown } } }
        const eventSpace = bEvent.last?.event?.space ?? ''
        const eventType = bEvent.last?.event?.type ?? ''
        const eventBody = bEvent.last?.event
        for (const instance of this.connections.flatMap(s => s.instances)) {
            if (instance.runners.size === 0) continue
            let displayed = false
            for (const [, runner] of instance.runners) {
                if (!runner.analyzing) continue
                const rSources = runner.cfg.businessSources?.length
                    ? runner.cfg.businessSources
                    : (runner.cfg.space || runner.cfg.businessPath)
                        ? [{ space: runner.cfg.space, type: runner.cfg.type, businessPath: runner.cfg.businessPath, addTimestamp: runner.cfg.addTimestamp }]
                        : []
                const matchingSrc = rSources.find(src => {
                    if (!src.businessPath) return false
                    if (src.space && src.space !== eventSpace) return false
                    if (src.type && src.type !== eventType) return false
                    return true
                })
                if (!matchingSrc) continue
                const text = extractText(eventBody, matchingSrc.businessPath!)
                if (text === undefined) continue
                const ts = new Date().toISOString()
                const llmText = matchingSrc.addTimestamp ? `${ts} ${text}` : String(text)
                if (!displayed) {
                    this.sendEvent(instance, 'business', { text: String(text), namespace: eventSpace, pod: eventType, container: '', timestamp: ts })
                    displayed = true
                }
                runner.processedCount++
                const clean = cleanANSI(llmText)
                let filtered = false
                for (const r of runner.regexes) { try { if (r.compiled.test(clean)) { r.matches++; filtered = true } } catch {} }
                if (!filtered) {
                    const batchSize = this.effectiveBatchSize(runner)
                    if (runner.lineBuffer.length < MAX_LINE_BUFFER) runner.lineBuffer.unshift(clean)
                    if (runner.lineBuffer.length >= batchSize && !runner.llmBusy && Date.now() >= runner.llmErrorCooldownUntil) {
                        const batch = runner.lineBuffer.splice(0, batchSize)
                        this.callLlm(instance, batch, runner)
                    }
                }
                this.broadcastStats(instance, runner)
            }
        }
    }

    // Remove a runner (keyed by name:version): stop it, drop it, and tear down its now-orphan cluster streams
    private removeRunner(instance: IInstance, rk: string): void {
        const runner = instance.runners.get(rk)
        if (!runner) return
        runner.analyzing = false
        runner.lineBuffer = []
        if (runner.flushTimer) { clearTimeout(runner.flushTimer); runner.flushTimer = undefined }
        if (runner.receivedTimer) { clearTimeout(runner.receivedTimer); runner.receivedTimer = undefined }
        instance.runners.delete(rk)
        for (const asset of instance.assets) asset.runnerIds?.delete(rk)
        if (instance.scope === 'cluster') {
            const orphans = instance.assets.filter(a => (a.runnerIds?.size ?? 0) === 0)
            for (const asset of orphans) { asset.passThroughStream?.removeAllListeners(); asset.passThroughStream?.destroy() }
            instance.assets = instance.assets.filter(a => !orphans.includes(a))
        }
        this.sendEvent(instance, 'analyzing', { analyzing: false, runnerKey: rk })
    }

    // Reconcile runners with the given active configs: drop stale, create/update active
    private syncRunners(instance: IInstance, allActive: ICensorInstanceConfig[], llmList: ILlm[]): void {
        const activeKeys = new Set(allActive.map(c => `${c.name}:${c.version}`))
        for (const rk of [...instance.runners.keys()]) if (!activeKeys.has(rk)) this.removeRunner(instance, rk)
        for (const cfg of allActive) this.createOrUpdateRunner(instance, cfg, llmList)
    }

    // Seed runners for this instance from the active configs (replaces the old ephemeral daemon auto-start)
    private seedRunners = async (webSocket: WebSocket, instance: IInstance, activeConfigsOverride?: ICensorInstanceConfig[]): Promise<void> => {
        let allActive: ICensorInstanceConfig[]
        if (activeConfigsOverride !== undefined) {
            allActive = activeConfigsOverride
        } else {
            const savedConfigs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!('censor-configs', false)) ?? []
            const activeConfigs = savedConfigs.filter(c => c.active)
            allActive = activeConfigs.length > 0 ? activeConfigs : (savedConfigs.length === 0 ? [instance.cfg] : [])
        }
        if (allActive.length === 0) return

        const llms: ILlm[] = (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
        instance.scope = instance.instanceConfig.view === EInstanceConfigView.CLUSTER ? 'cluster' : 'resource'
        if (!instance.ephemeralDescription) {
            const existing = this.connections.flatMap(s => s.instances).map(i => i.ephemeralDescription).filter((d): d is string => !!d)
            instance.ephemeralDescription = generateSessionName(existing)
        }
        for (const cfg of allActive) this.createOrUpdateRunner(instance, cfg, llms)
        for (const [rk, runner] of instance.runners) {
            runner.analyzing = instance.analyzing
            this.sendEvent(instance, 'analyzing', { analyzing: runner.analyzing, runnerKey: rk })
        }
        if (instance.scope === 'cluster') await this.discoverClusterPods(instance)
        await this.executeConfigGet(webSocket, instance, llms)
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
                analyzing: false,
                runners: new Map(),
                pendingReceivedLines: []
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

        const isClusterMode = ns === '*all' && pod === '*all' && container === '*all'
        instance.scope = (isClusterMode || instance.instanceConfig.view === EInstanceConfigView.CLUSTER) ? 'cluster' : 'resource'

        // Seed runners once (replaces the old ephemeral daemon auto-start)
        if (instance.runners.size === 0) {
            if (!instance._startupPromise) {
                instance._startupPromise = this.seedRunners(webSocket, instance)
                    .finally(() => { instance!._startupPromise = undefined })
            }
            await instance._startupPromise
        }

        if (isClusterMode) {
            // Cluster: discovery owns the asset list (idempotent; re-runs cover reconnects)
            await this.discoverClusterPods(instance)
            return true
        }

        if (instance.assets.some(a => a.namespace === ns && a.pod === pod && a.container === container)) return true
        this.openLogStream(instance, ns, pod, container)
        return true
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
            sessionDescription: instance.ephemeralDescription
        }
        webSocket.send(JSON.stringify(msg))
    }

    // Tear down all log streams and timers for an instance (ephemeral-only lifecycle)
    private teardownInstance(instance: IInstance): void {
        if (instance.receivedTimer) { clearTimeout(instance.receivedTimer); instance.receivedTimer = undefined }
        for (const runner of instance.runners.values()) {
            if (runner.flushTimer) { clearTimeout(runner.flushTimer); runner.flushTimer = undefined }
            if (runner.receivedTimer) { clearTimeout(runner.receivedTimer); runner.receivedTimer = undefined }
        }
        for (const asset of instance.assets) {
            asset.passThroughStream?.removeAllListeners()
            asset.passThroughStream?.destroy()
        }
        instance.assets = []
        instance.runners.clear()
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, ns: string, pod: string, container: string): Promise<boolean> => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            const toRemove = instance.assets.filter(a => a.namespace === ns && a.pod === pod && (container === '' || a.container === container))
            for (const asset of toRemove) { asset.passThroughStream?.removeAllListeners(); asset.passThroughStream?.destroy() }
            instance.assets = instance.assets.filter(a => !toRemove.includes(a))
            this.sendEvent(instance, 'assets', { assets: instance.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
        }
        return true
    }

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (!instance) return
        instance.paused = (action === EInstanceMessageAction.PAUSE)
    }

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.teardownInstance(instance)
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
            for (const instance of socket.instances) this.teardownInstance(instance)
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
