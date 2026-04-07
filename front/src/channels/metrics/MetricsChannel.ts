import { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from '../IChannel'
import { InstanceConfigScopeEnum, IInstanceMessage, ISignalMessage, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel } from '@kwirthmagnify/kwirth-common'
import { MetricsIcon, MetricsSetup } from './MetricsSetup'
import { MetricsTabContent } from './MetricsTabContent'
import { MetricsData, IAssetMetricsValues, EMetricsEventSeverity, IMetricsData } from './MetricsData'
import { IMetricsConfig, MetricsInstanceConfig, MetricsConfig } from './MetricsConfig'

export class MetricsChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = MetricsSetup
    TabContent: FC<IContentProps> = MetricsTabContent
    channelId = 'metrics'
    
    requirements:IChannelRequirements = {
        accessString: true,
        clusterUrl: false,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: true,
        notifications: true,
        notifier: true,
        setup: true,
        settings: true,
        palette: false,
        userSettings: false,
        webSocket: true,
    }

    getScope() { return InstanceConfigScopeEnum.STREAM }
    getChannelIcon(): JSX.Element { return MetricsIcon }
    
    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility:boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let action = EChannelRefreshAction.NONE
        var metricsMessage:IAssetMetricsValues = JSON.parse(wsEvent.data)
        let metricsData:IMetricsData = channelObject.data
        let metricsConfig:IMetricsConfig = channelObject.config

        switch (metricsMessage.type) {
            case EInstanceMessageType.DATA:
                if (metricsMessage.timestamp===0) {  // initial metrics values
                    metricsMessage.timestamp = Date.now()
                    if (metricsData.assetMetricsValues.length===0)
                        metricsData.assetMetricsValues.push(metricsMessage)
                    else
                        metricsData.assetMetricsValues[0] = metricsMessage
                }
                else {
                    metricsData.assetMetricsValues.push(metricsMessage)
                    if (metricsData.assetMetricsValues.length > metricsConfig.depth) metricsData.assetMetricsValues.shift()
                }
                if (!metricsData.paused) action = EChannelRefreshAction.REFRESH
                break
            case EInstanceMessageType.SIGNAL:
                let instanceMessage:IInstanceMessage = JSON.parse(wsEvent.data)
                if (instanceMessage.flow === EInstanceMessageFlow.RESPONSE && instanceMessage.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = instanceMessage.instance
                }
                else {
                    let signalMessage:ISignalMessage = JSON.parse(wsEvent.data)
                    if (instanceMessage.flow === EInstanceMessageFlow.RESPONSE && instanceMessage.action === EInstanceMessageAction.RECONNECT) {
                        if (signalMessage.text) {
                            metricsData.events.push( { severity: EMetricsEventSeverity.INFO, text: signalMessage.text })
                        }
                    }
                    else {
                        if (signalMessage.level === ESignalMessageLevel.ERROR) {
                            if (signalMessage.text) {
                                metricsData.events.push( { severity: EMetricsEventSeverity.ERROR, text: signalMessage.text })
                                action = EChannelRefreshAction.REFRESH
                            }
                        }
                    }
                }
                break
            default:
                console.log(`Invalid message type ${metricsMessage.type}`)
                break
        }
        return {
            action
        }
    }

    async initChannel(channelObject:IChannelObject): Promise<boolean> {
        channelObject.data = new MetricsData()
        channelObject.instanceConfig = new MetricsInstanceConfig()
        channelObject.config = new MetricsConfig()
        return false
    }

    startChannel(channelObject:IChannelObject): boolean {
        let metricsData:IMetricsData = channelObject.data
        metricsData.events = []
        metricsData.assetMetricsValues=[]
        metricsData.paused = false
        metricsData.started = true
        return true
    }

    pauseChannel(channelObject:IChannelObject): boolean {
        let metricsData:IMetricsData = channelObject.data
        metricsData.paused = true
        return false
    }

    continueChannel(channelObject:IChannelObject): boolean {
        let metricsData:IMetricsData = channelObject.data
        metricsData.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        let metricsData:IMetricsData = channelObject.data
        metricsData.paused = false
        metricsData.started = false
        return true
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        let metricsData:IMetricsData = channelObject.data
        metricsData.events.push( { severity: EMetricsEventSeverity.INFO, text: '*** Lost connection ***' })
        return true
    }

    socketReconnect(channelObject: IChannelObject): boolean {
        return false
    }

}    
