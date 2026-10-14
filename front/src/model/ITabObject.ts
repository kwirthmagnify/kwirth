import { EInstanceConfigView } from "@kwirthmagnify/kwirth-common"
import { IChannel, IChannelObject } from "../channels/IChannel"

interface ITabObject {
    name: string
    ws: WebSocket|undefined
    keepAliveRef: NodeJS.Timer|undefined
    reconnectRef: NodeJS.Timer|undefined
    defaultTab: boolean
    channel: IChannel
    channelObject: IChannelObject
    channelStarted: boolean
    /** When the channel was last started (ms since epoch); undefined while it has never run. */
    channelStartedAt?: number
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
