import { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from '../IChannel'
import { EAlertSeverity, IAlertMessage, IInstanceMessage, ISignalMessage, EInstanceMessageFlow, EInstanceMessageType, EInstanceMessageAction, EInstanceConfigScope } from '@kwirthmagnify/kwirth-common'
import { AlertIcon, AlertSetup } from './AlertSetup'
import { AlertTabContent } from './AlertTabContent'
import { AlertData, IAlertData } from './AlertData'
import { AlertInstanceConfig, AlertConfig, IAlertConfig } from './AlertConfig'

export class AlertChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = AlertSetup
    TabContent: FC<IContentProps> = AlertTabContent
    channelId = 'alert'
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

    getScope() { return EInstanceConfigScope.VIEW}
    getChannelIcon(): JSX.Element { return AlertIcon }
    
    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility:boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let action = EChannelRefreshAction.NONE
        let msg:IAlertMessage = JSON.parse(wsEvent.data)
        let alertData:IAlertData = channelObject.data
        let alertConfig:IAlertConfig = channelObject.config

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                alertData.firedAlerts.push ({
                    timestamp: msg.timestamp? new Date(msg.timestamp).getTime(): Date.now(),
                    severity: msg.severity,
                    text: msg.text,
                    namespace: msg.namespace,
                    group: '',
                    pod: msg.pod,
                    container: msg.container
                })
                if (alertData.firedAlerts.length > alertConfig.maxAlerts) alertData.firedAlerts.splice(0, alertData.firedAlerts.length - alertConfig.maxAlerts)
                if (!alertData.paused) action = EChannelRefreshAction.REFRESH
                break
            case EInstanceMessageType.SIGNAL:
                let instanceMessage:IInstanceMessage = JSON.parse(wsEvent.data)
                if (instanceMessage.flow === EInstanceMessageFlow.RESPONSE && instanceMessage.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = instanceMessage.instance
                }
                else if (instanceMessage.flow === EInstanceMessageFlow.RESPONSE && instanceMessage.action === EInstanceMessageAction.RECONNECT) {
                    let signalMessage:ISignalMessage = JSON.parse(wsEvent.data)
                    alertData.firedAlerts.push({
                        timestamp: signalMessage.timestamp?.getTime() || 0,
                        severity: EAlertSeverity.INFO,
                        text: signalMessage.text || ''
                    })
                    action = EChannelRefreshAction.REFRESH
                }
                break
            default:
                console.log(`Invalid message type ${msg.type}`)
                break
        }
        return {
            action
        }
    }

    async initChannel(channelObject:IChannelObject): Promise<boolean> {
        channelObject.data = new AlertData()
        channelObject.instanceConfig = new AlertInstanceConfig()
        channelObject.config = new AlertConfig()
        return false
    }

    startChannel(channelObject:IChannelObject): boolean {
        let alertData:IAlertData = channelObject.data
        alertData.firedAlerts = []
        alertData.paused = false
        alertData.started = true
        return true
    }

    pauseChannel(channelObject:IChannelObject): boolean {
        let alertData:IAlertData = channelObject.data
        alertData.paused = true
        return false
    }

    continueChannel(channelObject:IChannelObject): boolean {
        let alertData:IAlertData = channelObject.data
        alertData.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        let alertData:IAlertData = channelObject.data 
        alertData.firedAlerts.push({
            timestamp: Date.now(),
            severity: EAlertSeverity.INFO,
            namespace:'',
            container: '',
            text: 'Channel stopped\n========================================================================='
        })
        alertData.paused = false
        alertData.started = false
        return true
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        let alertData:IAlertData = channelObject.data
        alertData.firedAlerts.push({
            timestamp: Date.now(),
            severity: EAlertSeverity.ERROR,
            namespace:'',
            container: '',
            text: '*** Lost connection ***'
        })
        return true
    }

    socketReconnect(channelObject: IChannelObject): boolean {
        return false
    }

}    
