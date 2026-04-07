import { EInstanceConfigView } from "@kwirthmagnify/kwirth-common"
import { IChannel, IChannelObject } from "../channels/IChannel"

interface ITabObject {
    name: string
    ws: WebSocket|undefined
    keepAliveRef: NodeJS.Timer|undefined
    defaultTab: boolean
    channel: IChannel
    channelObject: IChannelObject
    channelStarted: boolean
    channelPaused: boolean
    channelPending: boolean
    headerEl:any
}

interface ITabSummary {
    name: string
    description: string
    channel: string
    channelObject: {
        clusterName: string
        view: EInstanceConfigView
        namespace: string
        group: string
        pod: string
        container: string
    }
}

export type { ITabObject, ITabSummary }
