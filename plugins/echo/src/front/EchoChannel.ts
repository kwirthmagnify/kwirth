import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, IInstanceMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { EchoConfig, EchoInstanceConfig, IEchoConfig } from './EchoConfig'
import { EchoData, IEchoData } from './EchoData'
import { EchoSetup, EchoIcon } from './EchoSetup'
import { EchoTabContent } from './EchoTabContent'
import { IEchoMessage } from './EchoTypes'
import { FC } from 'react'

export class EchoChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = EchoSetup
    TabContent: FC<IContentProps> = EchoTabContent
    channelId = 'echo'
    requirements: IChannelRequirements = {
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
        webSocket: false,
    }

    getScope() { return EInstanceConfigScope.NONE }
    getChannelIcon(): JSX.Element { return EchoIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: IEchoMessage = JSON.parse(wsEvent.data)
        const echoData: IEchoData = channelObject.data
        const echoConfig: IEchoConfig = channelObject.config

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                echoData.lines.push(msg.text)
                while (echoData.lines.length > echoConfig.maxLines) echoData.lines.shift()
                return { action: EChannelRefreshAction.REFRESH }
            case EInstanceMessageType.SIGNAL: {
                const instanceMessage: IInstanceMessage = JSON.parse(wsEvent.data)
                if (instanceMessage.flow === EInstanceMessageFlow.RESPONSE && instanceMessage.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = instanceMessage.instance
                }
                echoData.lines.push('*** ' + msg.text + ' ***')
                while (echoData.lines.length > echoConfig.maxLines) echoData.lines.shift()
                return { action: EChannelRefreshAction.REFRESH }
            }
            default:
                return { action: EChannelRefreshAction.NONE }
        }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new EchoInstanceConfig()
        channelObject.config = new EchoConfig()
        channelObject.data = new EchoData()
        const echoData: IEchoData = channelObject.data
        echoData.lines = []
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const echoData: IEchoData = channelObject.data
        echoData.lines = ['Start']
        echoData.paused = false
        echoData.started = true
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean {
        const echoData: IEchoData = channelObject.data
        echoData.paused = true
        return true
    }

    continueChannel(channelObject: IChannelObject): boolean {
        const echoData: IEchoData = channelObject.data
        echoData.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        const echoData: IEchoData = channelObject.data
        echoData.lines.push('==========================================================================')
        echoData.paused = false
        echoData.started = false
        return true
    }

    socketDisconnected(_channelObject: IChannelObject): boolean { return false }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
