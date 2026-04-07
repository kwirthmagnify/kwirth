import { FC } from "react"
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from "../IChannel"
import { PinocchioInstanceConfig, PinocchioConfig, IPinocchioConfig } from "./PinocchioConfig"
import { PinocchioSetup, PinocchioIcon } from './PinocchioSetup'
import { IInstanceMessage, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, EInstanceConfigScope } from "@kwirthmagnify/kwirth-common"
import { PinocchioData, IPinocchioData, IPinocchioMessage } from "./PinocchioData"
import { PinocchioTabContent } from "./PinocchioTabContent"

export class PinocchioChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = PinocchioSetup
    TabContent: FC<IContentProps> = PinocchioTabContent
    channelId = 'pinocchio'
    requirements:IChannelRequirements = {
        accessString: false,
        clusterUrl: false,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: true,
        setup: true,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: false,
    }
    
    getScope() { return EInstanceConfigScope.NONE}
    getChannelIcon(): JSX.Element { return PinocchioIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility:boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let msg:IPinocchioMessage = JSON.parse(wsEvent.data)

        let pinocchioData:IPinocchioData = channelObject.data
        let pinocchioConfig:IPinocchioConfig = channelObject.config
        switch (msg.type) {
            case EInstanceMessageType.DATA:
                pinocchioData.lines.push(msg.text)
                return {
                    action: EChannelRefreshAction.REFRESH
                }
            case EInstanceMessageType.SIGNAL:
                let instanceMessage:IInstanceMessage = JSON.parse(wsEvent.data)
                if (instanceMessage.flow === EInstanceMessageFlow.RESPONSE && instanceMessage.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = instanceMessage.instance
                }
                pinocchioData.lines.push('*** '+msg.text+' ***')
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
        pinocchioObject.lines = []
        return false
    }

    startChannel(channelObject:IChannelObject): boolean {
        let pinocchioObject:IPinocchioData = channelObject.data
        pinocchioObject.lines = [ 'Start']
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
        pinocchioObject.lines.push('==========================================================================')
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
