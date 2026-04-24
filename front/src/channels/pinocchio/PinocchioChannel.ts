import { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from '../IChannel'
import { EPinocchioCommand, IConfigProvider, IPinocchioConfig, IPinocchioMessage, IPinocchioMessageResponse, PinocchioConfig, PinocchioInstanceConfig } from './PinocchioConfig'
import { PinocchioSetup, PinocchioIcon } from './PinocchioSetup'
import { EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, EInstanceConfigScope, IOpsMessageResponse, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { PinocchioData, IPinocchioData } from './PinocchioData'
import { PinocchioTabContent } from './PinocchioTabContent'
import { ENotifyLevel } from '../../tools/Global'

export class PinocchioChannel implements IChannel {
    channelId = 'pinocchio'
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = PinocchioSetup
    TabContent: FC<IContentProps> = PinocchioTabContent
    requirements:IChannelRequirements = {
        accessString: true,
        clusterUrl: false,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: false,
        setup: false,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true,
    }
    
    getScope() { return EInstanceConfigScope.NONE}
    getChannelIcon(): JSX.Element { return PinocchioIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility:boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let msg:IPinocchioMessageResponse = JSON.parse(wsEvent.data)

        let pinocchioData:IPinocchioData = channelObject.data
        switch (msg.type) {
            case EInstanceMessageType.DATA:
                if (msg.analysis) pinocchioData.analysis.push(msg.analysis)
                else if (msg.config) pinocchioData.config = msg.config as IPinocchioConfig
                else if (msg.providers) pinocchioData.providers = msg.providers as IConfigProvider[]
                else if (msg.providersAvailable) pinocchioData.providersAvailable = msg.providersAvailable as string[]
                return {
                    action: EChannelRefreshAction.REFRESH
                }
            case EInstanceMessageType.SIGNAL:
                let signalMessage = JSON.parse(wsEvent.data) as ISignalMessage
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = signalMessage.instance

                    let msgProvidersAvailable:IPinocchioMessage = {
                        channel: 'pinocchio',
                        msgtype: 'pinocchiomessage',
                        action: EInstanceMessageAction.COMMAND,
                        flow: EInstanceMessageFlow.REQUEST,
                        type: EInstanceMessageType.DATA,
                        command: EPinocchioCommand.PROVIDERSAVAILABLE,
                        accessKey: channelObject.accessString!,
                        instance: signalMessage.instance,
                        id: '1'
                    }
                    channelObject.webSocket?.send(JSON.stringify(msgProvidersAvailable))

                    let msgProviders:IPinocchioMessage = {
                        channel: 'pinocchio',
                        msgtype: 'pinocchiomessage',
                        action: EInstanceMessageAction.COMMAND,
                        flow: EInstanceMessageFlow.REQUEST,
                        type: EInstanceMessageType.DATA,
                        command: EPinocchioCommand.PROVIDERSGET,
                        accessKey: channelObject.accessString!,
                        instance: signalMessage.instance,
                        id: '1'
                    }
                    channelObject.webSocket?.send(JSON.stringify(msgProviders))

                    let msgConfig:IPinocchioMessage = {
                        channel: 'pinocchio',
                        msgtype: 'pinocchiomessage',
                        action: EInstanceMessageAction.COMMAND,
                        flow: EInstanceMessageFlow.REQUEST,
                        type: EInstanceMessageType.DATA,
                        command: EPinocchioCommand.CONFIGGET,
                        accessKey: channelObject.accessString!,
                        instance: signalMessage.instance,
                        id: '1'
                    }
                    channelObject.webSocket?.send(JSON.stringify(msgConfig))
                }
                else {
                    channelObject.notify?.(this.channelId, signalMessage.level as any as ENotifyLevel, signalMessage.text || signalMessage.data)
                }
                return {
                    action: EChannelRefreshAction.REFRESH
                }
            default:
                console.log(`Invalid message type ${msg.type}`)
                return {
                    action: EChannelRefreshAction.NONE
                }
        }
    }

    async initChannel(channelObject:IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new PinocchioInstanceConfig()
        channelObject.config = new PinocchioConfig()
        channelObject.data = new PinocchioData()
        let pinocchioObject:IPinocchioData= channelObject.data
        pinocchioObject.analysis = []
        return false
    }

    startChannel(channelObject:IChannelObject): boolean {
        let pinocchioObject:IPinocchioData = channelObject.data
        pinocchioObject.analysis.push({
            findings: [],
            timestamp: Date.now(),
            text: 'Local start pinocchio channel'
        })
        pinocchioObject.paused = false
        pinocchioObject.started = true
        return true
    }

    pauseChannel(channelObject:IChannelObject): boolean {
        let pinocchioObject:IPinocchioData = channelObject.data
        pinocchioObject.paused = true
        return true
    }

    continueChannel(channelObject:IChannelObject): boolean {
        let pinocchioObject:IPinocchioData = channelObject.data
        pinocchioObject.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        let pinocchioObject:IPinocchioData = channelObject.data
        pinocchioObject.paused = false
        pinocchioObject.started = false
        return true
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        return false
    }
    
    socketReconnect(channelObject: IChannelObject): boolean {
        return false
    }

}    
