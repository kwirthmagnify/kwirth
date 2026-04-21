import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IBackChannelObject, IBackChannelRequirements, IChannel } from '../IChannel';
import { Request, Response } from 'express'
import { generateText, Output } from 'ai'
import { createGoogleGenerativeAI, GoogleLanguageModelOptions } from '@ai-sdk/google'
import { z } from 'zod'
import { V1Pod } from '@kubernetes/client-node';
import { EPinocchioCommand, IAnalysis, IConfigLlm, IConfigProvider, IPinocchioConfig, IPinocchioMessage, IPinocchioMessageResponse } from './PinocchioConfig';

interface IInstance {
    instanceId: string
    accessKey: AccessKey
}

interface IProviderEvent {
    type: 'ADDED'|'MODIFIED'|'DELETED'
    obj:any
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
    providers: IConfigProvider[] = [
        {
            name: 'google',
            models: ['gemini-2.5-flash','gemini-2.5-pro','gemini-2.0-flash','gemini-2.0-flash-001','gemini-2.0-flash-lite-001','gemini-2.0-flash-lite','gemini-2.5-flash-preview-tts','gemini-2.5-ro-preview-tts','gemini-flash-latest','gemini-flash-lite-latest','gemini-pro-latest','gemini-2.5-flash-lite','gemini-2.5-flash-image','gemini-3-pro-preview','gemini-3-flash-review','gemini-3.1-pro-preview','gemini-3.1-pro-preview-customtools','gemini-3.1-flash-lite-preview','gemini-3-pro-image-preview','gemini-3.1-flash-image-preview','gemini-3.1-flash-tts-preview','gemini-robotics-er-1.5-preview','gemini-robotics-er-1.6-preview','gemini-2.5-computer-use-preview-10-2025','gemini-2.5-flash-native-audio-latest','gemini-2.5-flash-native-audio-preview-09-2025']
        },
        {
            name: 'kwirth',
            models: ['alberto-1-flash-gordon-lite', 'alberto-1.5-python-forever']
        },
        {
            name: 'openai',
            models: ['o1', 'o1-mini', 'o3-mini', 'gtp-4o', 'gtp-4o-mini', 'gtp-4', 'gtp-4-turbo', 'gtp-3.5-turbo']
        }
    ]
    pinocchioConfig: IPinocchioConfig = {
        kinds: [],
        llms: []
    }

    constructor (clusterInfo:ClusterInfo, backChannelObject:IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    startChannel = async () =>  {
        this.clusterInfo.addSubscriber('events', this, {
            kinds: ['Pod'],  // +++ populate this according to channel config
            crdInstances: [],
            syncCrdInstances: false
        
        })
        // this init code for providers should be moved away
        // +++ this data should be added to 'providers'
        const respGoogle = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`)
        const dataGoogle = await respGoogle.json()
        
        const respOpenAi = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY}})
        const dataOpenAi = await respOpenAi.json()

        const respMistral = await fetch('https://api.mistral.com/v1/models', { headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY}})
        const dataMistral = await respMistral.json()

        let config = await this.backChannelObject.readStorage!('config') as IPinocchioConfig
        if (config) this.pinocchioConfig = config
    }

    getChannelData = (): BackChannelData => {
        return {
            id: 'pinocchio',
            routable: false,
            pauseable: true,
            modifyable: false,
            reconnectable: true,
            metrics: false,
            providers: ['events'],
            sources: [ EClusterType.KUBERNETES ],
            endpoints: [],
            websocket: false,
            cluster: true
        }
    }

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'none', 'cluster'].indexOf(scope)
    }

    buildModel = (obj:any) => {
        let kindDefinition = this.pinocchioConfig.kinds.find(k => k.kind === obj.kind)
        if (kindDefinition) {
            let prompt = JSON.stringify(obj)
            switch(kindDefinition.promptType) {
                case 'artifact':
                    break
                case 'prepend':
                    prompt = kindDefinition.prompt + prompt
                    break
                case 'append':
                    prompt = prompt + kindDefinition.prompt
                    break
                case 'fixed':
                    prompt = kindDefinition.prompt
                    break
            }
            let system = kindDefinition.system
            let llm = this.pinocchioConfig.llms.find(l => l.id === kindDefinition.llm)
            if (llm) {
                switch(llm.provider) {
                    case 'google':
                        const google = createGoogleGenerativeAI({
                            apiKey: llm.key
                        })
                        return {
                            model: google(llm.model),
                            providerOptions: {
                                google: {
                                    structuredOutputs: true,
                                } satisfies GoogleLanguageModelOptions
                            },
                            prompt,
                            system
                        }
                    case 'kwirth':
                        break
                    case 'openai':
                        break
                    default:
                        this.broadcastError('Cannot find LLM provider '+llm.provider)
                        break
                }
            }
            else {
                this.broadcastError('Cannot find LLM with id '+kindDefinition.llm)
            }

        }
        else {
            this.broadcastError('Cannot find definition for kind '+obj.kind)
        }
        return undefined
    }

    async processProviderEvent(providerId:string, event:IProviderEvent) : Promise<void> {
        switch(providerId) {
            // case 'validating':
            //     console.log('Received Validating event')
            //     break
            // case 'tick':
            //     console.log('TICK')
            //     break
            case 'events':
                if (event.type==='ADDED') {
                    try {
                        console.log('Pinocchio: added pod', event.obj.metadata?.name)
                        try {
                            let {model, providerOptions, system, prompt} = this.buildModel(event.obj) || {}
                            if (!model) return

                            console.log(model)
                            console.log(providerOptions)
                            console.log(system)
                            console.log(prompt)
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
                                        ),
                                        globalRisk: z.number()
                                    }),
                                }),
                                //'You are a kubernetes admin expert, and you are in charge of deploying only workload that are secure. Generate a security analysis for this pod following the schema, y dámelo en español',
                                system: system||'', 
                                prompt: prompt||'',
                            })

                            let analysis:IAnalysis = {
                                text: `Starting pod '${event.obj.metadata.name}' in namespace '${event.obj.metadata.namespace}' (IN:${usage.inputTokens}, OUT:${usage.outputTokens})`,
                                findings: output.findings,
                                globalRisk: output.globalRisk,
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
                        catch (err) {
                            let message = `Pinocchio analysis ended in error when analyzing '${event.obj.metadata.name}' in namespace '${event.obj.metadata.namespace}'`
                            console.log(message, err)
                            let an:IAnalysis = {
                                findings: [{ description: message, level: 'critical'}],
                                timestamp: Date.now()
                            }
                            this.broadcastAnalysis(an)
                        }
                    }
                    catch (err) {
                        console.error(err)
                    }
                }
                break
            default:
                console.log(`Ignored provider event from ${providerId} to channel ${this.getChannelData().id}`)
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
                console.log(`Instance ${instanceMessage.instance} not found`)
                return false
            }
            let pinocchioMessage = instanceMessage as IPinocchioMessage
            switch(pinocchioMessage.command) {
                case EPinocchioCommand.PROVIDERS:
                    let msgProviders:IPinocchioMessageResponse = {
                        msgtype: 'pinocchiomessageresponse',
                        channel: 'pinocchio',
                        action: EInstanceMessageAction.COMMAND,
                        flow: EInstanceMessageFlow.RESPONSE,
                        type: EInstanceMessageType.DATA,
                        instance: instance.instanceId,
                        providers: this.providers
                    }
                    webSocket.send(JSON.stringify(msgProviders))
                    break
                case EPinocchioCommand.CONFIGGET:
                    let msgConfig:IPinocchioMessageResponse = {
                        msgtype: 'pinocchiomessageresponse',
                        channel: 'pinocchio',
                        action: EInstanceMessageAction.COMMAND,
                        flow: EInstanceMessageFlow.RESPONSE,
                        type: EInstanceMessageType.DATA,
                        instance: instance.instanceId,
                        config:this.pinocchioConfig
                    }
                    webSocket.send(JSON.stringify(msgConfig))
                    break
                case EPinocchioCommand.CONFIGSET:
                    let config:IPinocchioConfig = pinocchioMessage.data
                    this.pinocchioConfig = config
                    await this.backChannelObject.writeStorage!('config', config)
                    break
                case EPinocchioCommand.STREAM:
                    break
                case EPinocchioCommand.INITIAL:
                    break

            }
            return true
        }
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        console.log(`Start ${this.getChannelData().id} instance ${instanceConfig.instance} ${podNamespace}/${podName}/${containerName} (view: ${instanceConfig.view})`)

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
                if (pos>=0) instances.splice(pos,1)
                else {
                    console.log(`Instance ${instanceId} not found, cannot delete`)
                }
            }
            else {
                console.log('There are no Pinocchio Instances on websocket')
            }
        }
        else {
            console.log('WebSocket not found on Pinocchio')
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
            console.log('WebSocket not found on Pinocchio for remove')
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        let socket = this.connections.find(s => s.webSocket === webSocket)
        if (socket) {
            socket.lastRefresh = Date.now()
            return true
        }
        else {
            console.log('WebSocket not found')
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
                console.log('Instance not found')
            }
            else {
                console.log('There are no Instances on websocket')
            }
        }
        else {
            console.log('WebSocket not found')
        }
        return undefined
    }

}

export { PinocchioChannel }