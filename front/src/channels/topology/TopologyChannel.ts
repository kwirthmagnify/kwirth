import { FC } from 'react'
import {
    EChannelRefreshAction,
    IChannel,
    IChannelMessageAction,
    IChannelObject,
    IChannelRequirements,
    IContentProps,
    ISetupProps,
} from '../IChannel'
import {
    EInstanceConfigScope,
    EInstanceMessageAction,
    EInstanceMessageFlow,
    EInstanceMessageType,
    IInstanceMessage,
    ISignalMessage,
} from '@kwirthmagnify/kwirth-common'
import { TopologyIcon, TopologySetup } from './TopologySetup'
import { TopologyTabContent } from './TopologyTabContent'
import { TopologyData, ITopologyData, ITopologyNode, ETopologyNodeKind, ETopologyNodeStatus } from './TopologyData'
import { TopologyConfig, TopologyInstanceConfig, ITopologyConfig } from './TopologyConfig'
import { ENotifyLevel } from '../../tools/Global'

// ── WS message shape from the backend ────────────────────────────────────────

interface ITopologyWsMessage {
    type:        EInstanceMessageType
    action?:     EInstanceMessageAction
    flow?:       EInstanceMessageFlow
    instance?:   string
    topoAction?: 'ADDED' | 'MODIFIED' | 'DELETED'
    kind:        ETopologyNodeKind
    uid:         string
    name:        string
    namespace:   string
    status:      ETopologyNodeStatus
    labels:      Record<string, string>
    annotations?: Record<string, string>
    replicas?:    number
    readyReplicas?: number
    image?:       string
    ports?:       number[]
    host?:        string
    edges?:       Array<{ targetUid: string; label?: string }>
    // signal fields
    text?:  string
    level?: string
}

// ── Layer Z positions for 3-D layout ─────────────────────────────────────────

const LAYER_Z: Record<ETopologyNodeKind, number> = {
    [ETopologyNodeKind.INGRESS]:     300,
    [ETopologyNodeKind.SERVICE]:     150,
    [ETopologyNodeKind.DEPLOYMENT]:  0,
    [ETopologyNodeKind.STATEFULSET]: 0,
    [ETopologyNodeKind.DAEMONSET]:   0,
    [ETopologyNodeKind.REPLICASET]:  0,
    [ETopologyNodeKind.JOB]:         0,
    [ETopologyNodeKind.CRONJOB]:     0,
    [ETopologyNodeKind.POD]:         -150,
}

function recomputeLayout(nodes: Map<string, ITopologyNode>, spacing: number) {
    const byLayer = new Map<number, ITopologyNode[]>()
    nodes.forEach(n => {
        const z = LAYER_Z[n.kind] ?? 0
        if (!byLayer.has(z)) byLayer.set(z, [])
        byLayer.get(z)!.push(n)
    })
    byLayer.forEach((layerNodes, z) => {
        const step = 180 * spacing
        const half = ((layerNodes.length - 1) * step) / 2
        layerNodes.forEach((n, i) => {
            n.x = i * step - half
            n.y = 0
            n.z = z
        })
    })
}

// ── Channel class ─────────────────────────────────────────────────────────────

export class TopologyChannel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps>   = TopologySetup
    TabContent:  FC<IContentProps> = TopologyTabContent
    channelId = 'topology'

    requirements: IChannelRequirements = {
        accessString:  true,
        clusterUrl:    true,
        clusterInfo:   true,
        exit:          false,
        frontChannels: false,
        metrics:       false,
        notifications: false,
        notifier:      true,
        setup:         true,
        settings:      false,
        palette:       false,
        userSettings:  false,
        webSocket:     true,
    }

    getScope() { return EInstanceConfigScope.VIEW }
    getChannelIcon(): JSX.Element { return TopologyIcon }

    getSetupVisibility(): boolean   { return this.setupVisible }
    setSetupVisibility(v: boolean)  { this.setupVisible = v }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let action = EChannelRefreshAction.NONE
        const data: ITopologyData    = channelObject.data
        const cfg:  ITopologyConfig  = channelObject.config

        let msg: ITopologyWsMessage
        try {
            msg = JSON.parse(wsEvent.data)
        } catch {
            console.warn('[TopologyChannel] unparseable message', wsEvent.data)
            return { action }
        }

        switch (msg.type) {
            case EInstanceMessageType.DATA: {
                const topoAction = msg.topoAction ?? 'ADDED'

                // Visibility filter
                if (!this.isVisible(msg.kind, cfg)) break
                if (cfg.showOnlyRunning && msg.status !== ETopologyNodeStatus.RUNNING && topoAction !== 'DELETED') break

                if (topoAction === 'DELETED') {
                    data.nodes.delete(msg.uid)
                } else {
                    const existing = data.nodes.get(msg.uid)
                    const node: ITopologyNode = {
                        uid:           msg.uid,
                        name:          msg.name,
                        namespace:     msg.namespace,
                        kind:          msg.kind,
                        status:        msg.status ?? ETopologyNodeStatus.UNKNOWN,
                        labels:        msg.labels ?? {},
                        annotations:   msg.annotations,
                        replicas:      msg.replicas,
                        readyReplicas: msg.readyReplicas,
                        image:         msg.image,
                        ports:         msg.ports,
                        host:          msg.host,
                        edges:         msg.edges,
                        // keep existing position so nodes don't jump on modify
                        x: existing?.x ?? 0,
                        y: existing?.y ?? 0,
                        z: existing?.z ?? (LAYER_Z[msg.kind] ?? 0),
                    }
                    data.nodes.set(msg.uid, node)
                }

                recomputeLayout(data.nodes, cfg.nodeSpacingFactor)
                data.lastUpdated = Date.now()
                action = EChannelRefreshAction.REFRESH
                break
            }

            case EInstanceMessageType.SIGNAL: {
                const iMsg = msg as unknown as IInstanceMessage
                if (iMsg.flow === EInstanceMessageFlow.RESPONSE && iMsg.action === EInstanceMessageAction.START) {
                    if ((iMsg as any).instance) {
                        channelObject.instanceId = (iMsg as any).instance
                        data.loading = false
                        action = EChannelRefreshAction.REFRESH
                    } else {
                        const sig = msg as unknown as ISignalMessage
                        channelObject.notify?.('topology', ENotifyLevel.ERROR, sig.text ?? 'Start failed')
                    }
                } else if (iMsg.flow === EInstanceMessageFlow.RESPONSE && iMsg.action === EInstanceMessageAction.RECONNECT) {
                    data.error = undefined
                    action = EChannelRefreshAction.REFRESH
                }
                break
            }

            default:
                console.log('[TopologyChannel] unknown message type', msg)
        }

        return { action }
    }

    async initChannel(channelObject: IChannelObject): Promise<boolean> {
        channelObject.data           = new TopologyData()
        channelObject.instanceConfig = new TopologyInstanceConfig()
        channelObject.config         = new TopologyConfig()
        return false
    }

    startChannel(channelObject: IChannelObject): boolean {
        const data: ITopologyData = channelObject.data
        data.nodes.clear()
        data.loading = true
        data.error   = undefined
        data.lastUpdated = 0
        return true
    }

    pauseChannel(_channelObject: IChannelObject): boolean  { return false }
    continueChannel(_channelObject: IChannelObject): boolean { return true }

    stopChannel(channelObject: IChannelObject): boolean {
        const data: ITopologyData = channelObject.data
        data.loading = false
        return true
    }

    socketDisconnected(channelObject: IChannelObject): boolean {
        const data: ITopologyData = channelObject.data
        data.error = '*** Lost connection ***'
        return true
    }

    socketReconnect(_channelObject: IChannelObject): boolean { return false }

    private isVisible(kind: ETopologyNodeKind, cfg: ITopologyConfig): boolean {
        switch (kind) {
            case ETopologyNodeKind.INGRESS:     return cfg.showIngresses
            case ETopologyNodeKind.SERVICE:     return cfg.showServices
            case ETopologyNodeKind.DEPLOYMENT:  return cfg.showDeployments
            case ETopologyNodeKind.STATEFULSET: return cfg.showStatefulSets
            case ETopologyNodeKind.DAEMONSET:   return cfg.showDaemonSets
            case ETopologyNodeKind.JOB:         return cfg.showJobs
            case ETopologyNodeKind.CRONJOB:     return cfg.showCronJobs
            case ETopologyNodeKind.POD:         return cfg.showPods
            default:                            return true
        }
    }
}
