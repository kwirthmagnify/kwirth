import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IBackChannelObject, IBackChannelRequirements, IChannel } from '../IChannel';
import { EPinocchioCommand, IAnalysis, IConfigTrigger, IConfigTriggerVersion, IConfigProvider, IPinocchioConfig, IPinocchioMessage, IPinocchioMessageResponse, kindsAvailable, IMessage, IPlaygroundRequest } from './PinocchioConfig'
import { IMetricsCluster } from '../../providers/metrics/IMetricsModel'
import { ELogComponent, logError, logInfo, logTrace, logWarning } from '../../tools/Logging'
import { Request, Response } from 'express'
import { z } from 'zod'

// AI stuff
import { loadModels } from './Utils'
import { generateText, Output, stepCountIs } from 'ai'

// AI models
import { createOpenAI, OpenAILanguageModelChatOptions } from '@ai-sdk/openai'
import { createGroq, GroqLanguageModelOptions } from '@ai-sdk/groq'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createGoogleGenerativeAI, GoogleLanguageModelOptions } from '@ai-sdk/google'
import { createMistral, MistralLanguageModelOptions } from '@ai-sdk/mistral'

// tools
import { getToolByName, IToolContext, toolInfoList } from './Tools';

const _ = require('lodash')
const nunjucks = require('nunjucks')

// basic nunjucks config
nunjucks.configure({ autoescape: true })

interface IInstance {
    instanceId: string
    accessKey: AccessKey
}

interface IEventsProviderEvent {
    type: 'ADDED'|'MODIFIED'|'DELETED'
    obj:any
}

interface IBusinessProviderEvent {
    last: {
        type: 'event',
        timestamp: number,
        event: any
    },
    all: Map<string, Map<string,any[]>>
}

interface IModelInvocation {
    llmProviderId: string
    llmModelId: string
    model: any //LanguageModelV3
    temperature: number
    providerOptions: any //GoogleLanguageModelOptions|MistralLanguageModelOptions
    errorPath: string
    system: string
    prompt: string
    tools: any
}

class PinocchioChannel implements IChannel {
    readonly channelId = 'pinocchio'
    readonly requirements: IBackChannelRequirements = {
        storage: true,
        providers: ['events', 'business', 'metrics']
    }
    clusterInfo : ClusterInfo
    backChannelObject : IBackChannelObject
    connections: {
        webSocket:WebSocket,
        lastRefresh: number,
        instances: IInstance[] 
    }[] = []
    clusterMetrics: IMetricsCluster[] = []
    analysis: IAnalysis[] = []
    providers: IConfigProvider[] = []
    pinocchioConfig: IPinocchioConfig = {
        triggers: [],
        llms: []
    }
    playgroundTrigger: IConfigTriggerVersion | undefined = undefined
    startTime: number

    constructor (clusterInfo:ClusterInfo, backChannelObject:IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
        this.startTime = Date.now()
    }

    startChannel = async () =>  {
        this.clusterInfo.addSubscriber('metrics', this, {})
        this.clusterInfo.addSubscriber('business', this, {
            spaces: [
                { name: 'customers', types: ['status'] },
                { name: 'branches', types: ['status'] },
                { name: 'launch', types: ['immediate'] }
            ]
        })
        this.clusterInfo.addSubscriber('events', this, {
            kinds: kindsAvailable,
            crdInstances: [],
            syncCrdInstances: false        
        })
        let provs = await this.backChannelObject.readStorage!('pinocchio-providers', true)
        if (provs) this.providers = provs
        let config = await this.backChannelObject.readStorage!('pinocchio-config', false) as IPinocchioConfig
        if (config) this.pinocchioConfig = config
        loadModels(this.providers)
    }

    getChannelData = (): BackChannelData => {
        return {
            id: 'pinocchio',
            routable: false,
            pauseable: true,
            modifiable: false,
            reconnectable: true,
            metrics: false,
            sources: [ EClusterType.KUBERNETES ],
            endpoints: [],
            websocket: false,
            cluster: true,
            resourced: false
        }
    }

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'none', 'cluster'].indexOf(scope)
    }

    buildModelInvocation = async (trigger: IConfigTrigger, version: IConfigTriggerVersion, event:IEventsProviderEvent|IBusinessProviderEvent|IMetricsCluster) : Promise<IModelInvocation|undefined> => {
        let prompt
        let llm = this.pinocchioConfig.llms.find(l => l.id === version.llm)
        if (!llm) {
            this.broadcastError(`Cannot find LLM with id '${version.llm}'`)
            return undefined
        }
        let key = llm.useProviderKey? this.providers.find(p => p.name === llm.provider)?.key : llm.key
        if (!key) {
            this.broadcastError(`Cannot get provider API key for LLM '${version.llm}'`)
            return undefined
        }
        switch(trigger.trigger) {
            case 'business':
                let businessEvent = event as IBusinessProviderEvent
                // prepare data objects for nunjucks
                let nunjucksObj:any = {}
                for (let spaceType of version.spaces) {
                    let [space, type] = spaceType.split('.')
                    let spaceData = businessEvent.all.get(space)
                    if (spaceData) {
                        let typeData = spaceData.get(type)
                        if (typeData) {
                            nunjucksObj[space] = {}
                            nunjucksObj[space][type] = {}
                        }
                    }
                }
                prompt = nunjucks.renderString(version.prompt, {})
                break
            case 'artifact':
                let eventsEvent = event as IEventsProviderEvent
                switch(version.promptType) {
                    case 'artifact':
                        prompt = JSON.stringify(eventsEvent.obj)
                        break
                    case 'jinja':
                        prompt = nunjucks.renderString(version.prompt, eventsEvent.obj)
                        break
                }
                break
            default:
                logWarning(ELogComponent.CHANNEL, `Received invalid trigger type: '${trigger.trigger}'`)
                return undefined
        }

        let system = version.system
        let temperature = llm.temperature
        if (temperature<0) temperature=0
        if (temperature>1) temperature=1
        let context:IToolContext = {
            origin: 'Pinocchio',
            nodes: await this.clusterInfo.getNodes(),
            clusterInfo: this.clusterInfo,
            clusterMetrics: this.clusterMetrics,
            trace: (toolName, args) => logInfo(ELogComponent.CHANNEL, `[TOOL] ${toolName} ${JSON.stringify(args)}`)
        }
        let tools: any = {}
        for (let toolName of version.tools) {
            tools[toolName] = getToolByName(toolName, context)
        }

        switch(llm.provider) {
            case 'deepseek':
                const deepseek = createDeepSeek({ apiKey: key })
                return {
                    llmProviderId: llm.provider,
                    llmModelId: llm.model,
                    model: deepseek(llm.model),
                    providerOptions: {
                        openai: {
                            // structuredOutputs: true  unsupported parm
                        } satisfies OpenAILanguageModelChatOptions
                    },
                    errorPath: '',
                    temperature,
                    tools,
                    prompt,
                    system
                }
            case 'google':
                const google = createGoogleGenerativeAI({ apiKey: key })
                return {
                    llmProviderId: llm.provider,
                    llmModelId: llm.model,
                    model: google(llm.model),
                    providerOptions: {
                        google: {
                            structuredOutputs: true,
                        } satisfies GoogleLanguageModelOptions
                    },
                    errorPath: 'lastError.data.error.message',
                    temperature,
                    tools,
                    prompt,
                    system
                }
            case 'openrouter':
                const openRouter = createOpenRouter({ apiKey: key })
                return {
                    llmProviderId: llm.provider,
                    llmModelId: llm.model,
                    model: openRouter(llm.model),
                    providerOptions: {
                    },
                    errorPath: '',
                    temperature,
                    tools,
                    prompt,
                    system
                }
            case 'groq':
                const groq = createGroq({ apiKey: key })
                return {
                    llmProviderId: llm.provider,
                    llmModelId: llm.model,
                    model: groq(llm.model),
                    providerOptions: {
                        groq: {
                            structuredOutputs: true
                        } satisfies GroqLanguageModelOptions
                    },
                    errorPath: '',
                    temperature,
                    tools,
                    prompt,
                    system
                }
            case 'kwirth':
                break
            case 'openai':
                const openai = createOpenAI({ apiKey: key })
                return {
                    llmProviderId: llm.provider,
                    llmModelId: llm.model,
                    model: openai(llm.model),
                    providerOptions: {
                        openai: {
                            // structuredOutputs: true,  this parameter is not supported by openai (or we are no using th right modeloptions)
                            // CHANGELOG.md:- 9bf7291: chore(providers/openai): enable structuredOutputs by default & switch to provider option
                        } satisfies OpenAILanguageModelChatOptions
                    },
                    errorPath: '',
                    temperature,
                    tools,
                    prompt,
                    system
                }
            case 'mistral':
                const mistral = createMistral({ apiKey: key })
                return {
                    llmProviderId: llm.provider,
                    llmModelId: llm.model,
                    model: mistral(llm.model),
                    providerOptions: {
                        mistral: {
                            strictJsonSchema: true,
                            structuredOutputs: true
                        } satisfies MistralLanguageModelOptions
                    },
                    errorPath: '',
                    temperature,
                    tools,
                    prompt,
                    system
                }
            default:
                this.broadcastError(`Cannot find LLM provider '${llm.provider}'`)
        }
        return undefined
    }

    async processProviderEvent(providerId:string, event:IEventsProviderEvent|IBusinessProviderEvent|IMetricsCluster) : Promise<void> {
        switch(providerId) {
            case 'business':
                let businessEvent = event as IBusinessProviderEvent
                logInfo(ELogComponent.PROVIDER, event)

                // playground: handle launch.immediate events fired from the Sandbox UI
                if (this.playgroundTrigger) {
                    const lastEvt = businessEvent.last?.event
                    if (lastEvt?.space === 'launch' && lastEvt?.type === 'immediate') {
                        const payload = typeof lastEvt.data === 'string' ? lastEvt.data : JSON.stringify(lastEvt.data ?? '')
                        const triggerType: 'business' | 'artifact' = lastEvt.triggerType === 'artifact' ? 'artifact' : 'business'
                        await this.executePlayground(payload, triggerType)
                        break
                    }
                }

                for (let t of this.pinocchioConfig.triggers.filter(t => t.trigger === 'business')) {
                  for (let version of t.versions.filter(v => v.enabled)) {
                    try {
                        let {llmModelId, llmProviderId, model, temperature, providerOptions, errorPath, system, prompt, tools} = await this.buildModelInvocation(t, version, businessEvent) || {}
                        if (!model) return

                        this.broadcastMessage(`Received business event ${JSON.stringify(businessEvent.last.event)}`)
                        const { output, usage, steps } = await generateText({
                            model,
                            temperature,
                            stopWhen: stepCountIs(15),
                            tools,
                            providerOptions,
                            output: Output.object({
                                schema: z.object({
                                    response: z.string().describe('response to the question'),
                                }),
                            }),
                            system: "Use the tools provided to find information, and once you have the data, format your final response strictly as a JSON object according to the schema.",
                            prompt: prompt||'Hi AI, how are you?',
                        })
                        // logTrace(output)
                        // logTrace(steps)
                        this.broadcastMessage(JSON.stringify(output.response))
                    }
                    catch (err:any) {
                        let message = `Pinocchio analysis ended in error when processing 'business' while analyzing`
                        logInfo(ELogComponent.PROVIDER, message)
                        console.log(err)
                        this.broadcastMessage(message)
                        this.broadcastMessage(JSON.stringify(err))
                    }
                  }
                }
                break
            case 'metrics':
                let metricsEvent = event as IMetricsCluster
                this.clusterMetrics.push(metricsEvent)
                if (this.clusterMetrics.length>100) this.clusterMetrics.shift()
                break
            case 'events':
                let eventsEvent = event as IEventsProviderEvent
                if (eventsEvent.type==='ADDED') {
                    try {                        
                        for (let t of this.pinocchioConfig.triggers.filter(t => t.trigger === 'artifact' && t.kind === eventsEvent.obj.kind)) {
                          for (let version of t.versions.filter(v => v.enabled)) {
                            logInfo(ELogComponent.PROVIDER, `Pinocchio: added ${eventsEvent.obj.kind} ${eventsEvent.obj.metadata?.name}`)
                            if (eventsEvent.obj?.metadata?.creationTimestamp) {
                                let creationTs = Date.parse(eventsEvent.obj?.metadata?.creationTimestamp)
                                if (creationTs<this.startTime) {
                                    logWarning(ELogComponent.CHANNEL, `Bypass object analysis, creation timestamp is previous for object ${eventsEvent.obj?.metadata?.name} and kind ${t.kind} for LLM ${version.llm}`)
                                    continue
                                }
                            }

                            let {llmModelId, llmProviderId, model, temperature, providerOptions, errorPath, system, prompt, tools} = await this.buildModelInvocation(t, version, eventsEvent) || {}
                            if (!model) return

                            try {
                                const { output, usage } = await generateText({
                                    model,
                                    temperature,
                                    tools,
                                    providerOptions,
                                    output: Output.object({
                                        schema: z.object({
                                            findings: z.array(
                                                z.object({
                                                    description: z.string().min(1),
                                                    level: z.enum(['low', 'medium', 'high', 'critical']),
                                                })
                                            )
                                        }),
                                    }),
                                    //'You are a kubernetes admin expert, and you are in charge of deploying only workload that are secure. Generate a security analysis for this pod following the schema, y dámelo en español',
                                    system: system||'You are a very polite AI system', 
                                    prompt: prompt||'Hi AI, how are you?',
                                })

                                let analysis:IAnalysis = {
                                    text: `${eventsEvent.type} ${eventsEvent.obj.kind} '${eventsEvent.obj.metadata.name}' in namespace '${eventsEvent.obj.metadata.namespace}' [LLM:${llmProviderId}/${llmModelId}, IN:${usage.inputTokens}, OUT:${usage.outputTokens}]`,
                                    findings: output.findings,
                                    timestamp: Date.now(),
                                    usage: {
                                        input: usage.inputTokens,
                                        output: usage.outputTokens
                                    },
                                    pod: eventsEvent.obj
                                }
                                this.analysis.push(analysis)
                                this.broadcastAnalysis(analysis)
                            }
                            catch (err:any) {
                                let message = `Pinocchio analysis ended in error while processing 'events' when analyzing '${eventsEvent.obj.metadata.name}' in namespace '${eventsEvent.obj.metadata.namespace}' [Kind:${eventsEvent.obj.kind}]`
                                logInfo(ELogComponent.PROVIDER, message)
                                console.log(err)
                                try {
                                    let msg = _.get(err, errorPath)
                                }
                                catch {}
                                let an:IAnalysis = {
                                    findings: [
                                        { description: message, level: 'critical'},
                                        { description: JSON.stringify(err), level: 'critical'}
                                    ],
                                    timestamp: Date.now()
                                }
                                this.broadcastAnalysis(an)
                            }
                          }
                        }
                    }
                    catch (err) {
                        logError(ELogComponent.CHANNEL, 'Error in Pinocchio')
                        logError(ELogComponent.CHANNEL, err)
                    }
                }
                break
            default:
                logError(ELogComponent.CHANNEL, `Ignored provider event from ${providerId} to channel ${this.getChannelData().id}`)
        }
    }

    async endpointRequest(endpoint:string,req:Request, res:Response) : Promise<void> {
    }

    async websocketRequest(newWebSocket:WebSocket) : Promise<void> {
    }

    containsAsset = (webSocket:WebSocket, podNamespace:string, podName:string, containerName:string): boolean => {
        return false
    }

    containsInstance = (instanceId: string): boolean => {
        return this.connections.some(socket => socket.instances.find(i => i.instanceId === instanceId))
    }

    processCommand = async (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
            return false
        }
        else {
            let instance = this.getInstance(webSocket, instanceMessage.instance)
            if (!instance) {
                this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, `Instance not found`)
                logWarning(ELogComponent.PROVIDER,`Instance ${instanceMessage.instance} not found`)
                return false
            }
            let pinocchioMessage = instanceMessage as IPinocchioMessage
            switch(pinocchioMessage.command) {
                case EPinocchioCommand.PROVIDERSAVAILABLE:
                    let msgProvidersAvailable:IPinocchioMessageResponse = {
                        msgtype: 'pinocchiomessageresponse',
                        channel: 'pinocchio',
                        action: EInstanceMessageAction.COMMAND,
                        flow: EInstanceMessageFlow.RESPONSE,
                        type: EInstanceMessageType.DATA,
                        instance: instance.instanceId,
                        providersAvailable: ['google', 'openai', 'openrouter', 'mistral', 'groq', 'deepseek', 'kwirth', ]
                    }
                    webSocket.send(JSON.stringify(msgProvidersAvailable))
                    break
                case EPinocchioCommand.TOOLSAVAILABLE:
                    let msgToolsAvailable:IPinocchioMessageResponse = {
                        msgtype: 'pinocchiomessageresponse',
                        channel: 'pinocchio',
                        action: EInstanceMessageAction.COMMAND,
                        flow: EInstanceMessageFlow.RESPONSE,
                        type: EInstanceMessageType.DATA,
                        instance: instance.instanceId,
                        toolsAvailable: toolInfoList
                    }
                    webSocket.send(JSON.stringify(msgToolsAvailable))
                    break
                case EPinocchioCommand.PROVIDERSGET:
                    this.executeProvidersGet()
                    break
                case EPinocchioCommand.CONFIGGET:
                    this.executeConfigGet()
                    break
                case EPinocchioCommand.CONFIGSET:
                    let config:IPinocchioConfig = pinocchioMessage.data
                    this.pinocchioConfig = config
                    await this.backChannelObject.writeStorage!('pinocchio-config', false, config)
                    this.executeConfigGet()
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Config updated')
                    break
                case EPinocchioCommand.PROVIDERSSET:
                    let provs:IConfigProvider[] = pinocchioMessage.data
                    this.providers = provs
                    await this.backChannelObject.writeStorage!('pinocchio-providers', true, provs)
                    await loadModels(this.providers)
                    this.executeProvidersGet()
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Providers updated')
                    break
                case EPinocchioCommand.PLAYGROUNDSET:
                    this.playgroundTrigger = pinocchioMessage.data as IConfigTriggerVersion
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Playground config applied')
                    break
            }
            return true
        }
    }

    executePlayground = async (payload: string, triggerType: 'business' | 'artifact' = 'business') => {
        if (!this.playgroundTrigger) {
            this.broadcastMessage('Sandbox: no config applied yet — click "Apply Config" first')
            return
        }

        let version: IConfigTriggerVersion
        let dummyTrigger: IConfigTrigger
        let fakeEvent: IEventsProviderEvent | IBusinessProviderEvent

        if (triggerType === 'artifact') {
            let obj: any = {}
            try { obj = JSON.parse(payload) } catch { obj = { raw: payload } }
            const promptType = this.playgroundTrigger.prompt ? 'jinja' : 'artifact'
            version = { ...this.playgroundTrigger, promptType }
            dummyTrigger = { id: 'playground', trigger: 'artifact', versions: [] }
            fakeEvent = { type: 'ADDED', obj }
        } else {
            version = { ...this.playgroundTrigger, prompt: payload, promptType: 'jinja' }
            dummyTrigger = { id: 'playground', trigger: 'business', versions: [] }
            fakeEvent = { last: { type: 'event', timestamp: Date.now(), event: {} }, all: new Map() }
        }

        try {
            const invocation = await this.buildModelInvocation(dummyTrigger, version, fakeEvent)
            if (!invocation) return
            const { model, temperature, providerOptions, tools, prompt: effectivePrompt } = invocation

            this.broadcastMessage(`[Playground] type: ${triggerType}`)
            this.broadcastMessage(`[Playground] llm: ${version.llm}`)
            this.broadcastMessage(`[Playground] system: ${version.system || '(none)'}`)
            this.broadcastMessage(`[Playground] prompt: ${effectivePrompt}`)
            this.broadcastMessage(`[Playground] tools: ${version.tools.join(', ') || '(none)'}`)

            // auto tool selection: ask LLM which tools it needs before running
            let activeTools = tools
            if (version.autoTools && Object.keys(tools).length > 0) {
                const toolListStr = Object.keys(tools).join(', ')
                const { text: selectionText } = await generateText({
                    model,
                    temperature,
                    providerOptions,
                    system: 'You are a planning assistant. Given a task and a list of available tools, respond with ONLY a comma-separated list of the tool names needed. No explanation, no punctuation beyond commas.',
                    prompt: `Task: ${effectivePrompt}\n\nAvailable tools: ${toolListStr}`
                })
                const selectedNames = selectionText.split(',').map(s => s.trim()).filter(n => n in tools)
                this.broadcastMessage(`[Auto tools] selected: ${selectedNames.join(', ') || '(none)'}`)
                activeTools = Object.fromEntries(selectedNames.map(n => [n, tools[n]]))
            }

            // phase 1: tool data gathering
            const { text: phase1Text, usage: usage1, steps } = await generateText({
                model,
                temperature,
                stopWhen: stepCountIs(version.steps || 5),
                tools: activeTools,
                providerOptions,
                system: version.system || 'You are a helpful assistant.',
                prompt: effectivePrompt
            })

            const toolLines: string[] = []
            for (const step of steps) {
                const s = step as unknown as { toolCalls: unknown[]; toolResults: unknown[] }
                for (const toolCall of (s.toolCalls ?? [])) {
                    const tc = toolCall as { toolName: string; input: unknown }
                    this.broadcastMessage(`[Tool call] ${tc.toolName}(${JSON.stringify(tc.input)})`)
                }
                for (const toolResult of (s.toolResults ?? [])) {
                    const tr = toolResult as { toolName: string; output: unknown }
                    this.broadcastMessage(`[Tool result] ${tr.toolName}: ${JSON.stringify(tr.output)}`)
                    toolLines.push(`${tr.toolName}: ${JSON.stringify(tr.output)}`)
                }
            }

            // phase 2: if model didn't generate text after tool calls, summarize explicitly
            let finalResponse = phase1Text
            let totalIn = usage1.inputTokens ?? 0
            let totalOut = usage1.outputTokens ?? 0

            if (!finalResponse && toolLines.length > 0) {
                const summaryPrompt = `${effectivePrompt}\n\nInformation gathered from tools:\n${toolLines.join('\n')}\n\nPlease provide a comprehensive answer based on the above data.`
                const { text: phase2Text, usage: usage2 } = await generateText({
                    model,
                    temperature,
                    providerOptions,
                    system: version.system || 'You are a helpful assistant.',
                    prompt: summaryPrompt
                })
                finalResponse = phase2Text
                totalIn += usage2.inputTokens ?? 0
                totalOut += usage2.outputTokens ?? 0
            }

            this.broadcastMessage(`[Playground] response: ${finalResponse || '(empty)'}`)
            this.broadcastMessage(`[Playground] tokens: ${totalIn} in / ${totalOut} out — ${steps.length} step(s)`)
        }
        catch (err: any) {
            this.broadcastMessage(`[Sandbox error] ${err.message ?? String(err)}`)
        }
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        logInfo(ELogComponent.CHANNEL, `Start ${this.getChannelData().id} instance ${instanceConfig.instance} ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view})`)

        let socket = this.connections.find(s => s.webSocket === webSocket)
        if (!socket) {
            let len = this.connections.push( {webSocket:webSocket, lastRefresh: Date.now(), instances:[]} )
            socket = this.connections[len-1]
        }

        let instances = socket.instances
        let instance = instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = {
                accessKey: accessKeyDeserialize(instanceConfig.accessKey),
                instanceId: instanceConfig.instance
            }
            instances.push(instance)
        }
        this.sendMessage(webSocket, instance, {timestamp:Date.now(), text: 'Pinocchio session accepted'})
        this.sendBatch(webSocket, instance)
        return true
    }

    deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
        return true
    }
    
    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
    }

    modifyInstance = (webSocket:WebSocket, instanceConfig: IInstanceConfig): void => {
    }

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        let instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Pinocchio instance stopped')
        }
        else {
            this.sendSignalMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Pinocchio instance not found`)
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        let socket = this.connections.find(s => s.webSocket === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let pos = instances.findIndex(t => t.instanceId === instanceId)
                if (pos>=0) {
                    instances.splice(pos,1)
                }
                else {
                    logWarning(ELogComponent.CHANNEL, `Instance ${instanceId} not found, cannot delete`)
                }
            }
            else {
                logWarning(ELogComponent.CHANNEL, 'There are no Pinocchio Instances on websocket')
            }
        }
        else {
            logWarning(ELogComponent.CHANNEL, 'WebSocket not found on Pinocchio')
        }
    }

    containsConnection = (webSocket:WebSocket): boolean => {
        return Boolean (this.connections.find(s => s.webSocket === webSocket))
    }

    removeConnection = (webSocket: WebSocket): void => {
        let socket = this.connections.find(s => s.webSocket === webSocket)
        if (socket) {
            for (let instance of socket.instances) {
                this.removeInstance (webSocket, instance.instanceId)
            }
            let pos = this.connections.findIndex(s => s.webSocket === webSocket)
            this.connections.splice(pos,1)
        }
        else {
            logInfo(ELogComponent.CHANNEL, 'WebSocket not found on Pinocchio for remove')
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        let socket = this.connections.find(s => s.webSocket === webSocket)
        if (socket) {
            socket.lastRefresh = Date.now()
            return true
        }
        else {
            logInfo(ELogComponent.CHANNEL, 'WebSocket not found')
            return false
        }
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (let entry of this.connections) {
            let exists = entry.instances.find(i => i.instanceId === instanceId)
            if (exists) {
                entry.webSocket = newWebSocket
                return true
            }
        }
        return false
    }

    // *************************************************************************************
    // PRIVATE
    // *************************************************************************************

    executeConfigGet = async () => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                let msgConfig:IPinocchioMessageResponse = {
                    msgtype: 'pinocchiomessageresponse',
                    channel: 'pinocchio',
                    action: EInstanceMessageAction.COMMAND,
                    flow: EInstanceMessageFlow.RESPONSE,
                    type: EInstanceMessageType.DATA,
                    instance: instance.instanceId,
                    config: this.pinocchioConfig
                }
                connection.webSocket.send(JSON.stringify(msgConfig))
            }
        }
    }

    executeProvidersGet = async () => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                let msgProviders:IPinocchioMessageResponse = {
                    msgtype: 'pinocchiomessageresponse',
                    channel: 'pinocchio',
                    action: EInstanceMessageAction.COMMAND,
                    flow: EInstanceMessageFlow.RESPONSE,
                    type: EInstanceMessageType.DATA,
                    instance: instance.instanceId,
                    providers: this.providers
                }
                connection.webSocket.send(JSON.stringify(msgProviders))
            }
        }
    }
    
    private broadcastAnalysis = (analysis:IAnalysis) => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                this.sendAnalysis(connection.webSocket, instance, analysis)
            }
        }
    }

    private broadcastMessage = (text:string) => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                this.sendMessage(connection.webSocket, instance, {timestamp:Date.now(), text})
            }
        }
    }

    private broadcastError = (text:string) => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                this.sendSignalError(connection.webSocket, instance, text)
            }
        }
    }

    private sendAnalysis = (ws:WebSocket, instance:IInstance, analysis:IAnalysis) => {
        let msg:IPinocchioMessageResponse = {
            msgtype: 'pinocchiomessageresponse',
            channel: 'pinocchio',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            analysis
        }
        ws.send(JSON.stringify(msg))
    }

    private sendMessage = (ws:WebSocket, instance:IInstance, message:IMessage) => {
        let msg:IPinocchioMessageResponse = {
            msgtype: 'pinocchiomessageresponse',
            channel: 'pinocchio',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            message
        }
        ws.send(JSON.stringify(msg))
    }

    private sendBatch = (ws:WebSocket, instance:IInstance) => {
        let msg:IPinocchioMessageResponse = {
            msgtype: 'pinocchiomessageresponse',
            channel: 'pinocchio',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instance.instanceId,
            analysis:{
                findings: [],
                timestamp: 0
            }
        }
        for (let an of this.analysis) {
            msg.analysis = an
            ws.send(JSON.stringify(msg))
        }
    }

    private sendSignalMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId:string, text:string): void => {
        var resp:ISignalMessage = {
            action,
            flow,
            channel: 'pinocchio',
            instance: instanceId,
            type: EInstanceMessageType.SIGNAL,
            text,
            level
        }
        ws.send(JSON.stringify(resp))
    }

    private sendSignalError = (ws:WebSocket, instance:IInstance, text:string): void => {
        var errorMessage:ISignalMessage = {
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.RESPONSE,
            channel: 'pinocchio',
            instance: instance.instanceId,
            type: EInstanceMessageType.SIGNAL,
            level: ESignalMessageLevel.ERROR,
            text
        }
        ws.send(JSON.stringify(errorMessage))
    }

    getInstance(webSocket:WebSocket, instanceId: string) : IInstance | undefined{
        let socket = this.connections.find(entry => entry.webSocket === webSocket)
        if (socket) {
            let instances = socket.instances
            if (instances) {
                let instanceIndex = instances.findIndex(t => t.instanceId === instanceId)
                if (instanceIndex>=0) return instances[instanceIndex]
                logInfo(ELogComponent.CHANNEL, 'Instance not found')
            }
            else {
                logInfo(ELogComponent.CHANNEL, 'There are no Instances on websocket')
            }
        }
        else {
            logInfo(ELogComponent.CHANNEL, 'WebSocket not found')
        }
        return undefined
    }

}

export { PinocchioChannel }
