import { EInstanceConfigScope } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { MircConfig, MircInstanceConfig } from './MircConfig'
import { MircData, IMircData } from './MircData'
import { MircSetup, MircIcon } from './MircSetup'
import { MircTabContent } from './MircTabContent'
import { MircClient, IClusterEntry } from './MircClient'
import { FC } from 'react'

const NICK_KEY = 'kwirth.mirc.nick'

export class MircChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = MircSetup
    TabContent: FC<IContentProps> = MircTabContent
    channelId = 'mirc'
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
        webSocket: false,   // MircClient manages its own sockets to every cluster
        backChannels: false,
    }

    // cluster-scoped channel
    getScope() { return EInstanceConfigScope.CLUSTER }
    getChannelIcon(): JSX.Element { return MircIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    // MircClient drives the UI directly (it subscribes via onChange), so the core
    // tab ws is not the data path. Nothing to do here.
    processChannelMessage(_channelObject: IChannelObject, _wsEvent: MessageEvent): IChannelMessageAction {
        return { action: EChannelRefreshAction.NONE }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.instanceConfig = new MircInstanceConfig()
        channelObject.config = new MircConfig()
        channelObject.data = new MircData()
        const data: IMircData = channelObject.data
        data.nick = (localStorage.getItem(NICK_KEY) || '').trim()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const data: IMircData = channelObject.data
        const nick = (data.nick || localStorage.getItem(NICK_KEY) || '').trim()
        if (!nick) return false   // need a nick; Setup dialog will provide it
        data.nick = nick
        data.client = new MircClient(nick)
        const clusters: IClusterEntry[] = channelObject.clusterUrl ? [{
            id: channelObject.clusterName,
            name: channelObject.clusterName,
            url: channelObject.clusterUrl,
            accessString: channelObject.accessString || ''
        }] : []
        data.client.start(clusters)
        data.started = true
        return true
    }

    pauseChannel(_channelObject: IChannelObject): boolean { return true }
    continueChannel(_channelObject: IChannelObject): boolean { return true }

    stopChannel(channelObject: IChannelObject): boolean {
        const data: IMircData = channelObject.data
        data.client?.stop()
        data.client = undefined
        data.started = false
        return true
    }

    socketDisconnected(_channelObject: IChannelObject): boolean { return false }
    socketReconnect(_channelObject: IChannelObject): boolean { return false }
}
