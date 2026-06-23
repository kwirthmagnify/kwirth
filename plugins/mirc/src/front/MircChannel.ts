import { EInstanceConfigScope, pickAdjective } from '@kwirthmagnify/kwirth-common'
import { IChannel, IChannelObject, IChannelRequirements, IChannelMessageAction, IContentProps, ISetupProps, EChannelRefreshAction } from '@kwirthmagnify/kwirth-common-front'
import { MircConfig, MircInstanceConfig } from './MircConfig'
import { MircData, IMircData } from './MircData'
import { MircIcon } from './MircSetup'
import { MircTabContent } from './MircTabContent'
import { MircClient, IClusterEntry } from './MircClient'
import { FC } from 'react'

const nickKey = (clusterName: string, userId: string) => `kwirth.mirc.nick.${clusterName}.${userId}`

const buildNick = (clusterName: string, userId: string): string => {
    const cluster = clusterName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'cluster'
    const user = userId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'user'
    return `${cluster}_${user}_${pickAdjective()}`
}

export class MircChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = undefined as any
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
        setup: false,
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
        const oldData: IMircData | undefined = channelObject.data as IMircData | undefined
        if (oldData?.client) { oldData.client.stop(); oldData.client = undefined }
        channelObject.instanceConfig = new MircInstanceConfig()
        channelObject.config = new MircConfig()
        channelObject.data = new MircData()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const data: IMircData = channelObject.data
        if (data.client) { data.client.stop(); data.client = undefined }
        localStorage.removeItem('kwirth.mirc.nick')
        const userId = channelObject.userName ?? 'user'
        const key = nickKey(channelObject.clusterName, userId)
        const nick = localStorage.getItem(key) || (() => { const n = buildNick(channelObject.clusterName, userId); localStorage.setItem(key, n); return n })()
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
