import { IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, EClusterType, BackChannelData, EInstanceMessageType, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IBackChannelRequirements, IChannel } from '../IChannel';
import { Request, Response } from 'express'
import { generateText, Output } from 'ai'
import { google, GoogleLanguageModelOptions } from '@ai-sdk/google'
import { z } from 'zod'
import { V1Pod } from '@kubernetes/client-node';

enum EPinocchioCommand {
    STREAM = 'stream',
    INITIAL = 'initial',
}

interface ICommandConfigEvent {
    kind: string
    system: string
    prompt: string
    action: ('inform'|'cancel'|'repair')[]
}

interface ICommandConfigModel {
    provider: string
    model: string
}

interface IPinocchioMessage extends IInstanceMessage {
    msgtype: 'pinocchiomessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: EPinocchioCommand
    data: any
}

interface IInstance {
    instanceId: string
    accessKey: AccessKey
}

interface IPinocchioMessageResponse extends IInstanceMessage {
    msgtype: 'pinocchiomessageresponse'
    analysis: IAnalysis
}

interface IAnalysis {
    findings: {
        description: string
        level: 'low'|'medium'|'high'|'critical'
    }[],
    globalRisk?: number
    timestamp: number
    usage?: {
        input?:number,
        output?:number
    }
    pod?: V1Pod
    text?:string
}

class PinocchioChannel implements IChannel {
    readonly channelId = 'pinocchio'
    readonly requirements: IBackChannelRequirements = {
        storage: true
    }
    clusterInfo : ClusterInfo
    connections: {
        webSocket:WebSocket,
        lastRefresh: number,
        instances: IInstance[] 
    }[] = []
    analysis: IAnalysis[] = []

    constructor (clusterInfo:ClusterInfo) {
        this.clusterInfo = clusterInfo
    }

    startChannel = async () =>  {
        this.clusterInfo.addSubscriber('events', this, {
            kinds: ['Pod'],
            crdInstances: [],
            syncCrdInstances: false
        })
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GOOGLE_GENERATIVE_AI_API_KEY}`)
        const data = await response.json()
        let an:IAnalysis = {
            text: 'Pinocchio channel available Gemini models',
            findings: data.models.map( (m:any) => {
                return { 
                    description: m.name.startsWith('models/')? m.name.substring(7): m.name,
                    level: 'low'
                }
            }),
            timestamp: Date.now()
        }
        console.log(an)
        this.analysis.push(an)
    }

    getChannelData = (): BackChannelData => {
        return {
            id: 'pinocchio',
            routable: false,
            pauseable: true,
            modifyable: false,
            reconnectable: true,
            metrics: false,
            providers: ['tick', 'events'],
            sources: [ EClusterType.KUBERNETES, EClusterType.DOCKER ],
            endpoints: [],
            websocket: false,
            cluster: true
        }
    }

    getChannelScopeLevel = (scope: string): number => {
        return ['', 'none', 'cluster'].indexOf(scope)
    }

    async processProviderEvent(providerId:string, event:any) : Promise<void> {
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
                            const { output, usage } = await generateText({
                                model: google('gemini-3.1-flash-lite-preview'),
                                providerOptions: {
                                    google: {
                                        structuredOutputs: true,
                                    } satisfies GoogleLanguageModelOptions,
                                },
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
                                system: 'You are a kubernetes admin expert, and you are in charge of deploying only workload that are secure. Generate a security analysis for this pod following the schema, y dámelo en español',
                                prompt: JSON.stringify(event.obj),
                            })
                            let an:IAnalysis = {
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
                            this.analysis.push(an)
                            this.broadcast(an)
                        }
                        catch (err) {
                            let message = `Pinocchio analysis ended in error when analyzing '${event.obj.metadata.name}' in namespace '${event.obj.metadata.namespace}'`
                            console.log(message, err)
                            let an:IAnalysis = {
                                findings: [{ description: message, level: 'critical'}],
                                timestamp: Date.now()
                            }
                            this.broadcast(an)
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
        this.sendData(webSocket, instance, analysis)
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

    private broadcast = (an:IAnalysis) => {
        for (let connection of this.connections) {
            for (let instance of connection.instances) {
                this.sendData(connection.webSocket, instance, an)
            }
        }
    }

    private sendData = (ws:WebSocket, instance:IInstance, analysis:IAnalysis) => {
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