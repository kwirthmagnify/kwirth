import { IDaemonInstanceConfig, BackDaemonData, IBackDaemonRequirements, IBackDaemonObject, IDaemonEvent } from '@kwirthmagnify/kwirth-common'
import { IDaemon } from '@kwirthmagnify/kwirth-common-back'
import { ILlm, ILlmProvider, STORAGE_KEY_LLMS, STORAGE_KEY_PROVIDERS } from '@kwirthmagnify/kwirth-common-ai'
import { buildModel, loadModels, zodFromExample } from '@kwirthmagnify/kwirth-common-ai/back'
import { PassThrough } from 'stream'
import * as stream from 'stream'
import { generateText, Output } from 'ai'

const BATCH_SIZE = 50
const MAX_LINE_BUFFER = 25000

const cleanANSI = (text: string): string => text.replace(/\x1b\[[0-9;]*[mKHVfJrcegH]|\x1b\[\d*n/g, '')

const DEFAULT_SYSTEM = 'You are a log analysis assistant. Analyze the provided log lines and identify patterns for noise/boilerplate entries that are not useful for debugging. Return ONLY a valid JSON array of JavaScript-compatible regex pattern strings (no explanation, no markdown, no code blocks). Each pattern should match an entire noisy line. Example output: ["^.*heartbeat.*$","^\\d{4}-\\d{2}-\\d{2}.*INFO.*health check"]. If no noise patterns are found, return [].'
const DEFAULT_USER_PROMPT = (count: number) => `Analyze these ${count} log lines:`

export interface ICensorInstanceConfig {
    name: string
    version: string

    // for invoking LLM
    llmId: string
    system?: string
    batchSize?: number
    exampleJson?: string
    temperature?: number
    active?: boolean

    // for ingesting business events
    businessSources?: Array<{ space?: string; type?: string; businessPath?: string; addTimestamp?: boolean }>
    // for ingesting syslog events
    syslogSources?: Array<{ sourceIp?: string; hostname?: string; appName?: string; severity?: number; filter?: string; addTimestamp?: boolean }>
    // legacy single-source fields (backwards compat)
    space?: string
    type?: string
    addTimestamp?: boolean
    businessPath?: string

    // for alerting
    senderId?: string
    senderConfigName?: string

    mode?: 'inference' | 'audit'
    batchMode?: 'fixed' | 'auto'
    batchSizeMin?: number
    maxLineLength?: number
    batchTimeout?: number
    scope?: 'cluster' | 'resource'
    logstreamEnabled?: boolean
    logstreamAll?: boolean
    logstreamSources?: Array<{ namespace?: string; podRegex?: string; labelSelector?: string }>
}

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

export enum ECensorDaemonCommand {
    CONFIGGET = 'configget',
    CONFIGSET = 'configset',
    CONFIGSAVE = 'configsave',
    CONFIGDELETE = 'configdelete',
    PROVIDERSAVAILABLE = 'providersavailable',
    PROVIDERSGET = 'providersget',
    PROVIDERSSET = 'providersset',
    ANALYZESTART = 'analyzestart',
    ANALYZESTOP = 'analyzestop',
    REGEXDELETE = 'regexdelete',
    STATSGET = 'statsget',
    REGEXGET = 'regexget',
    ANALYZESTATE = 'analyzestate',
}

interface IAsset {
    namespace: string
    pod: string
    container: string
    passThroughStream: PassThrough
    runnerIds: Set<string>
}

interface IConfigRunner {
    cfg: ICensorInstanceConfig
    analyzing: boolean
    processedCount: number
    syslogCount: number
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

interface IAccumRegex {
    pattern: string
    compiled: RegExp
    example: string
    explanation: string
    matches: number
}

interface IDaemonInstance {
    instanceId: string
    // Per-instance shared state
    assets: IAsset[]
    subscribers: Set<(event: unknown) => void>
    ephemeral?: boolean
    scope?: string
    runners: Map<string, IConfigRunner>
    // Legacy flat fields (kept during migration — will be removed once all methods use runners)
    cfg: ICensorInstanceConfig
    analyzing: boolean
    _initReady?: Promise<void>
    processedCount: number
    syslogCount: number
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

export class CensorDaemon implements IDaemon {
    readonly daemonId = 'censor'
    readonly requirements: IBackDaemonRequirements = {
        storage: true,
        providers: ['events', 'business', 'syslog']
    }

    private clusterInfo: unknown
    private backDaemonObject: IBackDaemonObject
    private instances = new Map<string, IDaemonInstance>()
    private pendingSubscribers = new Map<string, Set<(event: unknown) => void>>()
    private providers: ILlmProvider[] = []

    constructor(clusterInfo: unknown, backDaemonObject: IBackDaemonObject) {
        this.clusterInfo = clusterInfo
        this.backDaemonObject = backDaemonObject
    }

    getDaemonData(): BackDaemonData {
        return {
            id: 'censor'
        }
    }

    async startDaemon(): Promise<void> {
        const stored: ILlmProvider[] = ((await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_PROVIDERS, true)) ?? []) as ILlmProvider[]
        this.providers = stored
        await loadModels(this.providers, this.backDaemonObject)

        const configs: ICensorInstanceConfig[] = ((await this.backDaemonObject.readStorage!('censor-configs', false)) ?? []) as ICensorInstanceConfig[]
        const activeSessions = configs.filter(c => c.active)
        if (activeSessions.length === 0) {
            console.log('[censor] No persistent sessions configured.')
        } else {
            console.log(`[censor] Persistent sessions to start (${activeSessions.length}):`)
            activeSessions.forEach(c => console.log(`  - ${c.name} v${c.version} (llm: ${c.llmId})`))
        }
    }

    async initInstance(instanceConfig: IDaemonInstanceConfig): Promise<void> {
        const dataCfg = instanceConfig.data as (ICensorInstanceConfig & { _llms?: ILlm[] }) | undefined
        const scope = dataCfg?.scope ?? 'resource'
        const logstreamEnabled = dataCfg?.logstreamEnabled ?? false
        console.log(`[censor-daemon] initInstance ${instanceConfig.id} scope=${scope} logstreamEnabled=${logstreamEnabled}`)
        if (scope !== 'cluster' || !logstreamEnabled) return

        const logstreamAll = dataCfg?.logstreamAll ?? false
        const logstreamSources = dataCfg?.logstreamSources ?? []
        console.log(`[censor-daemon] initInstance cluster discovery: logstreamAll=${logstreamAll} sources=${logstreamSources.length}`)

        try {
            const coreApi = (this.clusterInfo as any).coreApi
            const podList = await coreApi.listPodForAllNamespaces()
            let matched = 0
            for (const pod of (podList.items ?? [])) {
                const ns: string = pod.metadata?.namespace
                const name: string = pod.metadata?.name
                if (!ns || !name) continue
                const labels: Record<string, string> = pod.metadata?.labels ?? {}
                const containers: { name: string }[] = pod.spec?.containers ?? []
                let passes = logstreamAll
                if (!passes && logstreamSources.length) {
                    const basicMatches = logstreamSources.filter((src: { namespace?: string; podRegex?: string; labelSelector?: string }) => {
                        if (src.namespace && src.namespace !== ns) return false
                        if (src.podRegex) { try { if (!new RegExp(src.podRegex).test(name)) return false } catch { return false } }
                        return true
                    })
                    passes = basicMatches.some((src: { labelSelector?: string }) => !src.labelSelector || matchesLabelSelector(labels, src.labelSelector))
                }
                if (passes) {
                    matched++
                    for (const c of containers) {
                        console.log(`[censor-daemon] initInstance adding ${ns}/${name}/${c.name}`)
                        await this.addObject(instanceConfig, ns, name, c.name)
                    }
                }
            }
            console.log(`[censor-daemon] initInstance discovery done: matched=${matched} of ${(podList.items ?? []).length}`)
        } catch (e) {
            this.backDaemonObject.logWarning?.(`[censor-daemon] initInstance discovery error: ${e}`)
        }
    }

    private async rediscoverClusterPods(inst: IDaemonInstance): Promise<void> {
        const cfg = inst.cfg
        if (!cfg.logstreamEnabled) return
        const logstreamAll = cfg.logstreamAll ?? false
        const logstreamSources = cfg.logstreamSources ?? []
        console.log(`[censor-daemon] rediscoverClusterPods: logstreamAll=${logstreamAll} sources=${logstreamSources.length}`)
        try {
            const coreApi = (this.clusterInfo as any).coreApi
            const podList = await coreApi.listPodForAllNamespaces()
            const fakeInstanceConfig = { id: inst.instanceId, daemonId: 'censor', description: '', view: 4, namespace: '', data: { ...cfg, scope: 'cluster' }, started: true, createdAt: '' } as IDaemonInstanceConfig
            let matched = 0
            for (const pod of (podList.items ?? [])) {
                const ns: string = pod.metadata?.namespace
                const name: string = pod.metadata?.name
                if (!ns || !name) continue
                const labels: Record<string, string> = pod.metadata?.labels ?? {}
                const containers: { name: string }[] = pod.spec?.containers ?? []
                let passes = logstreamAll
                if (!passes && logstreamSources.length) {
                    const basicMatches = logstreamSources.filter((src: { namespace?: string; podRegex?: string; labelSelector?: string }) => {
                        if (src.namespace && src.namespace !== ns) return false
                        if (src.podRegex) { try { if (!new RegExp(src.podRegex).test(name)) return false } catch { return false } }
                        return true
                    })
                    passes = basicMatches.some((src: { labelSelector?: string }) => !src.labelSelector || matchesLabelSelector(labels, src.labelSelector))
                }
                if (passes) {
                    matched++
                    for (const c of containers) {
                        console.log(`[censor-daemon] rediscoverClusterPods adding ${ns}/${name}/${c.name}`)
                        await this.addObject(fakeInstanceConfig, ns, name, c.name)
                    }
                }
            }
            console.log(`[censor-daemon] rediscoverClusterPods done: matched=${matched} of ${(podList.items ?? []).length}`)
        } catch (e) {
            this.backDaemonObject.logWarning?.(`[censor-daemon] rediscoverClusterPods error: ${e}`)
        }
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

    containsInstance(instanceId: string): boolean {
        return this.instances.has(instanceId)
    }

    containsAsset(instanceId: string, podNamespace: string, podName: string, containerName: string): boolean {
        const inst = this.instances.get(instanceId)
        if (!inst) return false
        return inst.assets.some(a => a.namespace === podNamespace && a.pod === podName && a.container === containerName)
    }

    async addObject(instanceConfig: IDaemonInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> {
        let inst = this.instances.get(instanceConfig.id)
        if (!inst) {
            inst = {
                instanceId: instanceConfig.id,
                cfg: { name: '', version: '1', llmId: '', system: '', batchSize: 50, exampleJson: '{"patterns":[""]}' },
                assets: [],
                runners: new Map(),
                analyzing: false,
                processedCount: 0,
                syslogCount: 0,
                llmCount: 0,
                llmLinesCount: 0,
                totalBytesProcessed: 0,
                tokensIn: 0,
                tokensOut: 0,
                lineBuffer: [],
                regexes: [],
                llmBusy: false,
                llmErrorCooldownUntil: 0,
                subscribers: new Set(),
                lastStatsBroadcast: 0,
                lastRegexStatsBroadcast: 0,
                pendingReceivedLines: []
            }
            this.instances.set(instanceConfig.id, inst)

            const savedCfg: ICensorInstanceConfig = inst.cfg
            const dataCfg = instanceConfig.data as (ICensorInstanceConfig & { _llms?: ILlm[] }) | undefined
            const cfg = dataCfg?.llmId ? dataCfg : savedCfg
            const storedLlms: ILlm[] = ((await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []) as ILlm[]
            const llms: ILlm[] = storedLlms.length > 0 ? storedLlms : (dataCfg?._llms ?? [])
            const llm = cfg.llmId ? llms.find(l => l.id === cfg.llmId) : undefined

            inst.cfg = cfg
            inst.llm = llm
            inst.analyzing = true
            inst.ephemeral = !!(instanceConfig.data as any)?.ephemeral
            inst.scope = (instanceConfig.data as any)?.scope ?? 'resource'

            const pending = this.pendingSubscribers.get(instanceConfig.id)
            if (pending) {
                for (const cb of pending) inst.subscribers.add(cb)
                this.pendingSubscribers.delete(instanceConfig.id)
            }
        }

        if (inst.assets.some(a => a.namespace === podNamespace && a.pod === podName && a.container === containerName)) {
            console.log(`[censor-daemon] addObject ALREADY ${podNamespace}/${podName}/${containerName} — skipping`)
            return true
        }

        // Logstream filter
        console.log(`[censor-daemon] addObject filter ${podNamespace}/${podName}/${containerName}: logstreamEnabled=${inst.cfg.logstreamEnabled} logstreamAll=${inst.cfg.logstreamAll} sources=${JSON.stringify(inst.cfg.logstreamSources)}`)
        if (!inst.cfg.logstreamEnabled) {
            console.log(`[censor-daemon] addObject SKIP ${podNamespace}/${podName}/${containerName}: logstreamEnabled=false`)
            return true
        }
        if (!inst.cfg.logstreamAll) {
            const sources = inst.cfg.logstreamSources ?? []
            if (sources.length === 0) {
                console.log(`[censor-daemon] addObject SKIP ${podNamespace}/${podName}/${containerName}: no sources configured`)
                return true
            }
            const basicMatches = sources.filter(src => {
                if (src.namespace && src.namespace !== podNamespace) return false
                if (src.podRegex) { try { if (!new RegExp(src.podRegex).test(podName)) return false } catch { return false } }
                return true
            })
            if (basicMatches.length === 0) {
                console.log(`[censor-daemon] addObject SKIP ${podNamespace}/${podName}/${containerName}: no basic match`)
                return true
            }
            if (basicMatches.some(src => src.labelSelector)) {
                let labels: Record<string, string> = {}
                try {
                    const coreApi = (this.clusterInfo as any).coreApi
                    const podRes = await coreApi.readNamespacedPod({ name: podName, namespace: podNamespace })
                    labels = podRes.metadata?.labels ?? {}
                } catch {}
                const fullMatch = basicMatches.some(src => !src.labelSelector || matchesLabelSelector(labels, src.labelSelector))
                if (!fullMatch) {
                    console.log(`[censor-daemon] addObject SKIP ${podNamespace}/${podName}/${containerName}: labelSelector no match`)
                    return true
                }
            }
        }
        console.log(`[censor-daemon] addObject PASS ${podNamespace}/${podName}/${containerName} — starting log stream`)

        const logStream = new stream.PassThrough()
        const asset: IAsset = { namespace: podNamespace, pod: podName, container: containerName, passThroughStream: logStream, runnerIds: new Set() }
        // Populate runnerIds: which runners want to process this pod's stream
        for (const [rkey, runner] of inst.runners) {
            if (this.podMatchesRunnerCfg(runner.cfg, podNamespace, podName)) {
                asset.runnerIds.add(rkey)
            }
        }
        console.log(`[censor-daemon] addObject: asset ${podNamespace}/${podName} runnerIds=[${[...asset.runnerIds].join(',')}] (${inst.runners.size} runners total)`)
        inst.assets.push(asset)

        logStream.setEncoding('utf8')
        logStream.on('data', (chunk: string) => this.processChunk(inst!, asset, chunk))
        logStream.on('end', () => {
            inst!.assets = inst!.assets.filter(a => a !== asset)
            this.broadcast(inst!, 'assets', { assets: inst!.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
        })

        const logApi = (this.clusterInfo as { logApi: { log: (ns: string, pod: string, container: string, stream: stream.PassThrough, opts: unknown) => Promise<void> } }).logApi
        logApi.log(podNamespace, podName, containerName, logStream, { follow: true, pretty: false, timestamps: false, tailLines: 1 })
            .catch(err => {
                this.backDaemonObject.logWarning?.(`[censor-daemon] log stream error for ${podNamespace}/${podName}/${containerName}: ${err}`)
                inst!.assets = inst!.assets.filter(a => a !== asset)
                this.broadcast(inst!, 'assets', { assets: inst!.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
            })

        this.broadcast(inst, 'assets', { assets: inst.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
        return true
    }

    async deleteObject(instanceConfig: IDaemonInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> {
        const inst = this.instances.get(instanceConfig.id)
        if (!inst) return true
        const toRemove = inst.assets.filter(a => a.namespace === podNamespace && a.pod === podName && (containerName === '' || a.container === containerName))
        for (const asset of toRemove) {
            asset.passThroughStream.removeAllListeners()
            asset.passThroughStream.destroy()
        }
        inst.assets = inst.assets.filter(a => !(a.namespace === podNamespace && a.pod === podName && (containerName === '' || a.container === containerName)))
        this.broadcast(inst, 'assets', { assets: inst.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
        return true
    }

    stopInstance(instanceId: string): void {
        const inst = this.instances.get(instanceId)
        if (!inst) return
        if (inst.receivedTimer) { clearTimeout(inst.receivedTimer); inst.receivedTimer = undefined }
                    if (inst.flushTimer) { clearTimeout(inst.flushTimer); inst.flushTimer = undefined }
        for (const asset of inst.assets) {
            asset.passThroughStream.removeAllListeners()
            asset.passThroughStream.destroy()
        }
        this.instances.delete(instanceId)
        this.pendingSubscribers.delete(instanceId)
    }

    getProviderSubscriptionData(providerId: string): unknown {
        if (providerId === 'business') {
            const spacesMap = new Map<string, Set<string>>()
            for (const inst of this.instances.values()) {
                const sources = inst.cfg.businessSources?.length
                    ? inst.cfg.businessSources
                    : (inst.cfg.space || inst.cfg.businessPath)
                        ? [{ space: inst.cfg.space, type: inst.cfg.type, businessPath: inst.cfg.businessPath }]
                        : []
                for (const src of sources) {
                    if (!src.businessPath || !src.space) continue
                    const types = spacesMap.get(src.space) ?? new Set<string>()
                    types.add(src.type ?? '')
                    spacesMap.set(src.space, types)
                }
            }
            const spaces = Array.from(spacesMap.entries()).map(([name, types]) => ({ name, types: Array.from(types) }))
            return spaces.length > 0 ? { spaces } : undefined
        }
        return {}
    }

    processProviderEvent(providerId: string, event: unknown): void {
        if (providerId === 'events') {
            const { type, obj } = event as { type: string, obj: { kind: string, metadata: { name: string, namespace: string }, spec?: { containers?: { name: string }[] } } }
            if (obj.kind !== 'Pod') return
            const podName = obj.metadata.name
            const namespace = obj.metadata.namespace

            if (type === 'DELETED') {
                for (const inst of this.instances.values()) {
                    const before = inst.assets.length
                    inst.assets = inst.assets.filter(a => !(a.pod === podName && a.namespace === namespace))
                    if (inst.assets.length !== before) {
                        this.broadcast(inst, 'assets', { assets: inst.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
                    }
                }
                return
            }

            if (type === 'ADDED') {
                const containers = obj.spec?.containers?.map(c => c.name) ?? []
                if (containers.length === 0) return
                const logApi = (this.clusterInfo as { logApi: { log: (ns: string, pod: string, container: string, stream: stream.PassThrough, opts: unknown) => Promise<void> } }).logApi
                for (const inst of this.instances.values()) {
                    if (inst.cfg.scope !== 'cluster') continue
                    for (const containerName of containers) {
                        if (inst.assets.some(a => a.namespace === namespace && a.pod === podName && a.container === containerName)) continue
                        const logStream = new stream.PassThrough()
                        const asset: IAsset = { namespace, pod: podName, container: containerName, passThroughStream: logStream, runnerIds: new Set() }
                        // Populate runnerIds for dynamically-discovered cluster pods
                        for (const [rkey, runner] of inst.runners) {
                            if (this.podMatchesRunnerCfg(runner.cfg, namespace, podName)) asset.runnerIds.add(rkey)
                        }
                        inst.assets.push(asset)
                        logStream.setEncoding('utf8')
                        logStream.on('data', (chunk: string) => this.processChunk(inst!, asset, chunk))
                        logStream.on('end', () => {
                            inst!.assets = inst!.assets.filter(a => a !== asset)
                            this.broadcast(inst!, 'assets', { assets: inst!.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
                        })
                        logApi.log(namespace, podName, containerName, logStream, { follow: true, pretty: false, timestamps: false, tailLines: 1 })
                            .catch(err => {
                                this.backChannelObject.logWarning?.(`[censor-daemon] cluster log stream error ${namespace}/${podName}/${containerName}: ${err}`)
                                inst!.assets = inst!.assets.filter(a => a !== asset)
                                this.broadcast(inst!, 'assets', { assets: inst!.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
                            })
                    }
                    this.broadcast(inst, 'assets', { assets: inst.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
                }
                return
            }
            return
        }

        if (providerId === 'syslog') {
            const msg = event as { message: string; raw: string; sourceIp?: string; hostname: string; appName: string; severity: number }
            const text = msg.message || msg.raw
            if (!text) return
            for (const inst of this.instances.values()) {
                if (inst.runners.size > 0) {
                    // Runner-based fan-out: each runner checks its own syslogSources independently
                    let displayed = false
                    for (const [, runner] of inst.runners) {
                        if (!runner.analyzing) continue
                        const rSources = runner.cfg.syslogSources?.length ? runner.cfg.syslogSources : []
                        const matchingSrc = rSources.find(src => {
                            if (src.sourceIp && src.sourceIp !== msg.sourceIp) return false
                            if (src.hostname && src.hostname !== msg.hostname) return false
                            if (src.appName && src.appName !== msg.appName) return false
                            if (src.severity !== undefined && msg.severity > src.severity) return false
                            if (src.filter) { try { if (!new RegExp(src.filter).test(msg.raw)) return false } catch { return false } }
                            return true
                        })
                        if (!matchingSrc) continue
                        runner.syslogCount++
                        const ts = new Date().toISOString()
                        const llmText = matchingSrc.addTimestamp ? `${ts} ${text}` : text
                        if (!displayed) {
                            this.broadcast(inst, 'syslog', { text, namespace: msg.hostname, pod: msg.appName, container: '', timestamp: ts })
                            displayed = true
                        }
                        runner.processedCount++
                        const clean = cleanANSI(llmText)
                        let filtered = false
                        for (const r of runner.regexes) {
                            try { if (r.compiled.test(clean)) { r.matches++; filtered = true } } catch {}
                        }
                        if (!filtered) {
                            const batchSize = this.effectiveBatchSize(inst, runner)
                            if (runner.lineBuffer.length < MAX_LINE_BUFFER) runner.lineBuffer.push(clean)
                            if (runner.lineBuffer.length >= batchSize && !runner.llmBusy && Date.now() >= runner.llmErrorCooldownUntil) {
                                const batch = runner.lineBuffer.splice(0, batchSize)
                                this.callLlm(inst, batch, runner)
                            }
                        }
                        this.broadcastStats(inst, runner)
                    }
                } else {
                    // Flat fallback
                    if (!inst.analyzing) continue
                    const sources = inst.cfg.syslogSources?.length ? inst.cfg.syslogSources : []
                    const matchingSrc = sources.find(src => {
                        if (src.sourceIp && src.sourceIp !== msg.sourceIp) return false
                        if (src.hostname && src.hostname !== msg.hostname) return false
                        if (src.appName && src.appName !== msg.appName) return false
                        if (src.severity !== undefined && msg.severity > src.severity) return false
                        if (src.filter) {
                            try { if (!new RegExp(src.filter).test(msg.raw)) return false } catch { return false }
                        }
                        return true
                    })
                    if (!matchingSrc) continue
                    inst.syslogCount++
                    const ts = new Date().toISOString()
                    const llmText = matchingSrc.addTimestamp ? `${ts} ${text}` : text
                    this.broadcast(inst, 'syslog', { text, namespace: msg.hostname, pod: msg.appName, container: '', timestamp: ts })
                    if (inst.analyzing) {
                        inst.processedCount++
                        const clean = cleanANSI(llmText)
                        let filtered = false
                        for (const r of inst.regexes) {
                            try { if (r.compiled.test(clean)) { r.matches++; filtered = true } } catch {}
                        }
                        if (!filtered) {
                            const batchSize = this.effectiveBatchSize(inst)
                            if (inst.lineBuffer.length < MAX_LINE_BUFFER) inst.lineBuffer.push(clean)
                            if (inst.lineBuffer.length >= batchSize && !inst.llmBusy && Date.now() >= inst.llmErrorCooldownUntil) {
                                const batch = inst.lineBuffer.splice(0, batchSize)
                                this.callLlm(inst, batch)
                            }
                        }
                        this.broadcastStats(inst)
                    }
                }
            }
            return
        }

        if (providerId === 'business') {
            const bEvent = event as { last: { event: { space: string, type: string, data: unknown } } }
            const eventSpace = bEvent.last?.event?.space ?? ''
            const eventType = bEvent.last?.event?.type ?? ''
            const eventBody = bEvent.last?.event
            this.backDaemonObject.logInfo?.(`[censor-daemon] business event: space='${eventSpace}' type='${eventType}' instances=${this.instances.size} body=${JSON.stringify(eventBody).slice(0, 200)}`)
            for (const inst of this.instances.values()) {
                if (inst.runners.size > 0) {
                    // Runner-based fan-out: each runner checks its own businessSources independently
                    let displayed = false
                    for (const [, runner] of inst.runners) {
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
                            this.broadcast(inst, 'business', { text: String(text), namespace: eventSpace, pod: eventType, container: '', timestamp: ts })
                            displayed = true
                        }
                        runner.processedCount++
                        const clean = cleanANSI(llmText)
                        let filtered = false
                        for (const r of runner.regexes) {
                            try { if (r.compiled.test(clean)) { r.matches++; filtered = true } } catch {}
                        }
                        if (!filtered) {
                            const batchSize = this.effectiveBatchSize(inst, runner)
                            if (runner.lineBuffer.length < MAX_LINE_BUFFER) runner.lineBuffer.unshift(clean)
                            if (runner.lineBuffer.length >= batchSize && !runner.llmBusy && Date.now() >= runner.llmErrorCooldownUntil) {
                                const batch = runner.lineBuffer.splice(0, batchSize)
                                this.callLlm(inst, batch, runner)
                            }
                        }
                        this.broadcastStats(inst, runner)
                    }
                } else {
                    // Flat fallback
                    if (!inst.analyzing) continue
                    const sources = inst.cfg.businessSources?.length
                        ? inst.cfg.businessSources
                        : (inst.cfg.space || inst.cfg.businessPath)
                            ? [{ space: inst.cfg.space, type: inst.cfg.type, businessPath: inst.cfg.businessPath, addTimestamp: inst.cfg.addTimestamp }]
                            : []
                    const matchingSrc = sources.find(src => {
                        if (!src.businessPath) return false
                        if (src.space && src.space !== eventSpace) return false
                        if (src.type && src.type !== eventType) return false
                        return true
                    })
                    if (!matchingSrc) {
                        this.backDaemonObject.logInfo?.(`[censor-daemon] skip instance ${inst.instanceId}: no matching business source for space='${eventSpace}' type='${eventType}'`)
                        continue
                    }
                    const text = extractText(eventBody, matchingSrc.businessPath!)
                    if (text === undefined) {
                        this.backDaemonObject.logInfo?.(`[censor-daemon] skip instance ${inst.instanceId}: extractText returned undefined for path='${matchingSrc.businessPath}'`)
                        continue
                    }
                    const ts = new Date().toISOString()
                    const llmText = matchingSrc.addTimestamp ? `${ts} ${text}` : String(text)
                    this.broadcast(inst, 'business', { text: String(text), namespace: eventSpace, pod: eventType, container: '', timestamp: ts })
                    if (inst.analyzing) {
                        inst.processedCount++
                        const clean = cleanANSI(llmText)
                        let filtered = false
                        for (const r of inst.regexes) {
                            try { if (r.compiled.test(clean)) { r.matches++; filtered = true } } catch {}
                        }
                        if (!filtered) {
                            const batchSize = this.effectiveBatchSize(inst)
                            // unshift so business events jump to front
                            if (inst.lineBuffer.length < MAX_LINE_BUFFER) inst.lineBuffer.unshift(clean)
                            this.backDaemonObject.logInfo?.(`[censor-daemon] business buffered: bufLen=${inst.lineBuffer.length} batchSize=${batchSize} llmBusy=${inst.llmBusy}`)
                            if (inst.lineBuffer.length >= batchSize && !inst.llmBusy && Date.now() >= inst.llmErrorCooldownUntil) {
                                const batch = inst.lineBuffer.splice(0, batchSize)
                                this.callLlm(inst, batch)
                            } else if (inst.llmBusy) {
                                this.backDaemonObject.logInfo?.(`[censor-daemon] business buffered but LLM busy`)
                            }
                        }
                        this.broadcastStats(inst)
                    }
                }
            }
        }
    }

    async processCommand(instanceId: string, command: ECensorDaemonCommand, data: unknown): Promise<unknown> {
        const inst = this.instances.get(instanceId)

        switch (command) {
            case ECensorDaemonCommand.CONFIGGET: {
                if (!inst) return null
                const llms: ILlm[] = ((await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []) as ILlm[]
                const configs: ICensorInstanceConfig[] = ((await this.backDaemonObject.readStorage!('censor-configs', false)) ?? []) as ICensorInstanceConfig[]
                return { instanceConfig: inst.cfg, configs, llms, providers: this.providers }
            }
            case ECensorDaemonCommand.CONFIGSET: {
                const raw = data as ICensorInstanceConfig & { _llms?: ILlm[] }
                const { _llms, ...cfg } = raw
                let target = inst
                if (!target) {
                    target = {
                        instanceId,
                        cfg: cfg as ICensorInstanceConfig,
                        assets: [], runners: new Map(), analyzing: true, processedCount: 0, syslogCount: 0, llmCount: 0, llmLinesCount: 0, totalBytesProcessed: 0,
                        tokensIn: 0, tokensOut: 0,
                        lineBuffer: [], regexes: [], llmBusy: false, llmErrorCooldownUntil: 0, subscribers: new Set(),
                        lastStatsBroadcast: 0, lastRegexStatsBroadcast: 0, pendingReceivedLines: []
                    }
                    this.instances.set(instanceId, target)
                }
                target.cfg = cfg as ICensorInstanceConfig
                target.currentBatchSize = undefined
                target.cachedSchema = undefined
                target.cachedModel = undefined
                target.cachedProviderOptions = undefined
                if (_llms) await this.backDaemonObject.writeStorageCommon!(STORAGE_KEY_LLMS, false, _llms)
                const llmList: ILlm[] = (_llms ?? ((await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? [])) as ILlm[]
                target.llm = llmList.find((l: ILlm) => l.id === target!.cfg.llmId)
                // Create or update the runner for this config (keyed by name:version)
                const rkey = `${(cfg as ICensorInstanceConfig).name}:${(cfg as ICensorInstanceConfig).version}`
                const existingRunner = target.runners.get(rkey)
                if (existingRunner) {
                    // Update cfg and llm but preserve accumulated state (regexes, stats, buffers)
                    existingRunner.cfg = cfg as ICensorInstanceConfig
                    existingRunner.llm = llmList.find((l: ILlm) => l.id === (cfg as ICensorInstanceConfig).llmId)
                    existingRunner.cachedSchema = undefined
                    existingRunner.cachedModel = undefined
                    existingRunner.cachedProviderOptions = undefined
                    existingRunner.currentBatchSize = undefined
                    console.log(`[censor-daemon] configset: updated runner '${rkey}'`)
                } else {
                    const newRunner: IConfigRunner = {
                        cfg: cfg as ICensorInstanceConfig,
                        analyzing: true,
                        processedCount: 0, syslogCount: 0, llmCount: 0, llmLinesCount: 0,
                        totalBytesProcessed: 0, tokensIn: 0, tokensOut: 0,
                        lineBuffer: [], regexes: [], llmBusy: false, llmErrorCooldownUntil: 0,
                        llm: llmList.find((l: ILlm) => l.id === (cfg as ICensorInstanceConfig).llmId),
                        lastStatsBroadcast: 0, lastRegexStatsBroadcast: 0, pendingReceivedLines: []
                    }
                    target.runners.set(rkey, newRunner)
                    console.log(`[censor-daemon] configset: created runner '${rkey}' (total runners: ${target.runners.size})`)
                }
                // Retroactively populate runnerIds on existing assets for this runner
                for (const asset of target.assets) {
                    if (this.podMatchesRunnerCfg(cfg as ICensorInstanceConfig, asset.namespace, asset.pod)) {
                        asset.runnerIds.add(rkey)
                    } else {
                        asset.runnerIds.delete(rkey)
                    }
                }
                // Tear down running log streams that no longer match the new config
                // The plugin back re-seed will then start any new ones that now match
                const newCfg = cfg as ICensorInstanceConfig
                console.log(`[censor-daemon] configset: inst had ${target.assets.length} assets before tear-down: ${target.assets.map(a => `${a.namespace}/${a.pod}`).join(', ')}`)
                const toStop = target.assets.filter(a => {
                    if (!newCfg.logstreamEnabled) return true
                    if (newCfg.logstreamAll) return false
                    const sources = newCfg.logstreamSources ?? []
                    if (sources.length === 0) return true
                    return !sources.some(src => {
                        const nsOk = !src.namespace || a.namespace === src.namespace
                        const podOk = !src.podRegex || new RegExp(src.podRegex).test(a.pod)
                        return nsOk && podOk
                    })
                })
                for (const asset of toStop) {
                    console.log(`[censor-daemon] configset: stopping log stream ${asset.namespace}/${asset.pod}/${asset.container} (no longer matches new config)`)
                    asset.passThroughStream.removeAllListeners()
                    asset.passThroughStream.destroy()
                }
                target.assets = target.assets.filter(a => !toStop.includes(a))
                if (toStop.length > 0) this.broadcast(target, 'assets', { assets: target.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
                // In cluster mode, re-discover pods that now match the new config
                // In resource mode, the plugin back re-seeds via directAddObject
                if (target.scope === 'cluster') {
                    console.log(`[censor-daemon] configset cluster mode: running re-discovery after config change`)
                    this.rediscoverClusterPods(target).catch(e => this.backDaemonObject.logWarning?.(`[censor-daemon] rediscoverClusterPods error: ${e}`))
                }
                return { instanceConfig: target.cfg }
            }
            case ECensorDaemonCommand.CONFIGSAVE: {
                const cfgToSave = data as ICensorInstanceConfig
                let configs: ICensorInstanceConfig[] = ((await this.backDaemonObject.readStorage!('censor-configs', false)) ?? []) as ICensorInstanceConfig[]
                const idx = configs.findIndex(c => c.name === cfgToSave.name && c.version === cfgToSave.version)
                if (idx >= 0) configs[idx] = cfgToSave
                else configs.push(cfgToSave)
                await this.backDaemonObject.writeStorage!('censor-configs', false, configs)
                return { configs }
            }
            case ECensorDaemonCommand.CONFIGDELETE: {
                const { name, version } = data as { name: string, version: string }
                const configs: ICensorInstanceConfig[] = ((await this.backDaemonObject.readStorage!('censor-configs', false)) ?? []) as ICensorInstanceConfig[]
                const filtered = configs.filter(c => !(c.name === name && c.version === version))
                await this.backDaemonObject.writeStorage!('censor-configs', false, filtered)
                return { configs: filtered }
            }
            case ECensorDaemonCommand.PROVIDERSAVAILABLE:
                return { providersAvailable: ['google', 'openai', 'openrouter', 'mistral', 'groq', 'deepseek'] }
            case ECensorDaemonCommand.PROVIDERSGET:
                return { providers: this.providers }
            case ECensorDaemonCommand.PROVIDERSSET: {
                const newProviders = data as ILlmProvider[]
                this.providers = newProviders
                if (newProviders.length > 0) await this.backDaemonObject.writeStorageCommon!(STORAGE_KEY_PROVIDERS, true, newProviders)
                await loadModels(this.providers, this.backDaemonObject)
                return { providers: this.providers }
            }
            case ECensorDaemonCommand.ANALYZESTART:
                if (inst) {
                    inst.analyzing = true
                    inst.lineBuffer = []
                    inst.pendingReceivedLines = []
                    if (inst.receivedTimer) { clearTimeout(inst.receivedTimer); inst.receivedTimer = undefined }
                    if (inst.flushTimer) { clearTimeout(inst.flushTimer); inst.flushTimer = undefined }
                    this.broadcast(inst, 'analyzing', { analyzing: true })
                    this.persistState(inst)
                }
                return { analyzing: true }
            case ECensorDaemonCommand.ANALYZESTOP:
                if (inst) {
                    inst.analyzing = false
                    inst.lineBuffer = []
                    inst.pendingReceivedLines = []
                    if (inst.receivedTimer) { clearTimeout(inst.receivedTimer); inst.receivedTimer = undefined }
                    if (inst.flushTimer) { clearTimeout(inst.flushTimer); inst.flushTimer = undefined }
                    this.broadcast(inst, 'analyzing', { analyzing: false })
                    this.persistState(inst)
                } else {
                    try {
                        const existing = await this.backDaemonObject.readStorage!(`censor-state-${instanceId}`, false) as { processedCount?: number, llmCount?: number, analyzing?: boolean, regexes?: unknown[] } | null
                        await this.backDaemonObject.writeStorage?.(`censor-state-${instanceId}`, false, { processedCount: existing?.processedCount ?? 0, llmCount: existing?.llmCount ?? 0, analyzing: false, regexes: existing?.regexes ?? [] })
                    } catch {}
                }
                return { analyzing: false }
            case ECensorDaemonCommand.REGEXDELETE: {
                if (!inst) return null
                const pattern = data as string
                const pos = inst.regexes.findIndex(r => r.pattern === pattern)
                if (pos >= 0) inst.regexes.splice(pos, 1)
                this.persistState(inst)
                return { regexes: inst.regexes.map(r => ({ pattern: r.pattern, example: r.example, explanation: r.explanation })) }
            }
            case ECensorDaemonCommand.STATSGET:
                if (!inst) return null
                return { processedCount: inst.processedCount, llmCount: inst.llmCount, tokensIn: inst.tokensIn, tokensOut: inst.tokensOut, analyzing: inst.analyzing }
            case 'analyzestate':
                if (inst) this.broadcast(inst, 'analyzing', { analyzing: inst.analyzing })
                return { analyzing: inst?.analyzing ?? false }
            case ECensorDaemonCommand.REGEXGET:
                if (!inst) return null
                return { regexes: inst.regexes.map(r => ({ pattern: r.pattern, example: r.example, explanation: r.explanation, matches: r.matches })) }
        }
        return null
    }

    subscribe(instanceId: string, callback: (event: unknown) => void): () => void {
        const inst = this.instances.get(instanceId)
        if (!inst) {
            let pending = this.pendingSubscribers.get(instanceId)
            if (!pending) {
                pending = new Set()
                this.pendingSubscribers.set(instanceId, pending)
            }
            pending.add(callback)
            return () => {
                const p = this.pendingSubscribers.get(instanceId)
                if (p) {
                    p.delete(callback)
                    if (p.size === 0) this.pendingSubscribers.delete(instanceId)
                }
                this.instances.get(instanceId)?.subscribers.delete(callback)
            }
        }
        inst.subscribers.add(callback)
        return () => inst.subscribers.delete(callback)
    }

    // ── Internal ────────────────────────────────────────────────────────────────

    private effectiveBatchSize(inst: IDaemonInstance, runner?: IConfigRunner): number {
        const t: IConfigRunner = runner ?? (inst as IConfigRunner)
        const max = t.cfg.batchSize ?? BATCH_SIZE
        if (t.cfg.batchMode !== 'auto') return max
        return t.currentBatchSize ?? max
    }

    private broadcast(inst: IDaemonInstance, kind: string, data: Record<string, unknown>): void {
        const event: IDaemonEvent = { instanceId: inst.instanceId, type: kind, data }
        for (const cb of inst.subscribers) cb(event)
    }

    // Throttled stats broadcast: max 4/sec, regexMatches separated into a low-frequency regexstats event
    private broadcastStats(inst: IDaemonInstance, runner?: IConfigRunner): void {
        const now = Date.now()
        const t: IConfigRunner = runner ?? (inst as IConfigRunner)
        if (now - t.lastStatsBroadcast < 250) return
        t.lastStatsBroadcast = now
        this.broadcast(inst, 'stats', {
            processedCount: t.processedCount,
            syslogCount: t.syslogCount,
            llmCount: t.llmCount,
            llmLinesCount: t.llmLinesCount,
            totalBytesProcessed: t.totalBytesProcessed,
            tokensIn: t.tokensIn,
            tokensOut: t.tokensOut,
            pendingCount: t.lineBuffer.length,
            subscriberCount: inst.subscribers.size,
            currentBatchSize: t.cfg.batchMode === 'auto' ? (t.currentBatchSize ?? t.cfg.batchSize ?? BATCH_SIZE) : undefined
        })
        // regex match counts at most once per 5 seconds (550 regexes × 80B × high-freq = 1.7 MB/s otherwise)
        if (now - t.lastRegexStatsBroadcast >= 5000) {
            t.lastRegexStatsBroadcast = now
            this.broadcast(inst, 'regexstats', { regexMatches: t.regexes.map(r => ({ pattern: r.pattern, matches: r.matches })) })
        }
    }

    // Throttled received broadcast: accumulate lines for 200ms, then emit a single batch (max 200 lines)
    private scheduleReceivedBroadcast(inst: IDaemonInstance): void {
        if (inst.receivedTimer) return
        inst.receivedTimer = setTimeout(() => {
            inst.receivedTimer = undefined
            if (inst.pendingReceivedLines.length === 0) return
            const toSend = inst.pendingReceivedLines.splice(0, 200)
            inst.pendingReceivedLines = []
            this.broadcast(inst, 'received', { lines: toSend })
        }, 200)
    }

    private async persistState(_inst: IDaemonInstance): Promise<void> {
        // state is kept in memory only; lost on backend restart
    }

    private processChunk(inst: IDaemonInstance, asset: IAsset, chunk: string): void {
        const lines = chunk.split('\n').filter(l => l.trim() !== '')
        if (lines.length === 0) return

        if (asset.runnerIds.size > 0) {
            // Runner-based fan-out: each runner processes independently with its own cfg/regexes/buffer
            for (const rkey of asset.runnerIds) {
                const runner = inst.runners.get(rkey)
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
                    const batchSize = this.effectiveBatchSize(inst, runner)
                    if (!filtered && runner.lineBuffer.length < MAX_LINE_BUFFER) {
                        runner.lineBuffer.push(truncated)
                    }
                    if (runner.lineBuffer.length >= batchSize && !runner.llmBusy && Date.now() >= runner.llmErrorCooldownUntil) {
                        if (runner.flushTimer) { clearTimeout(runner.flushTimer); runner.flushTimer = undefined }
                        const batch = runner.lineBuffer.splice(0, batchSize)
                        this.callLlm(inst, batch, runner)
                    } else if (runner.lineBuffer.length > 0 && runner.lineBuffer.length < batchSize && !runner.llmBusy && !runner.flushTimer) {
                        runner.flushTimer = setTimeout(() => {
                            runner.flushTimer = undefined
                            if (runner.lineBuffer.length > 0 && !runner.llmBusy && Date.now() >= runner.llmErrorCooldownUntil) {
                                const batch = runner.lineBuffer.splice(0, runner.lineBuffer.length)
                                this.callLlm(inst, batch, runner)
                            }
                        }, (runner.cfg.batchTimeout ?? 2) * 1000)
                    }
                }
                this.broadcastStats(inst, runner)
            }
            // Received lines for display (inst level — shows all lines arriving, regardless of runner)
            const receivedBatch = lines.map(text => ({ text, namespace: asset.namespace, pod: asset.pod, container: asset.container }))
            inst.pendingReceivedLines.push(...receivedBatch)
            if (inst.pendingReceivedLines.length > 1000) inst.pendingReceivedLines.splice(0, inst.pendingReceivedLines.length - 1000)
            this.scheduleReceivedBroadcast(inst)
        } else {
            // Flat fallback: no runners yet (pre-CONFIGSET state) — original behavior preserved exactly
            if (!inst.analyzing) return
            const receivedBatch: { text: string, namespace: string, pod: string, container: string }[] = []
            for (const line of lines) {
                inst.processedCount++
                inst.totalBytesProcessed += Buffer.byteLength(line, 'utf8')
                receivedBatch.push({ text: line, namespace: asset.namespace, pod: asset.pod, container: asset.container })
                const clean = cleanANSI(line)
                const maxLen = inst.cfg.maxLineLength ?? 0
                const truncated = (maxLen > 0 && clean.length > maxLen) ? clean.slice(0, maxLen) : clean
                let filtered = false
                for (const r of inst.regexes) {
                    try { if (r.compiled.test(truncated)) { r.matches++; filtered = true } } catch {}
                }
                const batchSize = this.effectiveBatchSize(inst)
                if (!filtered && inst.lineBuffer.length < MAX_LINE_BUFFER) {
                    inst.lineBuffer.push(truncated)
                }
                if (inst.lineBuffer.length >= batchSize && !inst.llmBusy && Date.now() >= inst.llmErrorCooldownUntil) {
                    if (inst.flushTimer) { clearTimeout(inst.flushTimer); inst.flushTimer = undefined }
                    const batch = inst.lineBuffer.splice(0, batchSize)
                    this.callLlm(inst, batch)
                } else if (inst.lineBuffer.length > 0 && inst.lineBuffer.length < batchSize && !inst.llmBusy && !inst.flushTimer) {
                    inst.flushTimer = setTimeout(() => {
                        inst.flushTimer = undefined
                        if (inst.lineBuffer.length > 0 && !inst.llmBusy && Date.now() >= inst.llmErrorCooldownUntil) {
                            const batch = inst.lineBuffer.splice(0, inst.lineBuffer.length)
                            this.callLlm(inst, batch)
                        }
                    }, (inst.cfg.batchTimeout ?? 2) * 1000)
                }
            }
            // Cap pending buffer at 1000 lines (display is capped at MAX_DISPLAY_LINES=1000 in front anyway)
            if (receivedBatch.length > 0) {
                inst.pendingReceivedLines.push(...receivedBatch)
                if (inst.pendingReceivedLines.length > 1000) inst.pendingReceivedLines.splice(0, inst.pendingReceivedLines.length - 1000)
                this.scheduleReceivedBroadcast(inst)
            }
            this.broadcastStats(inst)
        }
    }

    private async callLlm(inst: IDaemonInstance, lines: string[], runner?: IConfigRunner): Promise<void> {
        // t = runner when in multi-runner mode, inst (duck-typed) when in flat/legacy mode
        const t: IConfigRunner = runner ?? (inst as IConfigRunner)
        t.llmBusy = true
        let success = false
        try {
            if (!t.llm && t.cfg.llmId) {
                const storedLlms: ILlm[] = ((await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []) as ILlm[]
                t.llm = storedLlms.find(l => l.id === t.cfg.llmId)
            }
            if (!t.llm) {
                this.backDaemonObject.logWarning?.(`[censor-daemon] no LLM configured for instance ${inst.instanceId} llmId='${t.cfg.llmId}' cfg.name='${t.cfg.name}'`)
                return
            }
            if (this.providers.length === 0) {
                const stored: ILlmProvider[] = ((await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_PROVIDERS, true)) ?? []) as ILlmProvider[]
                if (stored.length > 0) {
                    this.providers = stored
                    await loadModels(this.providers, this.backDaemonObject)
                }
            }
            if (!t.cachedModel) {
                t.cachedModel = buildModel(t.llm, this.providers)
            }
            const model = t.cachedModel
            if (!model) {
                this.backDaemonObject.logWarning?.(`[censor-daemon] could not build model for LLM '${t.llm.id}'`)
                return
            }

            const system = t.cfg.system?.trim() || DEFAULT_SYSTEM
            const prompt = `${DEFAULT_USER_PROMPT(lines.length)}\n\n${lines.join('\n')}`

            if (!t.cachedProviderOptions) {
                const opts: Record<string, Record<string, unknown>> = {}
                switch (t.llm.provider) {
                    case 'google':   Object.assign(opts, { google: { structuredOutputs: true } }); break
                    case 'groq':     Object.assign(opts, { groq: { structuredOutputs: true } }); break
                    case 'mistral':  Object.assign(opts, { mistral: { strictJsonSchema: true, structuredOutputs: true } }); break
                    default:         Object.assign(opts, { openai: {} })
                }
                t.cachedProviderOptions = opts
            }
            const providerOptions = t.cachedProviderOptions

            if (!t.cachedSchema) {
                let example: Record<string, unknown>
                try {
                    example = JSON.parse(t.cfg.exampleJson?.trim() || '{"patterns":[""]}')
                } catch (err) {
                    this.backDaemonObject.logWarning?.(`[censor-daemon] invalid exampleJson, using default. Error: ${err}`)
                    example = { patterns: [''] }
                }
                t.cachedSchema = zodFromExample(example)
            }
            const schema = t.cachedSchema

            t.llmCount++
            t.llmLinesCount += lines.length
            t.lastStatsBroadcast = 0  // force next broadcastStats to fire immediately
            this.broadcastStats(inst, runner)
            this.broadcast(inst, 'llminput', { lines })

            const { output, usage } = await generateText({
                model, system, prompt,
                temperature: t.cfg.temperature ?? 0.2,
                providerOptions: providerOptions as never,
                output: Output.object({ schema })
            })

            t.tokensIn += usage.inputTokens ?? 0
            t.tokensOut += usage.outputTokens ?? 0
            t.lastStatsBroadcast = 0  // force stats update after LLM response
            this.broadcastStats(inst, runner)
            this.broadcast(inst, 'llmoutput', { text: JSON.stringify(output, null, 2) })

            const patterns: string[] = ((output as any).info ?? []).filter((x: any) => x.type === 'discard').map((x: any) => x.regex)
            // no tocar estas lineas es debug del daemon
            console.log('daemonpatterns')
            console.log(patterns)

            const patternExplanations: Map<string, string> = new Map(
                (output as any).info?.filter((x: any) => x.type === 'discard').map((x: any) => [x.regex as string, (x.explanation ?? '') as string]) ?? []
            )

            for (const val of Object.values((output ?? {}) as Record<string, unknown>)) {
                if (Array.isArray(val)) patterns.push(...val.filter((v): v is string => typeof v === 'string'))
            }

            const allTags: string[] = []
            for (const item of ((output as any).info ?? [])) {
                if (Array.isArray(item.tags)) {
                    for (const tag of item.tags) {
                        if (typeof tag === 'string' && !allTags.includes(tag)) allTags.push(tag)
                    }
                }
            }
            if (allTags.length > 0) this.broadcast(inst, 'tags', { tags: allTags })

            const warnings: { original: string, explanation: string, tags: string[] }[] =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (output as any).info?.filter((x: any) => x.type === 'warn')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((x: any) => ({ original: x.original ?? '', explanation: x.explanation ?? '', tags: Array.isArray(x.tags) ? x.tags.filter((tg: unknown) => typeof tg === 'string') : [] })) ?? []
            for (const w of warnings) {
                this.broadcast(inst, 'llmwarning', { text: w.original, explanation: w.explanation, tags: w.tags })
                const sid = t.cfg.senderId
                const scn = t.cfg.senderConfigName
                if (sid && scn) {
                    const tagStr = w.tags.length > 0 ? ` [${w.tags.join(', ')}]` : ''
                    this.backDaemonObject.senders?.send(sid, scn, {
                        body: `${w.original}\n\n${w.explanation}${tagStr}`,
                        subject: `Censor warning${tagStr}`,
                        level: 'warning'
                    })
                }
            }

            for (const pattern of patterns) {
                if (typeof pattern !== 'string') continue
                if (t.regexes.some(r => r.pattern === pattern)) continue
                try {
                    const compiled = new RegExp(pattern)
                    const matchExample = lines.find(l => { try { return compiled.test(l) } catch { return false } }) ?? ''
                    const explanation = patternExplanations.get(pattern) ?? ''
                    t.regexes.push({ pattern, compiled, example: matchExample, explanation, matches: 1 })
                    if ((t.cfg.mode ?? 'inference') === 'inference') {
                        this.broadcast(inst, 'regex', { pattern, example: matchExample, explanation })
                    }
                }
                catch {
                    this.backDaemonObject.logWarning?.(`[censor-daemon] invalid regex from LLM: '${pattern}'`)
                }
            }
            await this.persistState(inst)
            success = true
        }
        catch (err) {
            this.backDaemonObject.logError?.(`[censor-daemon] LLM call error: ${err}`)
            this.broadcast(inst, 'llmerror', { text: String(err), timestamp: new Date().toISOString(), inputLines: lines })
            t.lineBuffer.unshift(...lines)
            t.llmErrorCooldownUntil = Date.now() + 5_000
        }
        finally {
            t.llmBusy = false
            if (success && t.cfg.batchMode === 'auto') {
                const maxSize = t.cfg.batchSize ?? BATCH_SIZE
                const minSize = t.cfg.batchSizeMin ?? 1
                const current = t.currentBatchSize ?? maxSize
                const pending = t.lineBuffer.length
                if (pending >= current) {
                    t.currentBatchSize = Math.min(maxSize, current + Math.max(1, Math.round(current * 0.2)))
                } else if (pending < current * 0.9) {
                    t.currentBatchSize = Math.max(minSize, current - Math.max(1, Math.round(current * 0.2)))
                }
                console.log(`[censor-autobatch] success=${success} batchMode=${t.cfg.batchMode} pending=${t.lineBuffer.length} currentBatchSize=${t.currentBatchSize} cfgBatchSize=${t.cfg.batchSize} maxSize=${maxSize} minSize=${minSize} current=${current} pending=${pending} threshold=${current * 0.9} => newBatchSize=${t.currentBatchSize}`)
            }
            if (success) {
                const batchSize = this.effectiveBatchSize(inst, runner)
                if (t.lineBuffer.length >= batchSize) {
                    const batch = t.lineBuffer.splice(0, batchSize)
                    this.callLlm(inst, batch, runner)
                }
            }
        }
    }
}

export default CensorDaemon

