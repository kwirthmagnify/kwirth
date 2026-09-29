import React, { FC } from 'react'
import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { EDnsRecordType } from '../common/NetToolsContract'
import { INetToolsMessageResponse, INetToolsReading } from '../common/NetToolsMessages'
import { NetToolsTabContent } from './NetToolsTabContent'
import { NetToolsIcon } from './icons'

/** What the tab holds between renders: the form as it is being typed, and the last few answers. */
export interface INetToolsData {
    target: string
    type: EDnsRecordType
    port: number
    /** Newest first. Kept small on purpose: this is a console, not a history. */
    readings: INetToolsReading[]
    /** True between asking and being answered, so the buttons can say so. */
    waiting: boolean
    signals: string[]
    started: boolean
}

/** How many answers stay on screen. Older ones go: nobody scrolls a diagnostics console. */
export const MAX_READINGS = 10

export class NetToolsData implements INetToolsData {
    target = ''
    type = EDnsRecordType.A
    port = 443
    readings: INetToolsReading[] = []
    waiting = false
    signals: string[] = []
    started = false
}

const NetToolsSetup: FC<ISetupProps> = () => React.createElement('div', null, 'Nothing to configure: start it and type a host name.')

export class NetToolsChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = NetToolsSetup
    TabContent: FC<IContentProps> = NetToolsTabContent
    channelId = 'nettools'
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
    getChannelIcon(): JSX.Element { return React.createElement(NetToolsIcon) }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: INetToolsMessageResponse = JSON.parse(wsEvent.data)
        const data: INetToolsData = channelObject.data

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                data.waiting = false
                data.readings = [msg.reading, ...data.readings].slice(0, MAX_READINGS)
                return { action: EChannelRefreshAction.REFRESH }
            case EInstanceMessageType.SIGNAL: {
                const signal: ISignalMessage = JSON.parse(wsEvent.data)
                if (signal.flow === EInstanceMessageFlow.RESPONSE && signal.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = signal.instance
                    data.started = true
                }
                if (signal.level === ESignalMessageLevel.ERROR) {
                    data.waiting = false
                    data.signals.push(signal.text ?? 'Unknown error')
                }
                return { action: EChannelRefreshAction.REFRESH }
            }
            default:
                return { action: EChannelRefreshAction.NONE }
        }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.data = new NetToolsData()
        return true
    }

    startChannel(_channelObject: IChannelObject): boolean { return true }

    stopChannel(channelObject: IChannelObject): boolean {
        const data: INetToolsData = channelObject.data
        if (data) { data.started = false; data.waiting = false }
        return true
    }

    pauseChannel(_channelObject: IChannelObject): boolean { return true }
    continueChannel(_channelObject: IChannelObject): boolean { return true }

    socketDisconnected(channelObject: IChannelObject): boolean {
        const data: INetToolsData = channelObject.data
        if (data) { data.started = false; data.waiting = false }
        return true
    }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
