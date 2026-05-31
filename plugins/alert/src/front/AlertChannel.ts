import React, { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelObject, IChannelRequirements, IContentProps, ISetupProps, ENotifyLevel } from '@kwirthmagnify/kwirth-common-front'
import { IChannelMessageAction } from '@kwirthmagnify/kwirth-common-front'
import { IInstanceMessage, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, ISignalMessage, EInstanceConfigScope } from '@kwirthmagnify/kwirth-common'
import { AlertIcon, AlertSetup } from './AlertSetup'
import { AlertData, IAlertData } from './AlertData'
import { IAlertConfig, AlertInstanceConfig, AlertConfig } from './AlertConfig'
import { IAlertMessage } from './AlertTypes'
import { AlertTabContent } from './AlertTabContent'

export class AlertChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = AlertSetup
    TabContent: FC<IContentProps> = AlertTabContent
    channelId = 'alert'

    requirements: IChannelRequirements = {
        accessString: true, clusterUrl: true, clusterInfo: false, exit: false,
        frontChannels: false, metrics: true, notifier: true, notifications: true,
        setup: true, settings: false, palette: false, userSettings: false, webSocket: false
    }

    getScope() { return EInstanceConfigScope.VIEW }
    getChannelIcon(): JSX.Element { return AlertIcon }
    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let action = EChannelRefreshAction.NONE
        const alertData: IAlertData = channelObject.data
        const alertConfig: IAlertConfig = channelObject.config
        const msg: IAlertMessage = JSON.parse(wsEvent.data)

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                if (!alertData.paused) {
                    alertData.firedAlerts.push({
                        timestamp: msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now(),
                        severity: msg.severity,
                        text: msg.text,
                        namespace: msg.namespace,
                        pod: msg.pod,
                        container: msg.container,
                        type: msg.type
                    })
                    if (alertData.firedAlerts.length > alertConfig.maxAlerts) {
                        alertData.firedAlerts.splice(0, alertData.firedAlerts.length - alertConfig.maxAlerts)
                    }
                    action = EChannelRefreshAction.REFRESH
                }
                break
            case EInstanceMessageType.SIGNAL: {
                const instanceMessage: IInstanceMessage = JSON.parse(wsEvent.data)
                if (instanceMessage.flow === EInstanceMessageFlow.RESPONSE && instanceMessage.action === EInstanceMessageAction.START) {
                    if (instanceMessage.instance !== '') channelObject.instanceId = instanceMessage.instance
                    else {
                        const signalMessage: ISignalMessage = JSON.parse(wsEvent.data)
                        channelObject.notify?.('alert', ENotifyLevel.ERROR, signalMessage.text || signalMessage.event || '')
                    }
                } else if (instanceMessage.flow === EInstanceMessageFlow.RESPONSE && instanceMessage.action === EInstanceMessageAction.RECONNECT) {
                    const signalMessage: ISignalMessage = JSON.parse(wsEvent.data)
                    alertData.firedAlerts.push({ timestamp: Date.now(), severity: 'info' as any, text: signalMessage.text || '', type: EInstanceMessageType.DATA })
                } else {
                    alertData.firedAlerts.push(msg as any)
                    action = EChannelRefreshAction.REFRESH
                }
                break
            }
        }
        return { action }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new AlertInstanceConfig()
        channelObject.config = new AlertConfig()
        channelObject.data = new AlertData()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const alertData: IAlertData = channelObject.data
        alertData.firedAlerts = []
        alertData.paused = false
        alertData.started = true
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean { (channelObject.data as IAlertData).paused = true; return false }
    continueChannel(channelObject: IChannelObject): boolean { (channelObject.data as IAlertData).paused = false; return true }

    stopChannel(channelObject: IChannelObject): boolean {
        const alertData: IAlertData = channelObject.data
        if (alertData.started) alertData.firedAlerts.push({ timestamp: Date.now(), severity: 'info' as any, text: 'Channel stopped', type: EInstanceMessageType.DATA })
        alertData.started = false
        alertData.paused = false
        return true
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        const alertData: IAlertData = channelObject.data
        alertData.firedAlerts.push({ timestamp: Date.now(), severity: 'error' as any, text: '*** Lost connection ***', type: EInstanceMessageType.DATA })
        return true
    }

    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
