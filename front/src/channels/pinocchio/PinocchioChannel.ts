import { FC } from "react"
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from "../IChannel"
import { PinocchioConfig, PinocchioInstanceConfig } from "./PinocchioConfig"
import { PinocchioSetup, PinocchioIcon } from './PinocchioSetup'
import { IInstanceMessage, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, EInstanceConfigScope, IOpsMessageResponse, ISignalMessage } from "@kwirthmagnify/kwirth-common"
import { PinocchioData, IPinocchioData } from "./PinocchioData"
import { PinocchioTabContent } from "./PinocchioTabContent"
import { ENotifyLevel } from "../../tools/Global"

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
        input:number,
        output:number
    }
    pod?: any
    text?: string
}

export class PinocchioChannel implements IChannel {
    channelId = 'pinocchio'
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = PinocchioSetup
    TabContent: FC<IContentProps> = PinocchioTabContent
    requirements:IChannelRequirements = {
        accessString: false,
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
        webSocket: false,
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
                return {
                    action: EChannelRefreshAction.REFRESH
                }
            case EInstanceMessageType.SIGNAL:
                let signalMessage = JSON.parse(wsEvent.data) as ISignalMessage
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = signalMessage.instance
                }
                else {
                    channelObject.notify?.(this.channelId, ENotifyLevel.ERROR, signalMessage.text || signalMessage.data)
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
