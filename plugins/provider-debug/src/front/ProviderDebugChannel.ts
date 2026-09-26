import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { EProviderDebugPayload, IProviderDebugMessageResponse } from '../common/ProviderDebugTypes'
import { ProviderDebugConfig, ProviderDebugInstanceConfig, IProviderDebugConfig } from './ProviderDebugConfig'
import { ProviderDebugData, IProviderDebugData } from './ProviderDebugData'
import { ProviderDebugSetup, ProviderDebugIcon } from './ProviderDebugSetup'
import { ProviderDebugTabContent } from './ProviderDebugTabContent'
import { FC } from 'react'

export class ProviderDebugChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = ProviderDebugSetup
    TabContent: FC<IContentProps> = ProviderDebugTabContent
    channelId = 'provider-debug'
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
        backChannels: false,
    }

    getScope() { return EInstanceConfigScope.NONE }
    getChannelIcon(): JSX.Element { return ProviderDebugIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: IProviderDebugMessageResponse = JSON.parse(wsEvent.data)
        const data: IProviderDebugData = channelObject.data
        const config: IProviderDebugConfig = channelObject.config

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                if (msg.payloadType === EProviderDebugPayload.PROVIDERS) {
                    data.providers = msg.providers ?? []
                }
                else {
                    if (msg.event) {
                        data.events.push(msg.event)
                        while (data.events.length > config.maxEvents) data.events.shift()
                    }
                }
                return { action: EChannelRefreshAction.REFRESH }
            case EInstanceMessageType.SIGNAL: {
                const signalMessage: ISignalMessage = JSON.parse(wsEvent.data)
                const startResponse = signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START
                if (startResponse) channelObject.instanceId = signalMessage.instance

                // The two startup milestones are shown as chips, not as lines of text, and they are
                // told apart by STRUCTURE, not by their literal text:
                //  - the core answers the start config with an IInstanceConfigResponse, which carries
                //    NO 'level' (back/src/index.ts, sendInstanceConfigSignalMessage)
                //  - this channel always sends an ISignalMessage WITH 'level': INFO on subscribing and
                //    ERROR on failures, which do have to keep being read as text
                if (startResponse && signalMessage.level === undefined) {
                    data.configAccepted = true
                    return { action: EChannelRefreshAction.REFRESH }
                }
                if (startResponse && signalMessage.level === ESignalMessageLevel.INFO) {
                    data.subscribed = true
                    return { action: EChannelRefreshAction.REFRESH }
                }

                if (signalMessage.text) data.signals.push(signalMessage.text)
                return { action: EChannelRefreshAction.REFRESH }
            }
            default:
                return { action: EChannelRefreshAction.NONE }
        }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new ProviderDebugInstanceConfig()
        channelObject.config = new ProviderDebugConfig()
        channelObject.data = new ProviderDebugData()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const data: IProviderDebugData = channelObject.data
        data.events = []
        data.signals = []
        // both milestones go off on every start: they light up again with their replies
        data.configAccepted = false
        data.subscribed = false
        // 'providers' is deliberately NOT cleared: it is what populates the setup's Select, which is
        // opened BEFORE starting. Losing it here would leave the dropdown without the core providers
        // on every restart. The back end sends a fresh catalogue right after, so it overwrites itself.
        data.paused = false
        data.started = true
        return true
    }

    pauseChannel(channelObject: IChannelObject): boolean {
        const data: IProviderDebugData = channelObject.data
        data.paused = true
        return true
    }

    continueChannel(channelObject: IChannelObject): boolean {
        const data: IProviderDebugData = channelObject.data
        data.paused = false
        return true
    }

    stopChannel(channelObject: IChannelObject): boolean {
        const data: IProviderDebugData = channelObject.data
        data.configAccepted = false
        data.subscribed = false
        data.paused = false
        data.started = false
        return true
    }

    socketDisconnected(_channelObject: IChannelObject): boolean { return false }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
