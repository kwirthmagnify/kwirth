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

// Nick is resolved in initChannel (before the core sends START) so it travels in instanceConfig.data.nick.
const resolveNick = (channelObject: IChannelObject): string => {
    const userId = channelObject.userName ?? 'user'
    const key = nickKey(channelObject.clusterName, userId)
    return localStorage.getItem(key) || (() => { const n = buildNick(channelObject.clusterName, userId); localStorage.setItem(key, n); return n })()
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
        webSocket: true,    // own cluster uses the framework tab socket (keepalive + reconnect); remotes get extra sockets
        backChannels: false,
    }

    // cluster-scoped channel
    getScope() { return EInstanceConfigScope.CLUSTER }
    getChannelIcon(): JSX.Element { return MircIcon }

    getSetupVisibility(): boolean { return this.setupVisible }
    setSetupVisibility(visibility: boolean): void { this.setupVisible = visibility }

    // Inbound frames from the framework socket (own cluster) are fed to the client; it emits its own onChange.
    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        const data = channelObject.data as IMircData | undefined
        data?.client?.handleFrameworkMessage(wsEvent)
        return { action: EChannelRefreshAction.NONE }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        const oldData: IMircData | undefined = channelObject.data as IMircData | undefined
        if (oldData?.client) { oldData.client.stop(); oldData.client = undefined }
        localStorage.removeItem('kwirth.mirc.nick')
        const nick = resolveNick(channelObject)
        // Put the nick in instanceConfig so the core START (instanceConfig.data) carries it to the back.
        const ic = new MircInstanceConfig(); ic.nick = nick
        channelObject.instanceConfig = ic
        channelObject.config = new MircConfig()
        const data = new MircData(); data.nick = nick
        channelObject.data = data
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const data: IMircData = channelObject.data
        if (data.client) { data.client.stop(); data.client = undefined }
        const nick = data.nick   // resolved in initChannel (so the core START already carried it)
        data.client = new MircClient(nick, channelObject)
        const localId = channelObject.clusterName
        const clusters: IClusterEntry[] = channelObject.clusterUrl ? [{
            id: channelObject.clusterName,
            name: channelObject.clusterName,
            url: channelObject.clusterUrl,
            accessString: channelObject.accessString || ''
        }] : []
        data.client.start(clusters, localId)
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

    socketDisconnected(channelObject: IChannelObject): boolean {
        (channelObject.data as IMircData | undefined)?.client?.markLocalDisconnected()
        return false
    }

    socketReconnect(channelObject: IChannelObject): boolean {
        (channelObject.data as IMircData | undefined)?.client?.resyncLocal()
        return false
    }
}
