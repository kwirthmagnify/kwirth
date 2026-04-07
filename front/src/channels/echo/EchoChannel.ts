import { FC } from "react";
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from "../IChannel";
import { EchoInstanceConfig, EchoConfig, IEchoConfig } from "./EchoConfig";
import { EchoSetup, EchoIcon } from './EchoSetup';
import { IEchoMessage, IInstanceMessage, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, EInstanceConfigScope } from "@kwirthmagnify/kwirth-common";
import { EchoData, IEchoData } from "./EchoData";
import { EchoTabContent } from "./EchoTabContent";

export class EchoChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = EchoSetup
    TabContent: FC<IContentProps> = EchoTabContent
    channelId = 'echo'
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
    getChannelIcon(): JSX.Element { return EchoIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility:boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let msg:IEchoMessage = JSON.parse(wsEvent.data)

        let echoData:IEchoData = channelObject.data
        let echoConfig:IEchoConfig = channelObject.config
        switch (msg.type) {
            case EInstanceMessageType.DATA:
                echoData.lines.push(msg.text)
                while (echoData.lines.length > echoConfig.maxLines) echoData.lines.shift()
                return {
                    action: EChannelRefreshAction.REFRESH
                }
            case EInstanceMessageType.SIGNAL:
                let instanceMessage:IInstanceMessage = JSON.parse(wsEvent.data)
                if (instanceMessage.flow === EInstanceMessageFlow.RESPONSE && instanceMessage.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = instanceMessage.instance
                }
                echoData.lines.push('*** '+msg.text+' ***')
                while (echoData.lines.length> echoConfig.maxLines) echoData.lines.shift()
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
        channelObject.instanceConfig = new EchoInstanceConfig()
        channelObject.config = new EchoConfig()
        channelObject.data = new EchoData()
        let echoObject:IEchoData= channelObject.data
        echoObject.lines = []
        return false
    }

    startChannel(channelObject:IChannelObject): boolean {
        let echoObject:IEchoData = channelObject.data
        echoObject.lines = [ 'Start']
        echoObject.paused = false
        echoObject.started = true
        return true
    }

    pauseChannel(channelObject:IChannelObject): boolean {
        let echoObject:IEchoData = channelObject.data
        echoObject.paused = true
        return true
    }

    continueChannel(channelObject:IChannelObject): boolean {
        let echoObject:IEchoData = channelObject.data
        echoObject.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        let echoObject:IEchoData = channelObject.data
        echoObject.lines.push('==========================================================================')
        echoObject.paused = false
        echoObject.started = false
        return true
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        return false
    }
    
    socketReconnect(channelObject: IChannelObject): boolean {
        return false
    }

}    
