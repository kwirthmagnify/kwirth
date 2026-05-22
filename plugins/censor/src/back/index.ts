import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, IBackChannelObject } from '@kwirthmagnify/kwirth-common'
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
    llmId: string
    system?: string
    batchSize?: number
    exampleJson?: string
    temperature?: number
}

export enum ECensorCommand {
    CONFIGGET = 'configget',
    CONFIGSET = 'configset',
    PROVIDERSAVAILABLE = 'providersavailable',
    PROVIDERSGET = 'providersget',
    PROVIDERSSET = 'providersset',
    ANALYZESTART = 'analyzestart',
    ANALYZESTOP = 'analyzestop',
    REGEXDELETE = 'regexdelete'
}

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
    kind: 'received' | 'llminput' | 'llmoutput' | 'llmwarning' | 'regex' | 'status' | 'config' | 'providers' | 'analyzing' | 'stats' | 'assets'
    analyzing?: boolean
    text?: string
    namespace?: string
    pod?: string
    container?: string
    pattern?: string
    example?: string
    explanation?: string
    tags?: string[]
    processedCount?: number
    llmCount?: number
    instanceConfig?: ICensorInstanceConfig
    llms?: ILlm[]
    providers?: ILlmProvider[]
    providersAvailable?: string[]
    assets?: { namespace: string, pod: string, container: string }[]
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

interface IInstance {
    instanceId: string
    accessKey: AccessKey
    cfg: ICensorInstanceConfig
    assets: IAsset[]
    paused: boolean
    analyzing: boolean
    processedCount: number
    llmCount: number
    lineBuffer: string[]
    regexes: IAccumRegex[]
    llmBusy: boolean
    llm?: ILlm
}

export class CensorChannel {
    readonly channelId = 'censor'
    readonly requirements = {
        storage: true,
        providers: ['events']
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
        const stored: ILlmProvider[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_PROVIDERS, true)) ?? []
        this.providers = stored
        await loadModels(this.providers, this.backChannelObject)
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
        cluster: false,
        resourced: true
    })

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'filter', 'view', 'cluster'].indexOf(scope)
    }

    processProviderEvent(providerId: string, event: unknown): void {
        if (providerId !== 'events') return
        const { type, obj } = event as { type: string, obj: { kind: string, metadata: { name: string, namespace: string } } }
        if (obj.kind !== 'Pod' || type !== 'DELETED') return

        const podName = obj.metadata.name
        const namespace = obj.metadata.namespace
        for (const socket of this.connections) {
            for (const instance of socket.instances) {
                const before = instance.assets.length
                instance.assets = instance.assets.filter(a => !(a.pod === podName && a.namespace === namespace))
                if (instance.assets.length !== before) {
                    this.sendAssets(socket.webSocket, instance)
                }
            }
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
                const raw = msg.data as ICensorInstanceConfig & { _llms?: ILlm[] }
                const { _llms, ...cfg } = raw
                instance.cfg = cfg as ICensorInstanceConfig
                await this.backChannelObject.writeStorage!('censor-config', false, instance.cfg)
                if (_llms) await this.backChannelObject.writeStorage!(STORAGE_KEY_LLMS, false, _llms)
                const llmList: ILlm[] = _llms ?? (await this.backChannelObject.readStorage!(STORAGE_KEY_LLMS, false)) ?? []
                instance.llm = llmList.find((l: ILlm) => l.id === instance.cfg.llmId)
                await this.executeConfigGet(webSocket, instance)
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
            case ECensorCommand.ANALYZESTART:
                instance.analyzing = true
                instance.lineBuffer = []
                await this.backChannelObject.writeStorage!('censor-analyzing', false, true)
                this.sendAnalyzing(webSocket, instance, true)
                return true
            case ECensorCommand.ANALYZESTOP:
                instance.analyzing = false
                instance.lineBuffer = []
                await this.backChannelObject.writeStorage!('censor-analyzing', false, false)
                this.sendAnalyzing(webSocket, instance, false)
                return true
            case ECensorCommand.REGEXDELETE: {
                const pattern = msg.data as string
                const pos = instance.regexes.findIndex(r => r.pattern === pattern)
                if (pos >= 0) instance.regexes.splice(pos, 1)
                return true
            }
            case ECensorCommand.PROVIDERSSET:
                const newProviders = msg.data as ILlmProvider[]
                this.providers = newProviders
                await this.backChannelObject.writeStorage!(STORAGE_KEY_PROVIDERS, true, newProviders)
                await loadModels(this.providers, this.backChannelObject)
                await this.executeConfigGet(webSocket, instance)
                return true
        }
        return false
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
                cfg: { llmId: '', system: '', batchSize: 50, exampleJson: '{"patterns":[""]}' },
                assets: [],
                paused: false,
                analyzing: false,
                processedCount: 0,
                llmCount: 0,
                lineBuffer: [],
                regexes: [],
                llmBusy: false
            })
            instance = socket.instances[len - 1]

            const savedCfg: ICensorInstanceConfig = (await this.backChannelObject.readStorage!('censor-config', false)) ?? { llmId: '', system: '', batchSize: 50, exampleJson: '{"patterns":[""]}' }
            const cfg: ICensorInstanceConfig = (instanceConfig.data as ICensorInstanceConfig)?.llmId ? (instanceConfig.data as ICensorInstanceConfig) : savedCfg
            const llms: ILlm[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_LLMS, false)) ?? []
            const llm = cfg.llmId ? llms.find(l => l.id === cfg.llmId) : undefined
            if (cfg.llmId && !llm) {
                this.backChannelObject.logWarning?.(`[censor] LLM '${cfg.llmId}' not found in shared storage`)
            }
            const savedAnalyzing: boolean = (await this.backChannelObject.readStorage!('censor-analyzing', false)) ?? false

            instance.cfg = cfg
            instance.llm = llm
            instance.analyzing = savedAnalyzing
            this.sendAnalyzing(webSocket, instance, instance.analyzing)
        }

        if (instance.assets.some(a => a.namespace === ns && a.pod === pod && a.container === container)) return true

        const logStream = new stream.PassThrough()
        const asset: IAsset = { namespace: ns, pod, container, passThroughStream: logStream }
        instance.assets.push(asset)

        logStream.setEncoding('utf8')
        logStream.on('data', (chunk: string) => this.processChunk(webSocket, instance!, asset, chunk))
        logStream.on('end', () => {
            instance!.assets = instance!.assets.filter(a => a !== asset)
            this.sendAssets(webSocket, instance!)
        })

        const logApi = (this.clusterInfo as { logApi: { log: (ns: string, pod: string, container: string, stream: stream.PassThrough, opts: unknown) => Promise<void> } }).logApi
        logApi.log(ns, pod, container, logStream, { follow: true, pretty: false, timestamps: false, tailLines: 1 })
            .catch(err => {
                this.backChannelObject.logWarning?.(`[censor] log stream error for ${ns}/${pod}/${container}: ${err}`)
                instance!.assets = instance!.assets.filter(a => a !== asset)
                this.sendAssets(webSocket, instance!)
            })

        this.sendAssets(webSocket, instance)
        return true
    }

    private processChunk = (webSocket: WebSocket, instance: IInstance, asset: IAsset, chunk: string) => {
        if (instance.paused || !instance.analyzing) return
        const lines = chunk.split('\n').filter(l => l.trim() !== '')
        for (const line of lines) {
            instance.processedCount++
            this.sendReceivedLine(webSocket, instance, asset, line)
            const clean = cleanANSI(line)
            const filtered = instance.regexes.some(r => {
                try { return r.compiled.test(clean) }
                catch { return false }
            })
            if (!filtered) {
                instance.lineBuffer.push(clean)
            }

            const batchSize = instance.cfg.batchSize ?? BATCH_SIZE
            if (instance.lineBuffer.length >= batchSize && !instance.llmBusy) {
                const batch = instance.lineBuffer.splice(0, batchSize)
                this.callLlm(webSocket, instance, batch)
            }
        }
        this.sendStats(webSocket, instance)
    }

    private callLlm = async (webSocket: WebSocket, instance: IInstance, lines: string[]) => {
        instance.llmBusy = true
        try {
            if (!instance.llm) {
                this.backChannelObject.logWarning?.(`[censor] no LLM configured for instance ${instance.instanceId}`)
                return
            }
            const model = buildModel(instance.llm, this.providers)
            if (!model) {
                this.backChannelObject.logWarning?.(`[censor] could not build model for LLM '${instance.llm.id}' (provider: ${instance.llm.provider}, useProviderKey: ${instance.llm.useProviderKey}, hasOwnKey: ${!!instance.llm.key}, knownProviders: [${this.providers.map(p => `${p.name}:${p.key ? 'hasKey' : 'noKey'}`).join(', ')}])`)
                return
            }

            const system = instance.cfg.system?.trim() || DEFAULT_SYSTEM
            const prompt = `${DEFAULT_USER_PROMPT(lines.length)}\n\n${lines.join('\n')}`

            let providerOptions: Record<string, Record<string, unknown>> = {}
            switch (instance.llm.provider) {
                case 'google':   providerOptions = { google: { structuredOutputs: true } }; break
                case 'groq':     providerOptions = { groq: { structuredOutputs: true } }; break
                case 'mistral':  providerOptions = { mistral: { strictJsonSchema: true, structuredOutputs: true } }; break
                default:         providerOptions = { openai: {} }
            }

            let example: Record<string, unknown>
            try {
                example = JSON.parse(instance.cfg.exampleJson?.trim() || '{"patterns":[""]}')
            } catch (err) {
                this.backChannelObject.logWarning?.(`[censor] invalid exampleJson, using default. Error: ${err}`)
                example = { patterns: [''] }
            }
            const schema = zodFromExample(example)

            //console.log(JSON.stringify(schema.shape, null, 2))

            instance.llmCount += lines.length
            this.sendStats(webSocket, instance)
            for (const line of lines) this.sendLlmInputLine(webSocket, instance, line)

            const { output } = await generateText({
                model, system, prompt,
                temperature: instance.cfg.temperature ?? 0.2,
                providerOptions: providerOptions as never,
                output: Output.object({ schema })
            })

            this.sendLlmOutput(webSocket, instance, JSON.stringify(output, null, 2))

            // no tocar estas tres lineas, la respuesta del LLM tiene de momento este formato.
            const patterns: string[] = (output as any).info.filter((x:any) => x.type==='discard').map((x:any) => x.regex)
            console.log('patterns')
            console.log(patterns)

            const patternExplanations: Map<string, string> = new Map(
                (output as any).info?.filter((x: any) => x.type === 'discard').map((x: any) => [x.regex as string, (x.explanation ?? '') as string]) ?? []
            )

            for (const val of Object.values((output ?? {}) as Record<string, unknown>)) {
                if (Array.isArray(val)) patterns.push(...val.filter((v): v is string => typeof v === 'string'))
            }

            const warnings: { original: string, explanation: string, tags: string[] }[] = (output as any).info
                ?.filter((x: any) => x.type === 'warn')
                .map((x: any) => ({ original: x.original ?? '', explanation: x.explanation ?? '', tags: Array.isArray(x.tags) ? x.tags.filter((t: unknown) => typeof t === 'string') : [] })) ?? []
            for (const w of warnings) this.sendLlmWarning(webSocket, instance, w.original, w.explanation, w.tags)

            for (const pattern of patterns) {
                if (typeof pattern !== 'string') continue
                if (instance.regexes.some(r => r.pattern === pattern)) continue
                try {
                    const compiled = new RegExp(pattern)
                    const example = lines.find(l => { try { return compiled.test(l) } catch { return false } }) ?? ''
                    const explanation = patternExplanations.get(pattern) ?? ''
                    instance.regexes.push({ pattern, compiled, example, explanation })
                    this.sendRegex(webSocket, instance, pattern, example, explanation)
                }
                catch {
                    this.backChannelObject.logWarning?.(`[censor] invalid regex from LLM: '${pattern}'`)
                }
            }
        }
        catch (err) {
            this.backChannelObject.logError?.(`[censor] LLM call error: ${err}`)
        }
        finally {
            instance.llmBusy = false
        }
    }

    private executeConfigGet = async (webSocket: WebSocket, instance: IInstance): Promise<void> => {
        const llms: ILlm[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_LLMS, false)) ?? []
        const storedProviders: ILlmProvider[] = (await this.backChannelObject.readStorage!(STORAGE_KEY_PROVIDERS, true)) ?? []
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
        const msg: ICensorMessage = {
            msgtype: 'censormessage',
            channel: 'censor',
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            kind: 'config',
            instanceConfig: instance.cfg,
            llms,
            providers: this.providers,
            providersAvailable: PROVIDERS_AVAILABLE
        }
        webSocket.send(JSON.stringify(msg))
    }

    private sendReceivedLine = (webSocket: WebSocket, instance: IInstance, asset: IAsset, text: string) => {
        webSocket.send(JSON.stringify({
            msgtype: 'censormessage', channel: 'censor',
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA, instance: instance.instanceId,
            kind: 'received', text, namespace: asset.namespace, pod: asset.pod, container: asset.container
        } as ICensorMessage))
    }

    private sendLlmInputLine = (webSocket: WebSocket, instance: IInstance, text: string) => {
        webSocket.send(JSON.stringify({
            msgtype: 'censormessage', channel: 'censor',
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA, instance: instance.instanceId,
            kind: 'llminput', text
        } as ICensorMessage))
    }

    private sendLlmWarning = (webSocket: WebSocket, instance: IInstance, text: string, explanation: string, tags: string[]) => {
        webSocket.send(JSON.stringify({
            msgtype: 'censormessage', channel: 'censor',
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA, instance: instance.instanceId,
            kind: 'llmwarning', text, explanation, tags
        } as ICensorMessage))
    }

    private sendLlmOutput = (webSocket: WebSocket, instance: IInstance, text: string) => {
        webSocket.send(JSON.stringify({
            msgtype: 'censormessage', channel: 'censor',
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA, instance: instance.instanceId,
            kind: 'llmoutput', text
        } as ICensorMessage))
    }

    private sendRegex = (webSocket: WebSocket, instance: IInstance, pattern: string, example: string, explanation: string) => {
        const msg: ICensorMessage = {
            msgtype: 'censormessage',
            channel: 'censor',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            kind: 'regex',
            pattern,
            example,
            explanation
        }
        webSocket.send(JSON.stringify(msg))
    }

    private sendStats = (webSocket: WebSocket, instance: IInstance) => {
        const msg: ICensorMessage = {
            msgtype: 'censormessage',
            channel: 'censor',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            kind: 'stats',
            processedCount: instance.processedCount,
            llmCount: instance.llmCount
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

    private sendAnalyzing = (webSocket: WebSocket, instance: IInstance, analyzing: boolean) => {
        const msg: ICensorMessage = {
            msgtype: 'censormessage',
            channel: 'censor',
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.RESPONSE,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            kind: 'analyzing',
            analyzing
        }
        webSocket.send(JSON.stringify(msg))
    }

    deleteObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, ns: string, pod: string, container: string): Promise<boolean> => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            const toRemove = instance.assets.filter(a => a.namespace === ns && a.pod === pod && (container === '' || a.container === container))
            for (const asset of toRemove) asset.passThroughStream.destroy()
            instance.assets = instance.assets.filter(a => !(a.namespace === ns && a.pod === pod && (container === '' || a.container === container)))
            this.sendAssets(webSocket, instance)
        }
        return true
    }

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) instance.paused = (action === EInstanceMessageAction.PAUSE)
    }

    modifyInstance = (_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void => {}

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            for (const asset of instance.assets) asset.passThroughStream.destroy()
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
            for (const instance of socket.instances) {
                for (const asset of instance.assets) asset.passThroughStream.destroy()
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
