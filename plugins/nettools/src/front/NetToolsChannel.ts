import React, { FC } from 'react'
import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction, getDce, hasDce } from '@kwirthmagnify/kwirth-common-front'
import { EDnsRecordType, INetToolsFront } from '../common/NetToolsContract'
import { INetToolsMessageResponse, INetToolsReading } from '../common/NetToolsMessages'
import { NetToolsTabContent } from './NetToolsTabContent'
import { NetToolsIcon } from './icons'

/*
    Records the round trip in the DCE's shared history, when there was one.

    Only what the resolver really answered is recorded — a reading that carries the result's own error
    did not measure a round trip, it measured a refusal, and mixing the two would make the chart lie
    about what the network is doing. An empty answer IS recorded: the name resolved, it just has no
    record of that type, and how long that took is the same question.
*/
export const recordRoundTrip = (nettools: INetToolsFront, reading: INetToolsReading): void => {
    if (reading.dns && !reading.dns.error)
        nettools.record({ name: reading.dns.name, type: reading.dns.type, timeMs: reading.dns.timeMs, records: reading.dns.records.length })
    if (reading.reverse && !reading.reverse.error)
        nettools.record({ name: reading.reverse.address, type: EDnsRecordType.PTR, timeMs: reading.reverse.timeMs, records: reading.reverse.hostnames.length })
}

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

    /*
        The icon comes from the DCE, so this plugin does not own a copy of the path and a change to it
        reaches every consumer at once.

        `hasDce()` and not `getDce()`: this runs while the channel selector is being painted, and a
        throw there would leave the channel out of the list with nothing saying why. A missing DCE is
        already reported where it matters — the moment a question is asked — so here it falls back and
        carries on. It is the one place in this plugin where the DCE is optional.
    */
    getChannelIcon(): JSX.Element {
        const icon = hasDce('nettools') ? getDce<INetToolsFront>('nettools').Icon : NetToolsIcon
        return React.createElement(icon)
    }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: INetToolsMessageResponse = JSON.parse(wsEvent.data)
        const data: INetToolsData = channelObject.data

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                data.waiting = false
                data.readings = [msg.reading, ...data.readings].slice(0, MAX_READINGS)
                // Recorded HERE and not in the tab's content: an answer that arrives while the tab is
                // not the one on screen is still a round trip, and the chart has to have it.
                if (hasDce('nettools')) recordRoundTrip(getDce<INetToolsFront>('nettools'), msg.reading)
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
