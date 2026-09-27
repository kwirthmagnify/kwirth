import { IExtensionImportResult, IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, EInstanceConfigView, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { IBackChannelObject } from '@kwirthmagnify/kwirth-common-back'
import { ILlm, ILlmProvider, STORAGE_KEY_LLMS, STORAGE_KEY_PROVIDERS, PROVIDERS_AVAILABLE } from '@kwirthmagnify/kwirth-common-ai'
import { loadModels, buildModel, zodFromExample, generateText, Output } from '@kwirthmagnify/kwirth-common-ai/back'
import { PassThrough } from 'stream'
import { ECensorAssetState, ECensorCommand, ERegexOrigin, ICensorAssetInfo, ICensorInstanceConfig } from '../common/CensorTypes'

// ── Analysis engine (self-contained, inside the channel's back end) ──────────
const BATCH_SIZE = 50
const MAX_LINE_BUFFER = 25000
// Log stream reconnection: the k8s client cuts 'follow' short often, so a close is no reason to
// discard the asset (see startAssetStream)
const RECONNECT_DELAYS = [1_000, 2_000, 5_000, 10_000, 30_000]
const MAX_RECONNECT_ATTEMPTS = 20
// Ceiling on the window recovered after a stream cut (see startAssetStream)
const MAX_GAP_RECOVERY_SECONDS = 300
// Batching of the asset inventory broadcast (several changes in a row → a single message)
const ASSETS_BROADCAST_DELAY = 100
// Analysis autostart: a single flag for the whole channel, kept apart from the configs (it does not
// travel with them in export/import because it is a preference of this installation)
const STORAGE_KEY_AUTOSTART = 'censor-autostart'
// The configurations with name+version, in the channel's store. This is WHAT TRAVELS in the
// configuration export/import (see exportConfig/importConfig).
const STORAGE_KEY_CONFIGS = 'censor-configs'

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
    autoStart?: boolean
    llms?: ILlm[]
    providers?: ILlmProvider[]
    providersAvailable?: string[]
    assets?: ICensorAssetInfo[]
    sessionDescription?: string
    regexes?: { pattern: string, example: string, explanation: string, origin?: string }[]
    runnerKey?: string
}

// An asset is an INVENTORY entry (a container matching the active configs). The log stream is an
// optional extra that only exists while some runner covering it is analysing.
interface IAsset {
    namespace: string
    pod: string
    container: string
    passThroughStream?: PassThrough
    abortController?: AbortController
    state: ECensorAssetState
    reconnectAttempts: number
    reconnectTimer?: NodeJS.Timeout
    // Time of the last involuntary cut, so only the lost window is recovered on reconnect
    streamClosedAt?: number
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
    // self-contained engine state (per-instance)
    runners: Map<string, IConfigRunner>
    scope?: 'cluster' | 'resource'
    pendingReceivedLines: { text: string; namespace: string; pod: string; container: string }[]
    receivedTimer?: NodeJS.Timeout
    assetsTimer?: NodeJS.Timeout
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

    /*
        ── Configuration portability (IExtension) ──────────────────────────────────────────────────

        The core does not know — and cannot know — which of what censor stores is configuration and which
        is not. It is decided here, and the border has three sides:

          · DOES travel     the named, versioned configurations, with their active mark. It is what
                            somebody composed by hand and what hurts to redo in another Kwirth.
          · does NOT travel the autostart: it is a preference OF THIS INSTALLATION, not of the rule set.
          · does NOT travel the LLMs and the AI providers: they live in the COMMON store, which several
                            extensions share. They are not censor's, so it is not censor's place to
                            export them — the core does, as an entry of its own in the bundle.

        Censor stores no credentials of its own (`llmId` is a reference, not a key), so
        `includeCredentials` does not change what comes out of here.
    */
    exportConfig = async (): Promise<unknown> => {
        const configs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_CONFIGS, false)) ?? []
        return { configs }
    }

    importConfig = async (data: unknown): Promise<IExtensionImportResult> => {
        const warnings: string[] = []

        // What arrives may come from another Kwirth and may have been hand-edited: it is not taken on trust.
        const entrantes = (data as { configs?: unknown })?.configs
        if (!Array.isArray(entrantes)) return { applied: 0, skipped: 0, warnings: ['no configs array in the imported data'] }

        const actuales: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_CONFIGS, false)) ?? []
        // The LLMs belong to the common store and may not exist here: that does not invalidate a config
        // — the LLM can be created later — but it has to be said, or the config goes silent unexplained.
        const llms: ILlm[] = (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []

        let applied = 0
        let skipped = 0
        for (const cruda of entrantes) {
            const cfg = cruda as ICensorInstanceConfig
            if (!cfg || typeof cfg.name !== 'string' || typeof cfg.version !== 'string') {
                skipped++
                warnings.push('a config without name or version was discarded')
                continue
            }
            if (cfg.llmId && !llms.some(l => l.id === cfg.llmId)) {
                warnings.push(`config '${cfg.name}' references LLM '${cfg.llmId}', which is not configured here`)
            }
            // Upsert by name+version, the same criterion CONFIGSAVE uses. This is where the idempotence
            // the contract demands comes from: re-importing the same leaves the same.
            const idx = actuales.findIndex(c => c.name === cfg.name && c.version === cfg.version)
            if (idx >= 0) actuales[idx] = cfg
            else actuales.push(cfg)
            applied++
        }

        await this.backChannelObject.writeStorage!(STORAGE_KEY_CONFIGS, false, actuales)
        return { applied, skipped, warnings }
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
                const raw = msg.data as ICensorInstanceConfig & { _llms?: ILlm[], _allConfigs?: ICensorInstanceConfig[], _autoStart?: boolean }
                const { _llms, _allConfigs, _autoStart, ...cfg } = raw
                instance.cfg = cfg as ICensorInstanceConfig
                if (_llms) await this.backChannelObject.writeStorageCommon!(STORAGE_KEY_LLMS, false, _llms)
                const llmList: ILlm[] = _llms ?? (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
                instance.llm = llmList.find((l: ILlm) => l.id === instance.cfg.llmId)
                // If the frontend sent the full config list, save it atomically here (no separate CONFIGSAVE race)
                if (_allConfigs) {
                    await this.backChannelObject.writeStorage!(STORAGE_KEY_CONFIGS, false, _allConfigs)
                }
                if (_autoStart !== undefined) await this.backChannelObject.writeStorage!(STORAGE_KEY_AUTOSTART, false, _autoStart)
                instance.scope = instance.instanceConfig.view === EInstanceConfigView.CLUSTER ? 'cluster' : 'resource'
                // Determine active configs (from the full list if provided, else from storage)
                const savedForActive: ICensorInstanceConfig[] = _allConfigs ?? ((await this.backChannelObject.readStorage!(STORAGE_KEY_CONFIGS, false)) ?? [])
                const activeConfigs = savedForActive.filter(c => c.active)
                const allActive: ICensorInstanceConfig[] = activeConfigs.length > 0 ? activeConfigs : [instance.cfg]
                if (!instance.ephemeralDescription) {
                    const existing = this.connections.flatMap(s => s.instances).map(i => i.ephemeralDescription).filter((d): d is string => !!d)
                    instance.ephemeralDescription = generateSessionName(existing)
                }
                this.syncRunners(instance, allActive, llmList)
                for (const runner of instance.runners.values()) runner.analyzing = instance.analyzing
                // Re-seed inventory: cluster re-discovers; resource keeps its selection (runnerIds already updated)
                if (instance.scope === 'cluster') await this.discoverClusterPods(instance)
                this.reconcileStreams(instance)
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
                let configs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_CONFIGS, false)) ?? []
                const idx = configs.findIndex(c => c.name === cfgToSave.name && c.version === cfgToSave.version)
                if (idx >= 0) configs[idx] = cfgToSave
                else configs.push(cfgToSave)
                await this.backChannelObject.writeStorage!(STORAGE_KEY_CONFIGS, false, configs)
                await this.executeConfigGet(webSocket, instance)
                return true
            }
            case ECensorCommand.CONFIGDELETE: {
                const { name, version } = msg.data as { name: string, version: string }
                const configs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_CONFIGS, false)) ?? []
                const filtered = configs.filter(c => !(c.name === name && c.version === version))
                await this.backChannelObject.writeStorage!(STORAGE_KEY_CONFIGS, false, filtered)
                await this.executeConfigGet(webSocket, instance)
                return true
            }
            case ECensorCommand.ANALYZESTART: {
                instance.analyzing = true
                instance.scope = instance.instanceConfig.view === EInstanceConfigView.CLUSTER ? 'cluster' : 'resource'
                const llms: ILlm[] = (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
                const savedConfigs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_CONFIGS, false)) ?? []
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
                // Starting the analysis is what opens the log streams
                this.reconcileStreams(instance)
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
                // Stopping the analysis closes the streams no analysing runner covers any more
                this.reconcileStreams(instance)
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

    // ── Motor autónomo: helpers ──────────────────────────────────────────────────

    private effectiveBatchSize(runner: IConfigRunner): number {
        const max = runner.cfg.batchSize ?? BATCH_SIZE
        if (runner.cfg.batchMode !== 'auto') return max
        return runner.currentBatchSize ?? max
    }

    // Direct send to the instance's WebSocket.
    // It locates the socket through connections so reconnections are honoured (updateConnection).
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

    // Can anything be analysed with these configs? It is the same condition that enables the Start
    // button: with no source configured the analysis would not receive a single line
    private someConfigHasSource(configs: ICensorInstanceConfig[]): boolean {
        return configs.some(c => Boolean(c.logstreamEnabled) || (c.businessSources?.length ?? 0) > 0)
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
        // Purging runnerless assets and adjusting streams is done by the caller once ALL the runners
        // are synchronised (purgeUnmatchedAssets + reconcileStreams)
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

    private assetsPayload(instance: IInstance): ICensorAssetInfo[] {
        return instance.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container, state: a.state }))
    }

    // The inventory is broadcast in batches: discovery and object registration cause many changes in a
    // row, and the front end replaces the whole list with every message
    private scheduleAssetsBroadcast(instance: IInstance): void {
        if (instance.assetsTimer) return
        instance.assetsTimer = setTimeout(() => {
            instance.assetsTimer = undefined
            this.sendEvent(instance, 'assets', { assets: this.assetsPayload(instance) })
        }, ASSETS_BROADCAST_DELAY)
    }

    // Registration in the INVENTORY (it opens no stream). If analysis is already running, the stream
    // starts right after. Callers apply their own candidate filtering (resource addObject filters;
    // cluster ADDED does not).
    private addAsset(instance: IInstance, ns: string, pod: string, container: string): void {
        if (instance.assets.some(a => a.namespace === ns && a.pod === pod && a.container === container)) return
        const runnerIds = new Set<string>()
        for (const [rkey, runner] of instance.runners) {
            if (this.podMatchesRunnerCfg(runner.cfg, ns, pod)) runnerIds.add(rkey)
        }
        const asset: IAsset = { namespace: ns, pod, container, runnerIds, state: ECensorAssetState.IDLE, reconnectAttempts: 0 }
        instance.assets.push(asset)
        if (this.assetShouldStream(instance, asset)) this.startAssetStream(instance, asset)
        this.scheduleAssetsBroadcast(instance)
    }

    // An asset only needs a stream when some runner covering it is analysing
    private assetShouldStream(instance: IInstance, asset: IAsset): boolean {
        for (const rkey of (asset.runnerIds ?? [])) {
            if (instance.runners.get(rkey)?.analyzing) return true
        }
        return false
    }

    private startAssetStream(instance: IInstance, asset: IAsset): void {
        if (asset.passThroughStream) return
        const { namespace: ns, pod, container } = asset
        const logStream = new PassThrough()
        asset.passThroughStream = logStream
        asset.state = ECensorAssetState.STREAMING
        logStream.setEncoding('utf8')
        logStream.on('data', (chunk: string) => {
            // If data arrives the stream is healthy: the retry count is reset
            asset.reconnectAttempts = 0
            this.processChunk(instance, asset, chunk)
        })
        logStream.on('error', (err: Error) => {
            this.backChannelObject.logWarning?.(`[censor] log stream failure for ${ns}/${pod}/${container}: ${err}`)
            this.handleStreamClosed(instance, asset, logStream)
        })
        // The k8s client does pipe(response.body, stream) with end:true, so a cut in the body (common
        // with follow) closes this PassThrough. That does NOT mean the container is gone: it reconnects
        // as long as analysis continues, and the asset never leaves the inventory.
        logStream.on('end', () => this.handleStreamClosed(instance, asset, logStream))
        // ONLY what is new is requested: 'tailLines' brought the last line of each container's history,
        // and with the analysis freshly started that filled the LLM's first batch with old, out-of-order
        // lines. After an involuntary cut the lost window is recovered (bounded), so no gap of logs is
        // left unanalysed.
        const gapSeconds = asset.streamClosedAt ? Math.ceil((Date.now() - asset.streamClosedAt) / 1000) : 0
        const sinceSeconds = Math.max(1, Math.min(gapSeconds, MAX_GAP_RECOVERY_SECONDS))
        const logApi = (this.clusterInfo as { logApi: { log: (ns: string, pod: string, container: string, stream: PassThrough, opts: unknown) => Promise<AbortController> } }).logApi
        logApi.log(ns, pod, container, logStream, { follow: true, pretty: false, timestamps: false, sinceSeconds })
            .then(controller => {
                // If the asset has already closed or replaced this stream, the request is redundant
                if (asset.passThroughStream === logStream) asset.abortController = controller
                else controller.abort()
            })
            .catch(err => {
                this.backChannelObject.logWarning?.(`[censor] log stream error for ${ns}/${pod}/${container}: ${err}`)
                this.handleStreamClosed(instance, asset, logStream)
            })
    }

    // Stream close or failure: it reconnects with backoff while analysis continues, and otherwise goes
    // idle. The asset stays in the inventory either way.
    private handleStreamClosed(instance: IInstance, asset: IAsset, closed: PassThrough): void {
        if (asset.passThroughStream !== closed) return
        asset.passThroughStream = undefined
        asset.streamClosedAt = Date.now()
        closed.removeAllListeners()
        closed.destroy()
        asset.abortController?.abort()
        asset.abortController = undefined
        if (asset.reconnectTimer) { clearTimeout(asset.reconnectTimer); asset.reconnectTimer = undefined }

        if (!this.assetShouldStream(instance, asset)) {
            asset.state = ECensorAssetState.IDLE
            this.scheduleAssetsBroadcast(instance)
            return
        }
        asset.reconnectAttempts++
        if (asset.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
            this.backChannelObject.logWarning?.(`[censor] giving up on log stream for ${asset.namespace}/${asset.pod}/${asset.container} after ${MAX_RECONNECT_ATTEMPTS} attempts`)
            asset.state = ECensorAssetState.FAILED
            this.scheduleAssetsBroadcast(instance)
            return
        }
        asset.state = ECensorAssetState.RECONNECTING
        this.scheduleAssetsBroadcast(instance)
        const delay = RECONNECT_DELAYS[Math.min(asset.reconnectAttempts - 1, RECONNECT_DELAYS.length - 1)]
        asset.reconnectTimer = setTimeout(() => {
            asset.reconnectTimer = undefined
            if (!instance.assets.includes(asset) || !this.assetShouldStream(instance, asset)) {
                asset.state = ECensorAssetState.IDLE
                this.scheduleAssetsBroadcast(instance)
                return
            }
            this.startAssetStream(instance, asset)
            this.scheduleAssetsBroadcast(instance)
        }, delay)
    }

    // Closes an asset's stream (aborting the request to the api server) without touching the inventory
    private stopAssetStream(asset: IAsset): void {
        if (asset.reconnectTimer) { clearTimeout(asset.reconnectTimer); asset.reconnectTimer = undefined }
        const logStream = asset.passThroughStream
        asset.passThroughStream = undefined
        asset.abortController?.abort()
        asset.abortController = undefined
        if (logStream) {
            logStream.removeAllListeners()
            logStream.destroy()
        }
        asset.reconnectAttempts = 0
        // Deliberate close (analysis stopped, object removed): on starting again the analysis picks up
        // from that moment, and what was emitted while it was stopped is not recovered
        asset.streamClosedAt = undefined
        asset.state = ECensorAssetState.IDLE
    }

    // Adjusts the streams to the analysis state: opens the missing ones and closes those no longer needed
    private reconcileStreams(instance: IInstance): void {
        for (const asset of instance.assets) {
            const shouldStream = this.assetShouldStream(instance, asset)
            if (shouldStream) {
                if (asset.passThroughStream || asset.reconnectTimer) continue
                if (asset.state === ECensorAssetState.FAILED) asset.reconnectAttempts = 0
                this.startAssetStream(instance, asset)
            }
            else if (asset.passThroughStream || asset.reconnectTimer || asset.state !== ECensorAssetState.IDLE) {
                this.stopAssetStream(asset)
            }
        }
        this.scheduleAssetsBroadcast(instance)
    }

    // Removal from the inventory (closing the stream if there was one)
    private removeAssets(instance: IInstance, matches: (asset: IAsset) => boolean): void {
        const toRemove = instance.assets.filter(matches)
        if (toRemove.length === 0) return
        for (const asset of toRemove) this.stopAssetStream(asset)
        instance.assets = instance.assets.filter(a => !toRemove.includes(a))
        this.scheduleAssetsBroadcast(instance)
    }

    // Cluster: assets that no longer match any runner leave the inventory (in resource mode the user's
    // selection rules). Called after synchronising ALL the runners, never inside the loop.
    private purgeUnmatchedAssets(instance: IInstance): void {
        if (instance.scope !== 'cluster') return
        this.removeAssets(instance, a => (a.runnerIds?.size ?? 0) === 0)
    }

    // Cluster-mode discovery: list all pods and inventory those matching any runner's logstream config
    // (inventorying opens no streams: that is decided by the analysis state)
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
                if (passes) for (const c of containers) this.addAsset(instance, ns, name, c.name)
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
                this.removeAssets(instance, a => a.pod === podName && a.namespace === namespace)
            }
            return
        }

        if (type === 'ADDED') {
            const containers = obj.spec?.containers?.map(c => c.name) ?? []
            if (containers.length === 0) return
            for (const instance of allInstances) {
                if (instance.scope !== 'cluster') continue
                for (const containerName of containers) this.addAsset(instance, namespace, podName, containerName)
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
        // The assets are left without this runner, but they are not purged here: a runner entering later
        // in the same synchronisation may cover them (syncRunners takes care of that at the end)
        for (const asset of instance.assets) asset.runnerIds?.delete(rk)
        this.sendEvent(instance, 'analyzing', { analyzing: false, runnerKey: rk })
    }

    // Reconcile runners with the given active configs: drop stale, create/update active
    private syncRunners(instance: IInstance, allActive: ICensorInstanceConfig[], llmList: ILlm[]): void {
        const activeKeys = new Set(allActive.map(c => `${c.name}:${c.version}`))
        for (const rk of [...instance.runners.keys()]) if (!activeKeys.has(rk)) this.removeRunner(instance, rk)
        for (const cfg of allActive) this.createOrUpdateRunner(instance, cfg, llmList)
        this.purgeUnmatchedAssets(instance)
        this.reconcileStreams(instance)
    }

    // Seed runners for this instance from the active configs (ephemeral: only while the WS is open)
    private seedRunners = async (webSocket: WebSocket, instance: IInstance, activeConfigsOverride?: ICensorInstanceConfig[]): Promise<void> => {
        let allActive: ICensorInstanceConfig[]
        if (activeConfigsOverride !== undefined) {
            allActive = activeConfigsOverride
        } else {
            const savedConfigs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_CONFIGS, false)) ?? []
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
        // Autostart of the ANALYSIS (not of the channel, which is already started if we are here): with
        // the flag set, everything active is started, exactly as pressing Start in the topbar does
        const autoStart: boolean = ((await this.backChannelObject.readStorage!(STORAGE_KEY_AUTOSTART, false)) ?? false) === true
        if (autoStart && this.someConfigHasSource(allActive)) instance.analyzing = true
        for (const [rk, runner] of instance.runners) {
            runner.analyzing = instance.analyzing
            this.sendEvent(instance, 'analyzing', { analyzing: runner.analyzing, runnerKey: rk })
        }
        this.purgeUnmatchedAssets(instance)
        if (instance.scope === 'cluster') await this.discoverClusterPods(instance)
        this.reconcileStreams(instance)
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
                    const rawConfigs = await this.backChannelObject.readStorage!(STORAGE_KEY_CONFIGS, false)
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

        // Seed runners once (ephemeral: only while the WS is open)
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

        this.addAsset(instance, ns, pod, container)
        return true
    }

    private executeConfigGet = async (webSocket: WebSocket, instance: IInstance, llmsOverride?: ILlm[]): Promise<void> => {
        const llms: ILlm[] = llmsOverride ?? (await this.backChannelObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
        const configs: ICensorInstanceConfig[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_CONFIGS, false)) ?? []
        const autoStart: boolean = ((await this.backChannelObject.readStorage!(STORAGE_KEY_AUTOSTART, false)) ?? false) === true
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
            autoStart,
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
        if (instance.assetsTimer) { clearTimeout(instance.assetsTimer); instance.assetsTimer = undefined }
        for (const runner of instance.runners.values()) {
            if (runner.flushTimer) { clearTimeout(runner.flushTimer); runner.flushTimer = undefined }
            if (runner.receivedTimer) { clearTimeout(runner.receivedTimer); runner.receivedTimer = undefined }
        }
        for (const asset of instance.assets) this.stopAssetStream(asset)
        instance.assets = []
        instance.runners.clear()
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, ns: string, pod: string, container: string): Promise<boolean> => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeAssets(instance, a => a.namespace === ns && a.pod === pod && (container === '' || a.container === container))
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
