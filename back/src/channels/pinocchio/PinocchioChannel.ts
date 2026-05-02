import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IBackChannelObject, IBackChannelRequirements, IChannel } from '../IChannel';
import { EPinocchioCommand, IAnalysis, IConfigTrigger, IConfigProvider, IPinocchioConfig, IPinocchioMessage, IPinocchioMessageResponse, kindsAvailable, IMessage } from './PinocchioConfig'
import { INewMetricsCluster } from '../../providers/newmetrics/INewMetricsModel'
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
import { getToolByName, IToolContext } from './Tools';

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
        providers: ['events', 'business', 'newmetrics']
    }
    clusterInfo : ClusterInfo
    backChannelObject : IBackChannelObject
    connections: {
        webSocket:WebSocket,
        lastRefresh: number,
        instances: IInstance[] 
    }[] = []
    clusterMetrics: INewMetricsCluster[] = []
    analysis: IAnalysis[] = []
    providers: IConfigProvider[] = []
    pinocchioConfig: IPinocchioConfig = {
        triggers: [],
        llms: []
    }
    startTime: number

    constructor (clusterInfo:ClusterInfo, backChannelObject:IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
        this.startTime = Date.now()
    }

    startChannel = async () =>  {
        this.clusterInfo.addSubscriber('newmetrics', this, {
        })
        this.clusterInfo.addSubscriber('business', this, {
            spaces: [
                { name: 'customers', types: ['status'] },
                { name: 'branches', types: ['status'] }
            ]
        })
        this.clusterInfo.addSubscriber('events', this, {
            kinds: kindsAvailable,
            crdInstances: [],
            syncCrdInstances: false        
        })
        let provs = await this.backChannelObject.readStorage!('providers', true)
        if (provs) this.providers = provs
        let config = await this.backChannelObject.readStorage!('config', false) as IPinocchioConfig
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
            cluster: true
        }
    }

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'none', 'cluster'].indexOf(scope)
    }

    buildModelInvocation = async (triggerDefinition:IConfigTrigger, event:IEventsProviderEvent|IBusinessProviderEvent|INewMetricsCluster) : Promise<IModelInvocation|undefined> => {
        let prompt
        let llm = this.pinocchioConfig.llms.find(l => l.id === triggerDefinition.llm)
        if (!llm) {
            this.broadcastError(`Cannot find LLM with id '${triggerDefinition.llm}'`)
            return undefined
        }
        let key = llm.useProviderKey? this.providers.find(p => p.name === llm.provider)?.key : llm.key
        if (!key) {
            this.broadcastError(`Cannot get provider API key for LLM '${triggerDefinition.llm}'`)
            return undefined
        }
        switch(triggerDefinition.trigger) {
            case 'business':
                let businessEvent = event as IBusinessProviderEvent
                // prepare data objects for nunjucks
                let nunjucksObj:any = {}
                for (let spaceType of triggerDefinition.spaces) {
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
                prompt = nunjucks.renderString(triggerDefinition.prompt, {})
                break
            case 'artifact':
                let eventsEvent = event as IEventsProviderEvent
                switch(triggerDefinition.promptType) {
                    case 'artifact':
                        prompt = JSON.stringify(eventsEvent.obj)
                        break
                    case 'jinja':
                        prompt = nunjucks.renderString(triggerDefinition.prompt, eventsEvent.obj)
                        break
                }
                break
            default:
                logWarning(ELogComponent.CHANNEL, `Received invalid trigger type: '${triggerDefinition.trigger}'`)
                return undefined
        }

        let system = triggerDefinition.system
        let temperature = llm.temperature
        if (temperature<0) temperature=0
        if (temperature>1) temperature=1
        console.log('getnodes')
        let context:IToolContext = {
            origin: 'Pinocchio',
            nodes: await this.clusterInfo.getNodes()
        }
        console.log(context.nodes)
        let tools: any = {}
        for (let toolName of triggerDefinition.tools) {
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

    async processProviderEvent(providerId:string, event:IEventsProviderEvent|IBusinessProviderEvent|INewMetricsCluster) : Promise<void> {
        switch(providerId) {
            case 'business':
                let businessEvent = event as IBusinessProviderEvent
                logInfo(ELogComponent.PROVIDER, event)
                this.broadcastError('Received business event '+JSON.stringify(event))

                for (let triggerDefinition of this.pinocchioConfig.triggers.filter(t => t.enabled && t.trigger==='business')) {
                    try {
                        let {llmModelId, llmProviderId, model, temperature, providerOptions, errorPath, system, prompt, tools} = await this.buildModelInvocation(triggerDefinition, businessEvent) || {}
                        if (!model) return
                        this.broadcastMessage('Received business event')
                        const { output, usage, steps } = await generateText({
                            model,
                            temperature,
                            stopWhen: stepCountIs(5),
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
                        logTrace(output)
                        logTrace(steps)
                        this.broadcastMessage(JSON.stringify(output.response))
                    }
                    catch (err:any) {
                        let message = `Pinocchio analysis ended in error when analyzing`
                        logInfo(ELogComponent.PROVIDER, message)
                        logInfo(ELogComponent.PROVIDER, err)
                        this.broadcastMessage(message)
                        this.broadcastMessage(JSON.stringify(err))
                    }
                }
                break
            case 'newmetrics':
                let newmetricsEvent = event as INewMetricsCluster
                logTrace('Received metrics')
                this.clusterMetrics.push(newmetricsEvent)
                if (this.clusterMetrics.length>100) this.clusterMetrics.shift()
                break
            case 'events':
                let eventsEvent = event as IEventsProviderEvent
                if (eventsEvent.type==='ADDED') {
                    try {                        
                        for (let trigger of this.pinocchioConfig.triggers.filter(t => t.enabled && t.trigger==='artifact' && t.kind===eventsEvent.obj.kind)) {
                            logInfo(ELogComponent.PROVIDER, `Pinocchio: added ${eventsEvent.obj.kind} ${eventsEvent.obj.metadata?.name}`)
                            if (eventsEvent.obj?.metadata?.creationTimestamp) {
                                let creationTs = Date.parse(eventsEvent.obj?.metadata?.creationTimestamp)
                                if (creationTs<this.startTime) {
                                    logWarning(ELogComponent.CHANNEL, `Bypass object analysis, creation timestamp is previous for object ${eventsEvent.obj?.metadata?.name} and kind ${trigger.kind} for LLM ${trigger.llm}`)
                                    continue
                                }
                            }

                            let {llmModelId, llmProviderId, model, temperature, providerOptions, errorPath, system, prompt, tools} = await this.buildModelInvocation(trigger, eventsEvent) || {}
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
                                let message = `Pinocchio analysis ended in error when analyzing '${eventsEvent.obj.metadata.name}' in namespace '${eventsEvent.obj.metadata.namespace}' [Kind:${eventsEvent.obj.kind}]`
                                logInfo(ELogComponent.PROVIDER, message)
                                logInfo(ELogComponent.PROVIDER, err)
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
                        toolsAvailable: [
                            ...['get_cluster_data', 'get_workload_data', 'get_node_data', 'get_deployment_usage', 'get_node_usage', 'get_cluster_usage', 'get_space_data'],
                            ...['get_prev_space_data', 'get_prev_deployment_usage', 'get_prev_node_usage', 'get_prev_cluster_usage'],
                            ...['add_node', 'add_replica', 'remove_node', 'remove_replica', 'times_two', 'father_of' ]
                        ]
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
                    await this.backChannelObject.writeStorage!('config', false, config)
                    this.executeConfigGet()
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Config updated')
                    break
                case EPinocchioCommand.PROVIDERSSET:
                    let provs:IConfigProvider[] = pinocchioMessage.data
                    this.providers = provs
                    await this.backChannelObject.writeStorage!('providers', true, provs)
                    await loadModels(this.providers)
                    this.executeProvidersGet()
                    this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Providers updated')
                    break
            }
            return true
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
        let analysis:IAnalysis = {
            findings: [],
            timestamp: Date.now(),
            text: 'Pinocchio session accepted'
        }
        this.sendAnalysis(webSocket, instance, analysis)
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

// import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
// import { ClusterInfo } from '../../model/ClusterInfo'
// import { IBackChannelObject, IBackChannelRequirements, IChannel } from '../IChannel';
// import { Request, Response } from 'express'
// import { generateText, Output, stepCountIs, Tool } from 'ai'
// import { createGoogleGenerativeAI, GoogleLanguageModelOptions } from '@ai-sdk/google'
// import { createMistral, MistralLanguageModelOptions } from '@ai-sdk/mistral'
// import { z } from 'zod'
// import { EPinocchioCommand, IAnalysis, IConfigTrigger, IConfigProvider, IPinocchioConfig, IPinocchioMessage, IPinocchioMessageResponse, kindsAvailable } from './PinocchioConfig'
// import { loadModels } from './Utils'
// import { createOpenAI, OpenAILanguageModelChatOptions } from '@ai-sdk/openai'
// import { createGroq, GroqLanguageModelOptions } from '@ai-sdk/groq'
// import { createOpenRouter } from '@openrouter/ai-sdk-provider'
// import { createDeepSeek } from '@ai-sdk/deepseek'
// import { ELogComponent, logError, logInfo, logTrace, logWarning } from '../../tools/Logging';
// import { INewMetricsCluster } from '../../providers/newmetrics/INewMetricsModel';
// import { getToolByName, toolset } from './Tools';
// const _ = require('lodash')
// const nunjucks = require('nunjucks')

// // basic nunjucks config
// nunjucks.configure({ autoescape: true })

// interface IInstance {
//     instanceId: string
//     accessKey: AccessKey
// }

// interface IEventsProviderEvent {
//     type: 'ADDED'|'MODIFIED'|'DELETED'
//     obj:any
// }

// interface IBusinessProviderEvent {
//     last: {
//         type: 'event',
//         timestamp: number,
//         event: any
//     },
//     all: Map<string, Map<string,any[]>>
// }

// interface IModelInvocation {
//     llmProviderId: string
//     llmModelId: string
//     model: any //LanguageModelV3
//     temperature: number
//     providerOptions: any //GoogleLanguageModelOptions|MistralLanguageModelOptions
//     errorPath: string
//     system: string
//     prompt: string
//     tools: any
// }

// class PinocchioChannel implements IChannel {
//     readonly channelId = 'pinocchio'
//     readonly requirements: IBackChannelRequirements = {
//         storage: true
//     }
//     clusterInfo : ClusterInfo
//     backChannelObject : IBackChannelObject
//     connections: {
//         webSocket:WebSocket,
//         lastRefresh: number,
//         instances: IInstance[] 
//     }[] = []
//     clusterMetrics: INewMetricsCluster[] = []
//     analysis: IAnalysis[] = []
//     providers: IConfigProvider[] = []
//     pinocchioConfig: IPinocchioConfig = {
//         triggers: [],
//         llms: []
//     }
//     startTime: number

//     constructor (clusterInfo:ClusterInfo, backChannelObject:IBackChannelObject) {
//         this.clusterInfo = clusterInfo
//         this.backChannelObject = backChannelObject
//         this.startTime = Date.now()
//     }

//     startChannel = async () =>  {
//         this.clusterInfo.addSubscriber('newmetrics', this, {
//         })
//         this.clusterInfo.addSubscriber('business', this, {
//             spaces: [
//                 { name: 'customers', types: ['status'] },
//                 { name: 'branches', types: ['status'] }
//             ]
//         })
//         this.clusterInfo.addSubscriber('events', this, {
//             kinds: kindsAvailable,
//             crdInstances: [],
//             syncCrdInstances: false        
//         })
//         let provs = await this.backChannelObject.readStorage!('providers', true)
//         if (provs) this.providers = provs
//         let config = await this.backChannelObject.readStorage!('config', false) as IPinocchioConfig
//         if (config) this.pinocchioConfig = config
//         loadModels(this.providers)
//     }

//     getChannelData = (): BackChannelData => {
//         return {
//             id: 'pinocchio',
//             routable: false,
//             pauseable: true,
//             modifiable: false,
//             reconnectable: true,
//             metrics: false,
//             providers: ['events', 'business', 'newmetrics'],
//             sources: [ EClusterType.KUBERNETES ],
//             endpoints: [],
//             websocket: false,
//             cluster: true
//         }
//     }

//     getChannelScopeLevel = (scope: string): number => {
//         return ['', 'none', 'cluster'].indexOf(scope)
//     }

//     buildModelInvocation = (triggerDefinition:IConfigTrigger, event:IEventsProviderEvent|IBusinessProviderEvent|INewMetricsCluster) : IModelInvocation|undefined => {
//         let prompt
//         let llm = this.pinocchioConfig.llms.find(l => l.id === triggerDefinition.llm)
//         if (!llm) {
//             this.broadcastError(`Cannot find LLM with id '${triggerDefinition.llm}'`)
//             return undefined
//         }
//         let key = llm.useProviderKey? this.providers.find(p => p.name === llm.provider)?.key : llm.key
//         if (!key) {
//             this.broadcastError(`Cannot get provider API key for LLM '${triggerDefinition.llm}'`)
//             return undefined
//         }
//         switch(triggerDefinition.trigger) {
//             case 'business':
//                 let businessEvent = event as IBusinessProviderEvent
//                 // prepare data objects for nunjucks
//                 let nunjucksObj:any = {}
//                 for (let spaceType of triggerDefinition.spaces) {
//                     let [space, type] = spaceType.split('.')
//                     let spaceData = businessEvent.all.get(space)
//                     if (spaceData) {
//                         let typeData = spaceData.get(type)
//                         if (typeData) {
//                             nunjucksObj[space] = {}
//                             nunjucksObj[space][type] = {}
//                         }
//                     }
//                 }
//                 prompt = nunjucks.renderString(triggerDefinition.prompt, {})
//                 break
//             case 'artifact':
//                 let eventsEvent = event as IEventsProviderEvent
//                 switch(triggerDefinition.promptType) {
//                     case 'artifact':
//                         prompt = JSON.stringify(eventsEvent.obj)
//                         break
//                     case 'jinja':
//                         prompt = nunjucks.renderString(triggerDefinition.prompt, eventsEvent.obj)
//                         break
//                 }
//                 break
//             default:
//                 logWarning(ELogComponent.CHANNEL, `Received invalid trigger type: '${triggerDefinition.trigger}'`)
//                 return undefined
//         }

//         let system = triggerDefinition.system
//         let temperature = llm.temperature
//         if (temperature<0) temperature=0
//         if (temperature>1) temperature=1
//         let tools: any = {}
//         for (let toolName of triggerDefinition.tools) {
//             tools[toolName] = (getToolByName(toolName))
//         }

//         switch(llm.provider) {
//             case 'deepseek':
//                 const deepseek = createDeepSeek({ apiKey: key })
//                 return {
//                     llmProviderId: llm.provider,
//                     llmModelId: llm.model,
//                     model: deepseek(llm.model),
//                     providerOptions: {
//                         openai: {
//                             // structuredOutputs: true  unsupported parm
//                         } satisfies OpenAILanguageModelChatOptions
//                     },
//                     errorPath: '',
//                     temperature,
//                     tools,
//                     prompt,
//                     system
//                 }
//             case 'google':
//                 const google = createGoogleGenerativeAI({ apiKey: key })
//                 return {
//                     llmProviderId: llm.provider,
//                     llmModelId: llm.model,
//                     model: google(llm.model),
//                     providerOptions: {
//                         google: {
//                             structuredOutputs: true,
//                         } satisfies GoogleLanguageModelOptions
//                     },
//                     errorPath: 'lastError.data.error.message',
//                     temperature,
//                     tools,
//                     prompt,
//                     system
//                 }
//             case 'openrouter':
//                 const openRouter = createOpenRouter({ apiKey: key })
//                 return {
//                     llmProviderId: llm.provider,
//                     llmModelId: llm.model,
//                     model: openRouter(llm.model),
//                     providerOptions: {
//                     },
//                     errorPath: '',
//                     temperature,
//                     tools,
//                     prompt,
//                     system
//                 }
//             case 'groq':
//                 const groq = createGroq({ apiKey: key })
//                 return {
//                     llmProviderId: llm.provider,
//                     llmModelId: llm.model,
//                     model: groq(llm.model),
//                     providerOptions: {
//                         groq: {
//                             structuredOutputs: true
//                         } satisfies GroqLanguageModelOptions
//                     },
//                     errorPath: '',
//                     temperature,
//                     tools,
//                     prompt,
//                     system
//                 }
//             case 'kwirth':
//                 break
//             case 'openai':
//                 const openai = createOpenAI({ apiKey: key })
//                 return {
//                     llmProviderId: llm.provider,
//                     llmModelId: llm.model,
//                     model: openai(llm.model),
//                     providerOptions: {
//                         openai: {
//                             // structuredOutputs: true,  this parameter is not supported by openai (or we are no using th right modeloptions)
//                             // CHANGELOG.md:- 9bf7291: chore(providers/openai): enable structuredOutputs by default & switch to provider option
//                         } satisfies OpenAILanguageModelChatOptions
//                     },
//                     errorPath: '',
//                     temperature,
//                     tools,
//                     prompt,
//                     system
//                 }
//             case 'mistral':
//                 const mistral = createMistral({ apiKey: key })
//                 return {
//                     llmProviderId: llm.provider,
//                     llmModelId: llm.model,
//                     model: mistral(llm.model),
//                     providerOptions: {
//                         mistral: {
//                             strictJsonSchema: true,
//                             structuredOutputs: true
//                         } satisfies MistralLanguageModelOptions
//                     },
//                     errorPath: '',
//                     temperature,
//                     tools,
//                     prompt,
//                     system
//                 }
//             default:
//                 this.broadcastError(`Cannot find LLM provider '${llm.provider}'`)
//         }
//         return undefined
//     }

//     async processProviderEvent(providerId:string, event:IEventsProviderEvent|IBusinessProviderEvent|INewMetricsCluster) : Promise<void> {
//         switch(providerId) {
//             case 'business':
//                 let businessEvent = event as IBusinessProviderEvent
//                 logInfo(ELogComponent.PROVIDER, event)
//                 this.broadcastError('Received business event '+JSON.stringify(event))

//                 for (let trigger of this.pinocchioConfig.triggers.filter(t => t.enabled && t.trigger==='business')) {
//                     try {
//                         let {llmModelId, llmProviderId, model, temperature, providerOptions, errorPath, system, prompt, tools} = this.buildModelInvocation(trigger, businessEvent) || {}
//                         if (!model) return
//                         console.log(tools)
//                         const { output, usage, steps } = await generateText({
//                             model,
//                             temperature,
//                             stopWhen: stepCountIs(5),
//                             tools,
//                             providerOptions,
//                             output: Output.object({
//                                 schema: z.object({
//                                     response: z.string().describe('the response to the question')
//                                 }),
//                             }),
//                             //'You are a kubernetes admin expert, and you are in charge of deploying only workload that are secure. Generate a security analysis for this pod following the schema, y dámelo en español',
//                             //system: system||'You are a very polite AI', 
//                             system: "You are a helpful assistant. Use the tools provided to find information, and once you have the data, format your final response strictly as a JSON object according to the schema.",
//                             prompt: prompt||''
                            
//                         })
//                         logTrace(output)
//                         logTrace(usage)
//                         logTrace(steps)
//                         this.broadcastError('Received business event '+JSON.stringify(output))
//                     }
//                     catch (err:any) {
//                         let message = `Pinocchio analysis ended in error when asking LLM`
//                         logInfo(ELogComponent.PROVIDER, message)
//                         logInfo(ELogComponent.PROVIDER, err)
//                         console.log(err)
//                         let an:IAnalysis = {
//                             timestamp: Date.now(),
//                             findings: [
//                                 { description: message, level: 'critical'},
//                                 { description: JSON.stringify(err), level: 'critical'}
//                             ],
//                         }
//                         this.broadcastAnalysis(an)
//                     }
//                 }
//                 break
//             case 'newmetrics':
//                 let newmetricsEvent = event as INewMetricsCluster
//                 logTrace('Received metrics')
//                 this.clusterMetrics.push(newmetricsEvent)
//                 if (this.clusterMetrics.length>100) this.clusterMetrics.shift()
//                 break
//             case 'events':
//                 let eventsEvent = event as IEventsProviderEvent
//                 if (eventsEvent.type==='ADDED') {
//                     try {                        
//                         for (let trigger of this.pinocchioConfig.triggers.filter(t => t.enabled && t.trigger==='artifact' && t.kind===eventsEvent.obj.kind)) {
//                             logInfo(ELogComponent.PROVIDER, `Pinocchio: added ${eventsEvent.obj.kind} ${eventsEvent.obj.metadata?.name}`)
//                             if (eventsEvent.obj?.metadata?.creationTimestamp) {
//                                 let creationTs = Date.parse(eventsEvent.obj?.metadata?.creationTimestamp)
//                                 if (creationTs<this.startTime) {
//                                     logWarning(ELogComponent.CHANNEL, `Bypass object analysis, creation timestamp is previous for object ${eventsEvent.obj?.metadata?.name} and kind ${trigger.kind} for LLM ${trigger.llm}`)
//                                     continue
//                                 }
//                             }

//                             let {llmModelId, llmProviderId, model, temperature, providerOptions, errorPath, system, prompt, tools} = this.buildModelInvocation(trigger, eventsEvent) || {}
//                             if (!model) return

//                             try {
//                                 const { output, usage } = await generateText({
//                                     model,
//                                     temperature,
//                                     tools,
//                                     providerOptions,
//                                     output: Output.object({
//                                         schema: z.object({
//                                             findings: z.array(
//                                                 z.object({
//                                                     description: z.string().min(1),
//                                                     level: z.enum(['low', 'medium', 'high', 'critical']),
//                                                 })
//                                             )
//                                         }),
//                                     }),
//                                     //'You are a kubernetes admin expert, and you are in charge of deploying only workload that are secure. Generate a security analysis for this pod following the schema, y dámelo en español',
//                                     system: system||'You are a very polite AI system', 
//                                     prompt: prompt||'Hi AI, how are you?',
//                                 })

//                                 let analysis:IAnalysis = {
//                                     text: `${eventsEvent.type} ${eventsEvent.obj.kind} '${eventsEvent.obj.metadata.name}' in namespace '${eventsEvent.obj.metadata.namespace}' [LLM:${llmProviderId}/${llmModelId}, IN:${usage.inputTokens}, OUT:${usage.outputTokens}]`,
//                                     findings: output.findings,
//                                     timestamp: Date.now(),
//                                     usage: {
//                                         input: usage.inputTokens,
//                                         output: usage.outputTokens
//                                     },
//                                     pod: eventsEvent.obj
//                                 }
//                                 this.analysis.push(analysis)
//                                 this.broadcastAnalysis(analysis)
//                             }
//                             catch (err:any) {
//                                 let message = `Pinocchio analysis ended in error when analyzing '${eventsEvent.obj.metadata.name}' in namespace '${eventsEvent.obj.metadata.namespace}' [Kind:${eventsEvent.obj.kind}]`
//                                 logInfo(ELogComponent.PROVIDER, message)
//                                 logInfo(ELogComponent.PROVIDER, err)
//                                 try {
//                                     let msg = _.get(err, errorPath)
//                                 }
//                                 catch {}
//                                 let an:IAnalysis = {
//                                     findings: [
//                                         { description: message, level: 'critical'},
//                                         { description: JSON.stringify(err), level: 'critical'}
//                                     ],
//                                     timestamp: Date.now()
//                                 }
//                                 this.broadcastAnalysis(an)
//                             }
//                         }
//                     }
//                     catch (err) {
//                         logError(ELogComponent.CHANNEL, 'Error in Pinocchio')
//                         logError(ELogComponent.CHANNEL, err)
//                     }
//                 }
//                 break
//             default:
//                 logError(ELogComponent.CHANNEL, `Ignored provider event from ${providerId} to channel ${this.getChannelData().id}`)
//         }
//     }

//     async endpointRequest(endpoint:string,req:Request, res:Response) : Promise<void> {
//     }

//     async websocketRequest(newWebSocket:WebSocket) : Promise<void> {
//     }

//     containsAsset = (webSocket:WebSocket, podNamespace:string, podName:string, containerName:string): boolean => {
//         return false
//     }

//     containsInstance = (instanceId: string): boolean => {
//         return this.connections.some(socket => socket.instances.find(i => i.instanceId === instanceId))
//     }

//     processCommand = async (webSocket:WebSocket, instanceMessage:IInstanceMessage) : Promise<boolean> => {
//         if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) {
//             return false
//         }
//         else {
//             let instance = this.getInstance(webSocket, instanceMessage.instance)
//             if (!instance) {
//                 this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, `Instance not found`)
//                 logWarning(ELogComponent.PROVIDER,`Instance ${instanceMessage.instance} not found`)
//                 return false
//             }
//             let pinocchioMessage = instanceMessage as IPinocchioMessage
//             switch(pinocchioMessage.command) {
//                 case EPinocchioCommand.PROVIDERSAVAILABLE:
//                     let msgProvidersAvailable:IPinocchioMessageResponse = {
//                         msgtype: 'pinocchiomessageresponse',
//                         channel: 'pinocchio',
//                         action: EInstanceMessageAction.COMMAND,
//                         flow: EInstanceMessageFlow.RESPONSE,
//                         type: EInstanceMessageType.DATA,
//                         instance: instance.instanceId,
//                         providersAvailable: ['google', 'openai', 'openrouter', 'mistral', 'groq', 'deepseek', 'kwirth', ]
//                     }
//                     webSocket.send(JSON.stringify(msgProvidersAvailable))
//                     break
//                 case EPinocchioCommand.TOOLSAVAILABLE:
//                     let msgToolsAvailable:IPinocchioMessageResponse = {
//                         msgtype: 'pinocchiomessageresponse',
//                         channel: 'pinocchio',
//                         action: EInstanceMessageAction.COMMAND,
//                         flow: EInstanceMessageFlow.RESPONSE,
//                         type: EInstanceMessageType.DATA,
//                         instance: instance.instanceId,
//                         toolsAvailable: [
//                             ...['times_two', 'father_of', 'get_cluster_data', 'get_workload_data', 'get_node_data', 'get_deployment_usage', 'get_node_usage', 'get_cluster_usage', 'get_space_data'],
//                             ...['get_prev_space_data', 'get_prev_deployment_usage', 'get_prev_node_usage', 'get_prev_cluster_usage'],
//                             ...['add_node', 'add_replica', 'remove_node', 'remove_replica']
//                         ]
//                     }
//                     webSocket.send(JSON.stringify(msgToolsAvailable))
//                     break
//                 case EPinocchioCommand.PROVIDERSGET:
//                     this.executeProvidersGet()
//                     break
//                 case EPinocchioCommand.CONFIGGET:
//                     this.executeConfigGet()
//                     break
//                 case EPinocchioCommand.CONFIGSET:
//                     let config:IPinocchioConfig = pinocchioMessage.data
//                     this.pinocchioConfig = config
//                     await this.backChannelObject.writeStorage!('config', false, config)
//                     this.executeConfigGet()
//                     this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Config updated')
//                     break
//                 case EPinocchioCommand.PROVIDERSSET:
//                     let provs:IConfigProvider[] = pinocchioMessage.data
//                     this.providers = provs
//                     await this.backChannelObject.writeStorage!('providers', true, provs)
//                     await loadModels(this.providers)
//                     this.executeProvidersGet()
//                     this.sendSignalMessage(webSocket, EInstanceMessageAction.COMMAND, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instance.instanceId, 'Providers updated')
//                     break
//             }
//             return true
//         }
//     }

//     addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
//         logInfo(ELogComponent.CHANNEL, `Start ${this.getChannelData().id} instance ${instanceConfig.instance} ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view})`)

//         let socket = this.connections.find(s => s.webSocket === webSocket)
//         if (!socket) {
//             let len = this.connections.push( {webSocket:webSocket, lastRefresh: Date.now(), instances:[]} )
//             socket = this.connections[len-1]
//         }

//         let instances = socket.instances
//         let instance = instances.find(i => i.instanceId === instanceConfig.instance)
//         if (!instance) {
//             instance = {
//                 accessKey: accessKeyDeserialize(instanceConfig.accessKey),
//                 instanceId: instanceConfig.instance
//             }
//             instances.push(instance)
//         }
//         let analysis:IAnalysis = {
//             findings: [],
//             timestamp: Date.now(),
//             text: 'Pinocchio session accepted'
//         }
//         this.sendAnalysis(webSocket, instance, analysis)
//         this.sendBatch(webSocket, instance)
//         return true
//     }

//     deleteObject = async (webSocket:WebSocket, instanceConfig:IInstanceConfig, podNamespace:string, podName:string, containerName:string) : Promise<boolean> => {
//         return true
//     }
    
//     pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
//     }

//     modifyInstance = (webSocket:WebSocket, instanceConfig: IInstanceConfig): void => {
//     }

//     stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
//         let instance = this.getInstance(webSocket, instanceConfig.instance)
//         if (instance) {
//             this.removeInstance(webSocket, instanceConfig.instance)
//             this.sendSignalMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Pinocchio instance stopped')
//         }
//         else {
//             this.sendSignalMessage(webSocket,EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Pinocchio instance not found`)
//         }
//     }

//     removeInstance = (webSocket: WebSocket, instanceId: string): void => {
//         let socket = this.connections.find(s => s.webSocket === webSocket)
//         if (socket) {
//             let instances = socket.instances
//             if (instances) {
//                 let pos = instances.findIndex(t => t.instanceId === instanceId)
//                 if (pos>=0) {
//                     instances.splice(pos,1)
//                 }
//                 else {
//                     logWarning(ELogComponent.CHANNEL, `Instance ${instanceId} not found, cannot delete`)
//                 }
//             }
//             else {
//                 logWarning(ELogComponent.CHANNEL, 'There are no Pinocchio Instances on websocket')
//             }
//         }
//         else {
//             logWarning(ELogComponent.CHANNEL, 'WebSocket not found on Pinocchio')
//         }
//     }

//     containsConnection = (webSocket:WebSocket): boolean => {
//         return Boolean (this.connections.find(s => s.webSocket === webSocket))
//     }

//     removeConnection = (webSocket: WebSocket): void => {
//         let socket = this.connections.find(s => s.webSocket === webSocket)
//         if (socket) {
//             for (let instance of socket.instances) {
//                 this.removeInstance (webSocket, instance.instanceId)
//             }
//             let pos = this.connections.findIndex(s => s.webSocket === webSocket)
//             this.connections.splice(pos,1)
//         }
//         else {
//             logInfo(ELogComponent.CHANNEL, 'WebSocket not found on Pinocchio for remove')
//         }
//     }

//     refreshConnection = (webSocket: WebSocket): boolean => {
//         let socket = this.connections.find(s => s.webSocket === webSocket)
//         if (socket) {
//             socket.lastRefresh = Date.now()
//             return true
//         }
//         else {
//             logInfo(ELogComponent.CHANNEL, 'WebSocket not found')
//             return false
//         }
//     }

//     updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
//         for (let entry of this.connections) {
//             let exists = entry.instances.find(i => i.instanceId === instanceId)
//             if (exists) {
//                 entry.webSocket = newWebSocket
//                 return true
//             }
//         }
//         return false
//     }

//     // *************************************************************************************
//     // PRIVATE
//     // *************************************************************************************

//     executeConfigGet = async () => {
//         for (let connection of this.connections) {
//             for (let instance of connection.instances) {
//                 let msgConfig:IPinocchioMessageResponse = {
//                     msgtype: 'pinocchiomessageresponse',
//                     channel: 'pinocchio',
//                     action: EInstanceMessageAction.COMMAND,
//                     flow: EInstanceMessageFlow.RESPONSE,
//                     type: EInstanceMessageType.DATA,
//                     instance: instance.instanceId,
//                     config: this.pinocchioConfig
//                 }
//                 connection.webSocket.send(JSON.stringify(msgConfig))
//             }
//         }
//     }

//     executeProvidersGet = async () => {
//         for (let connection of this.connections) {
//             for (let instance of connection.instances) {
//                 let msgProviders:IPinocchioMessageResponse = {
//                     msgtype: 'pinocchiomessageresponse',
//                     channel: 'pinocchio',
//                     action: EInstanceMessageAction.COMMAND,
//                     flow: EInstanceMessageFlow.RESPONSE,
//                     type: EInstanceMessageType.DATA,
//                     instance: instance.instanceId,
//                     providers: this.providers
//                 }
//                 connection.webSocket.send(JSON.stringify(msgProviders))
//             }
//         }
//     }
    
//     private broadcastAnalysis = (an:IAnalysis) => {
//         for (let connection of this.connections) {
//             for (let instance of connection.instances) {
//                 this.sendAnalysis(connection.webSocket, instance, an)
//             }
//         }
//     }

//     private broadcastError = (text:string) => {
//         for (let connection of this.connections) {
//             for (let instance of connection.instances) {
//                 this.sendSignalError(connection.webSocket, instance, text)
//             }
//         }
//     }

//     private sendAnalysis = (ws:WebSocket, instance:IInstance, analysis:IAnalysis) => {
//         let msg:IPinocchioMessageResponse = {
//             msgtype: 'pinocchiomessageresponse',
//             channel: 'pinocchio',
//             action: EInstanceMessageAction.NONE,
//             flow: EInstanceMessageFlow.UNSOLICITED,
//             type: EInstanceMessageType.DATA,
//             instance: instance.instanceId,
//             analysis
//         }
//         ws.send(JSON.stringify(msg))
//     }

//     private sendBatch = (ws:WebSocket, instance:IInstance) => {
//         let msg:IPinocchioMessageResponse = {
//             msgtype: 'pinocchiomessageresponse',
//             channel: 'pinocchio',
//             action: EInstanceMessageAction.NONE,
//             flow: EInstanceMessageFlow.UNSOLICITED,
//             type: EInstanceMessageType.DATA,
//             instance: instance.instanceId,
//             analysis:{
//                 findings: [],
//                 timestamp: 0
//             }
//         }
//         for (let an of this.analysis) {
//             msg.analysis = an
//             ws.send(JSON.stringify(msg))
//         }
//     }

//     private sendSignalMessage = (ws:WebSocket, action:EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId:string, text:string): void => {
//         var resp:ISignalMessage = {
//             action,
//             flow,
//             channel: 'pinocchio',
//             instance: instanceId,
//             type: EInstanceMessageType.SIGNAL,
//             text,
//             level
//         }
//         ws.send(JSON.stringify(resp))
//     }

//     private sendSignalError = (ws:WebSocket, instance:IInstance, text:string): void => {
//         var errorMessage:ISignalMessage = {
//             action: EInstanceMessageAction.NONE,
//             flow: EInstanceMessageFlow.RESPONSE,
//             channel: 'pinocchio',
//             instance: instance.instanceId,
//             type: EInstanceMessageType.SIGNAL,
//             level: ESignalMessageLevel.ERROR,
//             text
//         }
//         ws.send(JSON.stringify(errorMessage))
//     }

//     getInstance(webSocket:WebSocket, instanceId: string) : IInstance | undefined{
//         let socket = this.connections.find(entry => entry.webSocket === webSocket)
//         if (socket) {
//             let instances = socket.instances
//             if (instances) {
//                 let instanceIndex = instances.findIndex(t => t.instanceId === instanceId)
//                 if (instanceIndex>=0) return instances[instanceIndex]
//                 logInfo(ELogComponent.CHANNEL, 'Instance not found')
//             }
//             else {
//                 logInfo(ELogComponent.CHANNEL, 'There are no Instances on websocket')
//             }
//         }
//         else {
//             logInfo(ELogComponent.CHANNEL, 'WebSocket not found')
//         }
//         return undefined
//     }

// }

// export { PinocchioChannel }