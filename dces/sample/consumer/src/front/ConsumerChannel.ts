import React, { FC } from 'react'
import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { IConsumerMessageResponse, IConsumerReading } from '../common/ConsumerTypes'
import { ConsumerTabContent } from './ConsumerTabContent'
import { readFrontDce, IFrontReading } from './ConsumerFront'
import { ConsumerIcon } from './icons'

/** The tab's state: what each end read from the DCE. */
export interface IConsumerData {
    /** What the BACK end read (one instance in the Kwirth process). */
    back?: IConsumerReading
    /** What THIS TAB read (one instance in the page). */
    front?: IFrontReading
    signals: string[]
    started: boolean
}

export class ConsumerData implements IConsumerData {
    back?: IConsumerReading
    front?: IFrontReading
    signals: string[] = []
    started = false
}

const ConsumerSetup: FC<ISetupProps> = () => React.createElement('div', null, 'Nothing to configure: open it and it reads the sample DCE on both ends.')

export class ConsumerChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = ConsumerSetup
    TabContent: FC<IContentProps> = ConsumerTabContent
    channelId = 'dce-consumer'
    requirements: IChannelRequirements = {
        accessString: true,
        clusterUrl: true,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: true,
        setup: false,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true,
        backChannels: false,
    }

    getScope() { return EInstanceConfigScope.NONE }
    getChannelIcon(): JSX.Element { return React.createElement(ConsumerIcon) }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: IConsumerMessageResponse = JSON.parse(wsEvent.data)
        const data: IConsumerData = channelObject.data

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                data.back = msg.reading
                return { action: EChannelRefreshAction.REFRESH }
            case EInstanceMessageType.SIGNAL: {
                const signal: ISignalMessage = JSON.parse(wsEvent.data)
                if (signal.flow === EInstanceMessageFlow.RESPONSE && signal.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = signal.instance
                    data.started = true
                }
                if (signal.level === ESignalMessageLevel.ERROR) data.signals.push(signal.text ?? 'Unknown error')
                return { action: EChannelRefreshAction.REFRESH }
            }
            default:
                return { action: EChannelRefreshAction.NONE }
        }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.data = new ConsumerData()
        // The front end's own reading happens when the channel is created, which is the moment that
        // matters: if the DCE were not loaded yet, this is where it would fail (plan: RF7).
        channelObject.data.front = readFrontDce()
        return true
    }

    startChannel(_channelObject: IChannelObject): boolean { return true }

    stopChannel(channelObject: IChannelObject): boolean {
        const data: IConsumerData = channelObject.data
        if (data) { data.started = false; data.back = undefined }
        return true
    }

    pauseChannel(_channelObject: IChannelObject): boolean { return true }
    continueChannel(_channelObject: IChannelObject): boolean { return true }

    socketDisconnected(channelObject: IChannelObject): boolean {
        const data: IConsumerData = channelObject.data
        if (data) data.started = false
        return true
    }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
