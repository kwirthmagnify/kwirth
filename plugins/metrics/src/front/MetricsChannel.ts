import { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { InstanceConfigScopeEnum, IInstanceMessage, ISignalMessage, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { MetricsIcon, MetricsSetup } from './MetricsSetup'
import { MetricsTabContent } from './MetricsTabContent'
import { MetricsData, IAssetMetricsValues, EMetricsEventSeverity, IMetricsData } from './MetricsData'
import { IMetricsConfig, MetricsInstanceConfig, MetricsConfig } from './MetricsConfig'
import { EChartType } from './MenuChart'
import { EMetricsConfigMode, IMetricsInstanceConfig } from '../common/MetricsTypes'

export class MetricsChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = MetricsSetup
    TabContent: FC<IContentProps> = MetricsTabContent
    channelId = 'metrics'
    
    requirements:IChannelRequirements = {
        accessString: true,
        clusterUrl: true,
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
        backChannels: false,
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
                    if (metricsData.assetMetricsValues.length===0) {
                        metricsMessage.timestamp = Date.now()
                        metricsData.assetMetricsValues.push(metricsMessage)
                    }
                    else {
                        metricsMessage.timestamp = metricsData.assetMetricsValues[0].timestamp
                        metricsData.assetMetricsValues[0] = metricsMessage
                    }
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

    /*
        What an embedding channel (Magnify) needs to run metrics inside its own view: the initial data,
        config and instance config. Compact charts, everything aggregated and the six basic metrics.
        The embedder still builds its own form (it knows the metrics list it has); formConfig is empty.
    */
    prepareExternalChannel(_view: EInstanceConfigView, _selectedResources: unknown[], _container: string): { data: IMetricsData; config: IMetricsConfig; instanceConfig: IMetricsInstanceConfig; formConfig: {} } {
        return {
            data: new MetricsData(),
            config: {
                depth: 50,
                width: 3,
                lineHeight: 300,
                configurable: true,
                compact: true,
                legend: true,
                merge: false,
                stack: false,
                chart: EChartType.LineChart,
                metricsDefault: {}
            },
            instanceConfig: {
                mode: EMetricsConfigMode.STREAM,
                aggregate: true,
                interval: 15,
                metrics: ['kwirth_container_cpu_percentage','kwirth_container_memory_percentage', 'kwirth_container_transmit_mbps', 'kwirth_container_receive_mbps', 'kwirth_container_write_mbps', 'kwirth_container_read_mbps']
            },
            formConfig: {}
        }
    }
}
