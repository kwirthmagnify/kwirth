import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IBackChannelObject, IBackChannelRequirements, IChannel } from '../IChannel';
import { Request, Response } from 'express'
import { generateText, Output } from 'ai'
import { createGoogleGenerativeAI, GoogleLanguageModelOptions } from '@ai-sdk/google'
import { createMistral, MistralLanguageModelOptions } from '@ai-sdk/mistral'
import { z } from 'zod'
import { EPinocchioCommand, IAnalysis, IConfigKind, IConfigProvider, IPinocchioConfig, IPinocchioMessage, IPinocchioMessageResponse, kindsAvailable } from './PinocchioConfig'
import { loadModels } from './Tools';
import { createOpenAI, OpenAILanguageModelChatOptions } from '@ai-sdk/openai'
import { createGroq, GroqLanguageModelOptions } from '@ai-sdk/groq'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { ELogComponent, logError, logInfo, logTrace, logWarning } from '../../tools/Logging';
import { LoginApi } from '../../api/LoginApi';
const nunjucks = require('nunjucks')

// basic nunjucks config
nunjucks.configure({ autoescape: true })

interface IInstance {
    instanceId: string
    accessKey: AccessKey
}

interface IProviderEvent {
    type: 'ADDED'|'MODIFIED'|'DELETED'
    obj:any
}

interface IModelInvocation {
    llmProviderId: string
    llmModelId: string
    model: any //LanguageModelV3
    providerOptions: any //GoogleLanguageModelOptions|MistralLanguageModelOptions
    system: string
    prompt: string
}
class PinocchioChannel implements IChannel {
    readonly channelId = 'pinocchio'
    readonly requirements: IBackChannelRequirements = {
        storage: true
    }
    clusterInfo : ClusterInfo
    backChannelObject : IBackChannelObject
    connections: {
        webSocket:WebSocket,
        lastRefresh: number,
        instances: IInstance[] 
    }[] = []
    analysis: IAnalysis[] = []
    providers: IConfigProvider[] = []
    pinocchioConfig: IPinocchioConfig = {
        kinds: [],
        llms: []
    }
    startTime: number

    constructor (clusterInfo:ClusterInfo, backChannelObject:IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
        this.startTime = Date.now()
    }

    startChannel = async () =>  {
        this.clusterInfo.addSubscriber('business', this, {
            spaces: ['private', 'public'],
            types: ['income']
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
            providers: ['events', 'business'],
            sources: [ EClusterType.KUBERNETES ],
            endpoints: [],
            websocket: false,
            cluster: true
        }
    }

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'none', 'cluster'].indexOf(scope)
    }

    buildModelInvocation = (kindDefinition:IConfigKind, obj:any) : IModelInvocation|undefined => {
        if (kindDefinition) {
            let prompt
            switch(kindDefinition.promptType) {
                case 'artifact':
                    prompt = JSON.stringify(obj)
                    break
                case 'jinja':
                    prompt = nunjucks.renderString(kindDefinition.prompt, obj)
                    break
                case 'prepend':
                    prompt = kindDefinition.prompt + JSON.stringify(obj)
                    break
                case 'append':
                    prompt = JSON.stringify(obj) + kindDefinition.prompt
                    break
                case 'fixed':
                    prompt = kindDefinition.prompt
                    break
            }
            let system = kindDefinition.system
            let llm = this.pinocchioConfig.llms.find(l => l.id === kindDefinition.llm)
            if (llm) {
                let key = llm.useProviderKey? this.providers.find(p => p.name === llm.provider)?.key : llm.key
                if (key) {
                    switch(llm.provider) {
                        case 'deepseek':
                            const deepseek = createDeepSeek({ apiKey: key })
                            return {
                                llmProviderId: llm.provider,
                                llmModelId: llm.model,
                                model: deepseek(llm.model),
                                providerOptions: {
                                    openai: {
                                        // structuredOutputs: true  unsupported
                                    } satisfies OpenAILanguageModelChatOptions
                                },
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
                                prompt,
                                system
                            }
                        default:
                            this.broadcastError(`Cannot find LLM provider '${llm.provider}'`)
                            break
                    }
                }
                else {
                    this.broadcastError(`Cannot get API key for LLM '${kindDefinition.llm}'`)
                }
            }
            else {
                this.broadcastError(`Cannot find LLM with id '${kindDefinition.llm}'`)
            }

        }
        return undefined
    }

    async processProviderEvent(providerId:string, event:IProviderEvent) : Promise<void> {
        switch(providerId) {
            case 'business':
                logInfo(ELogComponent.PROVIDER, event)
                this.broadcastError('Received business event '+JSON.stringify(event))
                logTrace(ELogComponent.CHANNEL, 'TRACE')
                // +++ send data to LLM
                break
            case 'events':
                if (event.type==='ADDED') {
                    try {
                        logInfo(ELogComponent.PROVIDER, `Pinocchio: added ${event.obj.kind} ${event.obj.metadata?.name}`)
                        
                        for (let kind of this.pinocchioConfig.kinds.filter(k => k.enabled && k.kind===event.obj.kind)) {
                            if (event.obj?.metadata?.creationTimestamp) {
                                let creationTs = Date.parse(event.obj?.metadata?.creationTimestamp)
                                if (creationTs<this.startTime) {
                                    logWarning(ELogComponent.CHANNEL, `Bypass object analysis, creation timestamp is previous for object ${event.obj?.metadata?.name} and kind ${kind.kind} for LLM ${kind.llm}`)
                                    continue
                                }
                            }
                            try {
                                let {llmModelId, llmProviderId, model, providerOptions, system, prompt} = this.buildModelInvocation(kind, event.obj) || {}
                                if (!model) return

                                const { output, usage } = await generateText({
                                    model,
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
                                    text: `${event.type} ${event.obj.kind} '${event.obj.metadata.name}' in namespace '${event.obj.metadata.namespace}' [LLM:${llmProviderId}/${llmModelId}, IN:${usage.inputTokens}, OUT:${usage.outputTokens}]`,
                                    findings: output.findings,
                                    timestamp: Date.now(),
                                    usage: {
                                        input: usage.inputTokens,
                                        output: usage.outputTokens
                                    },
                                    pod: event.obj
                                }
                                this.analysis.push(analysis)
                                this.broadcastAnalysis(analysis)
                            }
                            catch (err:any) {
                                let message = `Pinocchio analysis ended in error when analyzing '${event.obj.metadata.name}' in namespace '${event.obj.metadata.namespace}' [Kind:${event.obj.kind}]`
                                logInfo(ELogComponent.PROVIDER, message)
                                logInfo(ELogComponent.PROVIDER, err)
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
                logError(ELogComponent.PROVIDER, `Ignored provider event from ${providerId} to channel ${this.getChannelData().id}`)
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
    
    private broadcastAnalysis = (an:IAnalysis) => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                this.sendAnalysis(connection.webSocket, instance, an)
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