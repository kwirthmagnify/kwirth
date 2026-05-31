import { IDaemonInstanceConfig, BackDaemonData, IBackDaemonRequirements, IBackDaemonObject, IDaemonEvent } from '@kwirthmagnify/kwirth-common'
import { IDaemon } from '@kwirthmagnify/kwirth-common-back'
import { ILlm, ILlmProvider, STORAGE_KEY_LLMS, STORAGE_KEY_PROVIDERS } from '@kwirthmagnify/kwirth-common-ai'
import { buildModel, loadModels, zodFromExample } from '@kwirthmagnify/kwirth-common-ai/back'
import { PassThrough } from 'stream'
import * as stream from 'stream'
import { generateText, Output } from 'ai'

const BATCH_SIZE = 50

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
    space?: string
    type?: string
    addTimestamp?: boolean
    businessPath?: string

    // for alerting
    senderId?: string
    senderConfigName?: string
}

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
}

interface IAccumRegex {
    pattern: string
    compiled: RegExp
    example: string
    explanation: string
}

interface IDaemonInstance {
    instanceId: string
    cfg: ICensorInstanceConfig
    assets: IAsset[]
    analyzing: boolean
    processedCount: number
    llmCount: number
    tokensIn: number
    tokensOut: number
    lineBuffer: string[]
    regexes: IAccumRegex[]
    llmBusy: boolean
    llmErrorCooldownUntil: number
    ephemeral?: boolean
    llm?: ILlm
    subscribers: Set<(event: unknown) => void>
}

export class CensorDaemon implements IDaemon {
    readonly daemonId = 'censor'
    readonly requirements: IBackDaemonRequirements = {
        storage: true,
        providers: ['events', 'business']
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
        const stored: ILlmProvider[] = (await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_PROVIDERS, true)) ?? []
        this.providers = stored
        await loadModels(this.providers, this.backDaemonObject)

        const configs: ICensorInstanceConfig[] = (await this.backDaemonObject.readStorage!('censor-configs', false)) ?? []
        const activeSessions = configs.filter(c => c.active)
        if (activeSessions.length === 0) {
            console.log('[censor] No persistent sessions configured.')
        } else {
            console.log(`[censor] Persistent sessions to start (${activeSessions.length}):`)
            activeSessions.forEach(c => console.log(`  - ${c.name} v${c.version} (llm: ${c.llmId})`))
        }
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
                analyzing: false,
                processedCount: 0,
                llmCount: 0,
                tokensIn: 0,
                tokensOut: 0,
                lineBuffer: [],
                regexes: [],
                llmBusy: false,
                subscribers: new Set()
            }
            this.instances.set(instanceConfig.id, inst)

            const savedCfg: ICensorInstanceConfig = inst.cfg
            const dataCfg = instanceConfig.data as ICensorInstanceConfig | undefined
            const cfg = dataCfg?.llmId ? dataCfg : savedCfg
            const llms: ILlm[] = (await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
            const llm = cfg.llmId ? llms.find(l => l.id === cfg.llmId) : undefined

            inst.cfg = cfg
            inst.llm = llm
            inst.analyzing = true
            inst.ephemeral = !!(instanceConfig.data as any)?.ephemeral

            // Wire any subscribers that registered before this instance was created in memory
            const pending = this.pendingSubscribers.get(instanceConfig.id)
            if (pending) {
                for (const cb of pending) inst.subscribers.add(cb)
                this.pendingSubscribers.delete(instanceConfig.id)
            }
        }

        if (inst.assets.some(a => a.namespace === podNamespace && a.pod === podName && a.container === containerName)) return true

        const logStream = new stream.PassThrough()
        const asset: IAsset = { namespace: podNamespace, pod: podName, container: containerName, passThroughStream: logStream }
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
        for (const asset of toRemove) asset.passThroughStream.destroy()
        inst.assets = inst.assets.filter(a => !(a.namespace === podNamespace && a.pod === podName && (containerName === '' || a.container === containerName)))
        this.broadcast(inst, 'assets', { assets: inst.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
        return true
    }

    stopInstance(instanceId: string): void {
        const inst = this.instances.get(instanceId)
        if (!inst) return
        for (const asset of inst.assets) asset.passThroughStream.destroy()
        this.instances.delete(instanceId)
        this.pendingSubscribers.delete(instanceId)
    }

    processProviderEvent(providerId: string, event: unknown): void {
        if (providerId === 'events') {
            const { type, obj } = event as { type: string, obj: { kind: string, metadata: { name: string, namespace: string } } }
            if (obj.kind !== 'Pod' || type !== 'DELETED') return
            const podName = obj.metadata.name
            const namespace = obj.metadata.namespace
            for (const inst of this.instances.values()) {
                const before = inst.assets.length
                inst.assets = inst.assets.filter(a => !(a.pod === podName && a.namespace === namespace))
                if (inst.assets.length !== before) {
                    this.broadcast(inst, 'assets', { assets: inst.assets.map(a => ({ namespace: a.namespace, pod: a.pod, container: a.container })) })
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
                if (!inst.cfg.businessPath) {
                    this.backDaemonObject.logInfo?.(`[censor-daemon] skip instance ${inst.instanceId}: no businessPath`)
                    continue
                }
                const cfgSpace = inst.cfg.space ?? ''
                const cfgType = inst.cfg.type ?? ''
                if (cfgSpace && cfgSpace !== eventSpace) {
                    this.backDaemonObject.logInfo?.(`[censor-daemon] skip instance ${inst.instanceId}: space mismatch cfg='${cfgSpace}' event='${eventSpace}'`)
                    continue
                }
                if (cfgType && cfgType !== eventType) {
                    this.backDaemonObject.logInfo?.(`[censor-daemon] skip instance ${inst.instanceId}: type mismatch cfg='${cfgType}' event='${eventType}'`)
                    continue
                }
                const text = extractText(eventBody, inst.cfg.businessPath)
                if (text === undefined) {
                    this.backDaemonObject.logInfo?.(`[censor-daemon] skip instance ${inst.instanceId}: extractText returned undefined for path='${inst.cfg.businessPath}'`)
                    continue
                }
                const ts = new Date().toISOString()
                const llmText = inst.cfg.addTimestamp ? `${ts} ${text}` : String(text)
                this.broadcast(inst, 'business', { text: String(text), namespace: eventSpace, pod: eventType, container: '', timestamp: ts })
                if (inst.analyzing) {
                    inst.processedCount++
                    const clean = cleanANSI(llmText)
                    const filtered = inst.regexes.some(r => { try { return r.compiled.test(clean) } catch { return false } })
                    if (!filtered) {
                        inst.lineBuffer.push(clean)
                        const batchSize = inst.cfg.batchSize ?? BATCH_SIZE
                        this.backDaemonObject.logInfo?.(`[censor-daemon] business buffered: bufLen=${inst.lineBuffer.length} batchSize=${batchSize} llmBusy=${inst.llmBusy}`)
                        if (inst.lineBuffer.length >= batchSize && !inst.llmBusy && Date.now() >= inst.llmErrorCooldownUntil) {
                            const batch = inst.lineBuffer.splice(0, batchSize)
                            this.callLlm(inst, batch)
                        }
                        else {
                            if (inst.llmBusy) {
                                this.backDaemonObject.logInfo?.(`[censor-daemon] business buffered but LLM busy`)
                            }
                        }
                    }
                    this.broadcast(inst, 'stats', { processedCount: inst.processedCount, llmCount: inst.llmCount, tokensIn: inst.tokensIn, tokensOut: inst.tokensOut, pendingCount: inst.lineBuffer.length })
                }
            }
        }
    }

    async processCommand(instanceId: string, command: ECensorDaemonCommand, data: unknown): Promise<unknown> {
        const inst = this.instances.get(instanceId)

        switch (command) {
            case ECensorDaemonCommand.CONFIGGET: {
                if (!inst) return null
                const llms: ILlm[] = (await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
                const configs: ICensorInstanceConfig[] = (await this.backDaemonObject.readStorage!('censor-configs', false)) ?? []
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
                        assets: [], analyzing: true, processedCount: 0, llmCount: 0,
                        tokensIn: 0, tokensOut: 0,
                        lineBuffer: [], regexes: [], llmBusy: false, llmErrorCooldownUntil: 0, subscribers: new Set()
                    }
                    this.instances.set(instanceId, target)
                }
                target.cfg = cfg as ICensorInstanceConfig
                if (_llms) await this.backDaemonObject.writeStorageCommon!(STORAGE_KEY_LLMS, false, _llms)
                const llmList: ILlm[] = _llms ?? (await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_LLMS, false)) ?? []
                target.llm = llmList.find((l: ILlm) => l.id === target!.cfg.llmId)
                return { instanceConfig: target.cfg }
            }
            case ECensorDaemonCommand.CONFIGSAVE: {
                const cfgToSave = data as ICensorInstanceConfig
                let configs: ICensorInstanceConfig[] = (await this.backDaemonObject.readStorage!('censor-configs', false)) ?? []
                if (cfgToSave.active) configs = configs.map(c => ({ ...c, active: false }))
                const idx = configs.findIndex(c => c.name === cfgToSave.name && c.version === cfgToSave.version)
                if (idx >= 0) configs[idx] = cfgToSave
                else configs.push(cfgToSave)
                await this.backDaemonObject.writeStorage!('censor-configs', false, configs)
                return { configs }
            }
            case ECensorDaemonCommand.CONFIGDELETE: {
                const { name, version } = data as { name: string, version: string }
                const configs: ICensorInstanceConfig[] = (await this.backDaemonObject.readStorage!('censor-configs', false)) ?? []
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
                await this.backDaemonObject.writeStorageCommon!(STORAGE_KEY_PROVIDERS, true, newProviders)
                await loadModels(this.providers, this.backDaemonObject)
                return { providers: this.providers }
            }
            case ECensorDaemonCommand.ANALYZESTART:
                if (inst) {
                    inst.analyzing = true
                    inst.lineBuffer = []
                    this.broadcast(inst, 'analyzing', { analyzing: true })
                    this.persistState(inst)
                }
                return { analyzing: true }
            case ECensorDaemonCommand.ANALYZESTOP:
                if (inst) {
                    inst.analyzing = false
                    inst.lineBuffer = []
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
                return { regexes: inst.regexes.map(r => ({ pattern: r.pattern, example: r.example, explanation: r.explanation })) }
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

    private broadcast(inst: IDaemonInstance, kind: string, data: Record<string, unknown>): void {
        const event: IDaemonEvent = { instanceId: inst.instanceId, type: kind, data }
        for (const cb of inst.subscribers) cb(event)
    }

    private async persistState(_inst: IDaemonInstance): Promise<void> {
        // state is kept in memory only; lost on backend restart
    }

    private processChunk(inst: IDaemonInstance, asset: IAsset, chunk: string): void {
        if (!inst.analyzing) return
        const lines = chunk.split('\n').filter(l => l.trim() !== '')
        for (const line of lines) {
            inst.processedCount++
            this.broadcast(inst, 'received', { text: line, namespace: asset.namespace, pod: asset.pod, container: asset.container })
            const clean = cleanANSI(line)
            const filtered = inst.regexes.some(r => {
                try { return r.compiled.test(clean) }
                catch { return false }
            })
            if (!filtered) {
                inst.lineBuffer.push(clean)
            }

            const batchSize = inst.cfg.batchSize ?? BATCH_SIZE
            if (inst.lineBuffer.length >= batchSize && !inst.llmBusy && Date.now() >= inst.llmErrorCooldownUntil) {
                const batch = inst.lineBuffer.splice(0, batchSize)
                this.callLlm(inst, batch)
            }
        }
        this.broadcast(inst, 'stats', { processedCount: inst.processedCount, llmCount: inst.llmCount, tokensIn: inst.tokensIn, tokensOut: inst.tokensOut, pendingCount: inst.lineBuffer.length })
    }

    private async callLlm(inst: IDaemonInstance, lines: string[]): Promise<void> {
        inst.llmBusy = true
        let success = false
        try {
            if (!inst.llm) {
                this.backDaemonObject.logWarning?.(`[censor-daemon] no LLM configured for instance ${inst.instanceId}`)
                return
            }
            if (this.providers.length === 0) {
                const stored: ILlmProvider[] = (await this.backDaemonObject.readStorageCommon!(STORAGE_KEY_PROVIDERS, true)) ?? []
                if (stored.length > 0) {
                    this.providers = stored
                    await loadModels(this.providers, this.backDaemonObject)
                }
            }
            const model = buildModel(inst.llm, this.providers)
            if (!model) {
                this.backDaemonObject.logWarning?.(`[censor-daemon] could not build model for LLM '${inst.llm.id}'`)
                return
            }

            const system = inst.cfg.system?.trim() || DEFAULT_SYSTEM
            const prompt = `${DEFAULT_USER_PROMPT(lines.length)}\n\n${lines.join('\n')}`

            let providerOptions: Record<string, Record<string, unknown>> = {}
            switch (inst.llm.provider) {
                case 'google':   providerOptions = { google: { structuredOutputs: true } }; break
                case 'groq':     providerOptions = { groq: { structuredOutputs: true } }; break
                case 'mistral':  providerOptions = { mistral: { strictJsonSchema: true, structuredOutputs: true } }; break
                default:         providerOptions = { openai: {} }
            }

            let example: Record<string, unknown>
            try {
                example = JSON.parse(inst.cfg.exampleJson?.trim() || '{"patterns":[""]}')
            } catch (err) {
                this.backDaemonObject.logWarning?.(`[censor-daemon] invalid exampleJson, using default. Error: ${err}`)
                example = { patterns: [''] }
            }
            const schema = zodFromExample(example)

            inst.llmCount++
            this.broadcast(inst, 'stats', { processedCount: inst.processedCount, llmCount: inst.llmCount, tokensIn: inst.tokensIn, tokensOut: inst.tokensOut, pendingCount: inst.lineBuffer.length })
            for (const line of lines) this.broadcast(inst, 'llminput', { text: line })

            const { output, usage } = await generateText({
                model, system, prompt,
                temperature: inst.cfg.temperature ?? 0.2,
                providerOptions: providerOptions as never,
                output: Output.object({ schema })
            })

            inst.tokensIn += usage.inputTokens ?? 0
            inst.tokensOut += usage.outputTokens ?? 0
            this.broadcast(inst, 'stats', { processedCount: inst.processedCount, llmCount: inst.llmCount, tokensIn: inst.tokensIn, tokensOut: inst.tokensOut, pendingCount: inst.lineBuffer.length })
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
                    for (const t of item.tags) {
                        if (typeof t === 'string' && !allTags.includes(t)) allTags.push(t)
                    }
                }
            }
            if (allTags.length > 0) this.broadcast(inst, 'tags', { tags: allTags })

            const warnings: { original: string, explanation: string, tags: string[] }[] =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (output as any).info?.filter((x: any) => x.type === 'warn')
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    .map((x: any) => ({ original: x.original ?? '', explanation: x.explanation ?? '', tags: Array.isArray(x.tags) ? x.tags.filter((t: unknown) => typeof t === 'string') : [] })) ?? []
            for (const w of warnings) {
                this.broadcast(inst, 'llmwarning', { text: w.original, explanation: w.explanation, tags: w.tags })
                const sid = inst.cfg.senderId
                const scn = inst.cfg.senderConfigName
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
                if (inst.regexes.some(r => r.pattern === pattern)) continue
                try {
                    const compiled = new RegExp(pattern)
                    const matchExample = lines.find(l => { try { return compiled.test(l) } catch { return false } }) ?? ''
                    const explanation = patternExplanations.get(pattern) ?? ''
                    inst.regexes.push({ pattern, compiled, example: matchExample, explanation })
                    this.broadcast(inst, 'regex', { pattern, example: matchExample, explanation })
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
            this.broadcast(inst, 'llmerror', { text: String(err), timestamp: new Date().toISOString() })
            inst.lineBuffer.unshift(...lines)
            inst.llmErrorCooldownUntil = Date.now() + 5_000
        }
        finally {
            inst.llmBusy = false
            if (success) {
                const batchSize = inst.cfg.batchSize ?? BATCH_SIZE
                if (inst.lineBuffer.length >= batchSize) {
                    const batch = inst.lineBuffer.splice(0, batchSize)
                    this.callLlm(inst, batch)
                }
            }
        }
    }
}

export default CensorDaemon
