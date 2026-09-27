import React, { FC } from 'react'
import { EInstanceConfigScope, EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction, ESignalMessageLevel, ISignalMessage } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { StatusIcon } from './icons'
import { EStatusPayload, IStatusMessageResponse } from '../common/StatusTypes'
import { IStatusData, StatusData } from './StatusData'
import { StatusTabContent } from './StatusTabContent'

/*
    There is no configuration dialog: this channel has nothing to configure — it is opened and it shows
    the inventory. It is declared all the same because the contract asks for it, and it says what there is
    instead of opening an empty dialog.
*/
const StatusSetup: FC<ISetupProps> = () => React.createElement('div', null, 'Kwirth Status has nothing to configure: open it and it shows what this Kwirth has inside.')

export class StatusChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = StatusSetup
    TabContent: FC<IContentProps> = StatusTabContent
    channelId = 'status'
    requirements: IChannelRequirements = {
        accessString: true,     // los comandos viajan con su accessKey o el core los descarta
        clusterUrl: true,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: true,
        notifications: true,
        setup: false,           // no hay nada que preguntar antes de arrancar
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: true,        // el refresco se pide por el socket de la instancia
        backChannels: false,
    }

    getScope() { return EInstanceConfigScope.NONE }
    getChannelIcon(): JSX.Element { return React.createElement(StatusIcon) }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const msg: IStatusMessageResponse = JSON.parse(wsEvent.data)
        const data: IStatusData = channelObject.data

        switch (msg.type) {
            case EInstanceMessageType.DATA:
                if (msg.payloadType === EStatusPayload.INVENTORY && msg.inventory) {
                    // The one that was there becomes the previous one: with two snapshots a rate can be
                    // computed. Only ONE is kept; this is not a time series.
                    data.previous = data.inventory
                    data.inventory = msg.inventory
                }
                return { action: EChannelRefreshAction.REFRESH }
            case EInstanceMessageType.SIGNAL: {
                const signalMessage: ISignalMessage = JSON.parse(wsEvent.data)
                if (signalMessage.flow === EInstanceMessageFlow.RESPONSE && signalMessage.action === EInstanceMessageAction.START) {
                    channelObject.instanceId = signalMessage.instance
                    data.configAccepted = true
                    data.started = true
                }
                if (signalMessage.level === ESignalMessageLevel.ERROR) data.signals.push(signalMessage.text ?? 'Unknown error')
                return { action: EChannelRefreshAction.REFRESH }
            }
            default:
                return { action: EChannelRefreshAction.NONE }
        }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        // Without this, TabContent draws onto a 'data' that does not exist: the core does not create it.
        channelObject.data = new StatusData()
        return true
    }
    startChannel(_channelObject: IChannelObject): boolean { return true }

    /*
        On stopping it has to be SAID, and the snapshot thrown away too.

        'started' was set to true by the startup's response and nobody brought it back down, so on
        stopping the channel the tab was left showing the inventory as if nothing had happened. And that
        snapshot is no longer any good: it is from an earlier moment and nothing is going to refresh it
        while the channel is stopped — leaving it there is exactly the kind of stale data that looks
        current which this plugin exists to prevent.
    */
    stopChannel(channelObject: IChannelObject): boolean {
        const data: IStatusData = channelObject.data
        if (data) {
            data.started = false
            data.inventory = undefined
            data.previous = undefined
        }
        return true
    }

    pauseChannel(_channelObject: IChannelObject): boolean { return true }
    continueChannel(_channelObject: IChannelObject): boolean { return true }

    /*
        If the socket drops, the channel stops receiving and the snapshot freezes without warning. It is
        treated like a stop: better to say it has to be started than to show something that no longer updates.
    */
    socketDisconnected(channelObject: IChannelObject): boolean {
        const data: IStatusData = channelObject.data
        if (data) data.started = false
        return true
    }
    /*
        false = the core remakes the instance on reconnecting, instead of taking the previous one as good.
        That is what we want: after a reconnection whatever snapshot was on screen may be stale, so
        another one is asked for.
    */
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
