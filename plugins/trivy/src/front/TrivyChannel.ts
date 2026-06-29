import React, { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelObject, IChannelRequirements, IContentProps, ISetupProps, ENotifyLevel } from '@kwirthmagnify/kwirth-common-front'
import { IChannelMessageAction } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceMessageAction, EInstanceMessageType, ISignalMessage, EInstanceMessageFlow, ESignalMessageLevel, IInstanceMessage, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { TrivyIcon, TrivySetup } from './TrivySetup'
import { TrivyTabContent } from './TrivyTabContent'
import { ITrivyData, IAsset, TrivyData } from './TrivyData'
import { TrivyConfig, TrivyInstanceConfig } from './TrivyConfig'
import { ITrivyMessageResponse } from '../common/TrivyTypes'

export class TrivyChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = TrivySetup
    TabContent: FC<IContentProps> = TrivyTabContent
    channelId = 'trivy'

    requirements: IChannelRequirements = {
        accessString: true, clusterUrl: true, clusterInfo: false, exit: false,
        frontChannels: false, metrics: false, notifier: true, notifications: true,
        setup: true, settings: false, palette: false, userSettings: false, webSocket: true, backChannels: false
    }

    getScope() { return 'trivy$workload' }
    getChannelIcon(): JSX.Element { return TrivyIcon }
    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let action = EChannelRefreshAction.NONE
        let trivyData: ITrivyData = channelObject.data
        let trivyMessageResponse: ITrivyMessageResponse = JSON.parse(wsEvent.data)

        const getAsset = (namespace: string, name: string, container: string, create: boolean): IAsset | undefined => {
            let asset = trivyData.assets.find(a => a.namespace === namespace && a.name === name && a.container === container)
            if (!asset && create) {
                asset = {
                    name, namespace, container,
                    unknown: { statusCode: 0, statusMessage: '' },
                    vulnerabilityreports: { report: undefined },
                    configauditreports: { report: undefined },
                    sbomreports: { report: undefined },
                    exposedsecretreports: { report: undefined }
                }
                trivyData.assets.push(asset)
            }
            return asset
        }

        switch (trivyMessageResponse.type) {
            case EInstanceMessageType.DATA:
                if (trivyMessageResponse.flow === EInstanceMessageFlow.UNSOLICITED) {
                    switch (trivyMessageResponse.msgsubtype) {
                        case 'add':
                        case 'update': {
                            const asset = getAsset(trivyMessageResponse.data.known.namespace, trivyMessageResponse.data.known.name, trivyMessageResponse.data.known.container, true)
                            ;(asset as any)[trivyMessageResponse.data.resource].report = trivyMessageResponse.data.known.report
                            break
                        }
                        case 'delete': {
                            const assetDel = getAsset(trivyMessageResponse.data.known.namespace, trivyMessageResponse.data.known.name, trivyMessageResponse.data.known.container, false)
                            if (assetDel) trivyData.assets = trivyData.assets.filter(a => a !== assetDel)
                            break
                        }
                    }
                    trivyData.assets = [...trivyData.assets]
                    action = EChannelRefreshAction.REFRESH
                }
                break
            case EInstanceMessageType.SIGNAL: {
                let signalMessage: ISignalMessage = JSON.parse(wsEvent.data)
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE) {
                    switch (signalMessage.action) {
                        case EInstanceMessageAction.START:
                            channelObject.instanceId = signalMessage.instance
                            if (!channelObject.data.ri) {
                                channelObject.webSocket!.send(JSON.stringify({
                                    action: EInstanceMessageAction.RI, channel: 'trivy',
                                    flow: EInstanceMessageFlow.REQUEST, type: EInstanceMessageType.SIGNAL,
                                    instance: channelObject.instanceId
                                } as IInstanceMessage))
                            }
                            break
                        case EInstanceMessageAction.RI:
                            trivyData.ri = signalMessage.data
                            break
                    }
                }
                action = EChannelRefreshAction.REFRESH
                break
            }
        }
        return { action }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.data = new TrivyData()
        channelObject.instanceConfig = new TrivyInstanceConfig()
        channelObject.config = new TrivyConfig()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const trivyData: ITrivyData = channelObject.data
        trivyData.paused = false
        trivyData.started = true
        trivyData.assets = []
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean { (channelObject.data as ITrivyData).paused = true; return false }
    continueChannel(channelObject: IChannelObject): boolean { (channelObject.data as ITrivyData).paused = false; return true }
    stopChannel(channelObject: IChannelObject): boolean { const d = channelObject.data as ITrivyData; d.paused = false; d.started = false; return true }
    socketDisconnected(_channelObject: IChannelObject): boolean { return true }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }

    prepareExternalChannel(_view: EInstanceConfigView, _selectedResources: any[], _container: string): { data: any; config: any; instanceConfig: any; formConfig: any } {
        return {
            data: new TrivyData(),
            config: new TrivyConfig(),
            instanceConfig: new TrivyInstanceConfig(),
            formConfig: {}
        }
    }
}
