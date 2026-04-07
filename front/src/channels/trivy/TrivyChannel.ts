import { FC } from 'react'
import { EChannelRefreshAction, IChannel, IChannelMessageAction, IChannelObject, IChannelRequirements, IContentProps, ISetupProps } from '../IChannel'
import { EInstanceMessageAction, EInstanceMessageType, ISignalMessage, EInstanceMessageFlow, ESignalMessageLevel, IInstanceMessage } from '@kwirthmagnify/kwirth-common'
import { TrivyIcon, TrivySetup } from './TrivySetup'
import { TrivyTabContent } from './TrivyTabContent'
import { ITrivyData, ITrivyMessageResponse, IAsset, TrivyData } from './TrivyData'
import { TrivyConfig, TrivyInstanceConfig } from './TrivyConfig'

export class TrivyChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = TrivySetup
    TabContent: FC<IContentProps> = TrivyTabContent
    channelId = 'trivy'
    
    requirements:IChannelRequirements = {
        accessString: true,
        clusterUrl: true,
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
        webSocket: true
    }

    getScope() { return 'trivy$workload' }
    getChannelIcon(): JSX.Element { return TrivyIcon }
    
    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility:boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject:IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let action = EChannelRefreshAction.NONE
        let trivyData:ITrivyData = channelObject.data
        let trivyMessageResponse:ITrivyMessageResponse = JSON.parse(wsEvent.data)

        const getAsset = (namespace:string, name:string, container:string, create: boolean) : IAsset|undefined => {
            let asset = trivyData.assets.find(a => a.namespace===namespace && a.name===name && a.container===container)
            if (!asset && create) {
                asset = {
                    name,
                    namespace,
                    container,
                    unknown: {
                        statusCode: 0,
                        statusMessage: ''
                    },
                    vulnerabilityreports: {
                        report: undefined
                    },
                    configauditreports: {
                        report: undefined
                    },
                    sbomreports: {
                        report: undefined
                    },
                    exposedsecretreports: {
                        report: undefined
                    }
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
                        case 'update':
                            let asset = getAsset(trivyMessageResponse.data.known.namespace, trivyMessageResponse.data.known.name, trivyMessageResponse.data.known.container, true);
                            (asset as any)[trivyMessageResponse.data.resource].report = trivyMessageResponse.data.known.report
                            break
                        case 'delete':
                            let assetDelete = getAsset(trivyMessageResponse.data.known.namespace, trivyMessageResponse.data.known.name, trivyMessageResponse.data.known.container, false)
                            if (assetDelete) trivyData.assets = trivyData.assets.filter(a => a !==assetDelete)
                            break
                        default:
                            console.log('Invalid msgsubtype: ', trivyMessageResponse.msgsubtype)
                    }
                    trivyData.assets = [...trivyData.assets]
                    action = EChannelRefreshAction.REFRESH
                }
                break
            case EInstanceMessageType.SIGNAL:
                let signalMessage:ISignalMessage = JSON.parse(wsEvent.data)
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE) {
                    switch(signalMessage.action) {
                        case EInstanceMessageAction.START:
                            channelObject.instanceId = signalMessage.instance
                            if (!channelObject.data.ri) {
                                // just connected, we request HTTP endpoints
                                let instanceConfig:IInstanceMessage = {
                                    action: EInstanceMessageAction.RI,
                                    channel: 'trivy',
                                    flow: EInstanceMessageFlow.REQUEST,
                                    type: EInstanceMessageType.SIGNAL,
                                    instance: channelObject.instanceId
                                }
                                channelObject.webSocket!.send(JSON.stringify( instanceConfig ))
                            }
                            break
                        case EInstanceMessageAction.RI:
                            trivyData.ri = signalMessage.data
                            break
                        default:
                            console.log('Received signal action:', signalMessage.action)
                            break
                    }
                }
                else {
                    if (signalMessage.level!== ESignalMessageLevel.INFO) console.log('SIGNAL RECEIVED',wsEvent.data)
                }
                break
            default:
                console.log(`Invalid message type ${trivyMessageResponse.type}`)
                break
        }
        return { action }
    }

    async initChannel(channelObject:IChannelObject): Promise<boolean> {
        channelObject.data = new TrivyData()
        channelObject.instanceConfig = new TrivyInstanceConfig()
        channelObject.config = new TrivyConfig()
        return false
    }

    startChannel(channelObject:IChannelObject): boolean {
        let trivyData:ITrivyData = channelObject.data
        trivyData.paused = false
        trivyData.started = true
        trivyData.assets = []
        return true
    }

    pauseChannel(channelObject:IChannelObject): boolean {
        let trivyData:ITrivyData = channelObject.data
        trivyData.paused = true
        return false
    }

    continueChannel(channelObject:IChannelObject): boolean {
        let trivyData:ITrivyData = channelObject.data
        trivyData.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        let trivyData:ITrivyData = channelObject.data
        trivyData.paused = false
        trivyData.started = false
        return true
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        return true
    }

    socketReconnect(channelObject: IChannelObject): boolean {
        return false
    }


    // *************************************************************************************
    // PRIVATE
    // *************************************************************************************

}    
