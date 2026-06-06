import { FC, ReactNode } from 'react'
import {
    EChannelRefreshAction,
    EInstanceConfigScope,
    EInstanceConfigView,
    EInstanceMessageAction,
    EInstanceMessageFlow,
    EInstanceMessageType,
    ENotifyLevel,
    IChannelMessageAction,
    IChannelRequirements,
    IInstanceMessage,
    ISignalMessage,
} from '@kwirthmagnify/kwirth-common'
import { getTopologyExternalHelpContent } from './TopologyMagnify'
import { TopologyIcon, TopologySetup } from './TopologySetup'
import { TopologyTabContent } from './TopologyTabContent'
import { TopologyData, ITopologyData, ITopologyNode, ETopologyNodeKind, ETopologyNodeStatus } from './TopologyData'
import { TopologyConfig, TopologyInstanceConfig, ITopologyConfig, ITopologyInstanceConfig } from './TopologyConfig'
import { IChannel, IChannelObject, IContentProps, ISetupProps } from '@kwirthmagnify/kwirth-common-front'

interface ITopologyWsMessage {
    type:        EInstanceMessageType
    action?:     EInstanceMessageAction
    flow?:       EInstanceMessageFlow
    instance?:   string
    topoAction?: 'ADDED' | 'MODIFIED' | 'DELETED' | 'ENDPOINTS_RESULT' | 'INGRESS_RULES_RESULT'
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
    storageClass?: string
    capacity?:    string
    accessModes?: string[]
    edges?:       Array<{ targetUid: string; label?: string }>
    ownerUids?:   string[]
    containers?:  string[]
    text?:        string
    level?:       string
    responseData?: any
}

// ── Layer Z positions ─────────────────────────────────────────────────────────
// Ingress (top) → Service → Controllers → Pods → PVCs (bottom)

const LAYER_Z: Record<ETopologyNodeKind, number> = {
    [ETopologyNodeKind.INGRESS]:               300,
    [ETopologyNodeKind.SERVICE]:               150,
    [ETopologyNodeKind.DEPLOYMENT]:            0,
    [ETopologyNodeKind.STATEFULSET]:           0,
    [ETopologyNodeKind.DAEMONSET]:             0,
    [ETopologyNodeKind.CRONJOB]:               0,
    [ETopologyNodeKind.REPLICASET]:            -75,
    [ETopologyNodeKind.JOB]:                   -75,
    [ETopologyNodeKind.POD]:                   -150,
    [ETopologyNodeKind.CONTAINER]:             -225,
    [ETopologyNodeKind.PERSISTENTVOLUMECLAIM]: -300,
}

// Top-level controllers (own ReplicaSets/Jobs or Pods directly)
const TOP_CONTROLLER_KINDS = new Set([
    ETopologyNodeKind.DEPLOYMENT,
    ETopologyNodeKind.STATEFULSET,
    ETopologyNodeKind.DAEMONSET,
    ETopologyNodeKind.CRONJOB,
])

// Intermediate controllers (owned by top-level, own Pods)
const MID_CONTROLLER_KINDS = new Set([
    ETopologyNodeKind.REPLICASET,
    ETopologyNodeKind.JOB,
])


const SPACING = 180

/**
 * Place a list of nodes in a 2-D grid centred at (originX, 0, z).
 * cols controls the max number of columns; rows expand downward (negative Y).
 */
function placeGrid(
    items:   ITopologyNode[],
    z:       number,
    sf:      number,
    cols:    number,
    originX: number = 0,
    originY: number = 0,
): void {
    if (items.length === 0) return
    const stepX = SPACING * sf
    const stepY = SPACING * sf * 1.1   // slightly more vertical gap
    const effectiveCols = Math.min(cols, items.length)
    const totalW = (effectiveCols - 1) * stepX
    items.forEach((n, i) => {
        const col = i % effectiveCols
        const row = Math.floor(i / effectiveCols)
        n.x = originX + col * stepX - totalW / 2
        n.y = originY - row * stepY
        n.z = z
    })
}

function placeContainers(
    containers: ITopologyNode[],
    allNodes:   Map<string, ITopologyNode>,
    stepX:      number,
): void {
    const containersByPod = new Map<string, ITopologyNode[]>()
    containers.forEach(container => {
        const podUid = container.ownerUids?.[0]
        if (!podUid) return
        if (!containersByPod.has(podUid)) containersByPod.set(podUid, [])
        containersByPod.get(podUid)!.push(container)
    })
    containersByPod.forEach((podContainers, podUid) => {
        const pod = allNodes.get(podUid)
        if (!pod) return
        const subStep = stepX * 0.5
        const total = podContainers.length
        podContainers.forEach((c, i) => {
            c.x = pod.x + (i - (total - 1) / 2) * subStep
            c.y = pod.y - stepX * 0.55
            c.z = LAYER_Z[ETopologyNodeKind.CONTAINER]
        })
    })
}

/**
 * Hierarchical layout:
 *
 * Controllers layer (z=0):
 *   — placed in a grid (cols = cfg.gridColumns)
 *   — each controller "owns" a column band
 *
 * Pods layer (z=-150):
 *   — pods are grouped under their owning controller
 *   — within each group they form a sub-grid, centred on the controller's X
 *   — orphan pods go in their own grid to the right
 *
 * PVCs layer (z=-300):
 *   — aligned under pods of the same namespace, in a sub-grid per namespace
 *   — orphans centred independently
 *
 * Services / Ingresses: each in their own centred grid
 */
export function recomputeLayout(
    nodes:   Map<string, ITopologyNode>,
    spacing: number,
    cols:    number = 8,
): void {
    const sf = spacing

    const topCtrls:   ITopologyNode[] = []
    const midCtrls:   ITopologyNode[] = []
    const pods:       ITopologyNode[] = []
    const containers: ITopologyNode[] = []
    const pvcs:       ITopologyNode[] = []
    const services:   ITopologyNode[] = []
    const ingresses:  ITopologyNode[] = []
    const others:     ITopologyNode[] = []

    nodes.forEach(n => {
        if (TOP_CONTROLLER_KINDS.has(n.kind))                        topCtrls.push(n)
        else if (MID_CONTROLLER_KINDS.has(n.kind))                   midCtrls.push(n)
        else if (n.kind === ETopologyNodeKind.POD)                   pods.push(n)
        else if (n.kind === ETopologyNodeKind.CONTAINER)             containers.push(n)
        else if (n.kind === ETopologyNodeKind.PERSISTENTVOLUMECLAIM) pvcs.push(n)
        else if (n.kind === ETopologyNodeKind.SERVICE)               services.push(n)
        else if (n.kind === ETopologyNodeKind.INGRESS)               ingresses.push(n)
        else                                                         others.push(n)
    })

    // ── 1. Top controllers (Deployment, StatefulSet, DaemonSet, CronJob) ──────
    placeGrid(topCtrls, LAYER_Z[ETopologyNodeKind.DEPLOYMENT], sf, cols)

    // ── 2. Mid controllers (ReplicaSet, Job) grouped under their top owner ────
    const topCtrlByUid = new Map<string, ITopologyNode>()
    topCtrls.forEach(c => topCtrlByUid.set(c.uid, c))

    const midByTop = new Map<string, ITopologyNode[]>()
    const orphanMid: ITopologyNode[] = []

    midCtrls.forEach(mc => {
        const ownerUid = (mc.ownerUids ?? []).find(u => topCtrlByUid.has(u))
        if (ownerUid) {
            if (!midByTop.has(ownerUid)) midByTop.set(ownerUid, [])
            midByTop.get(ownerUid)!.push(mc)
        } else {
            orphanMid.push(mc)
        }
    })

    // Flat grid sorted by parent controller order — RSes near their owner without sub-grid spread
    const sortedMidCtrls: ITopologyNode[] = []
    topCtrls.forEach(tc => sortedMidCtrls.push(...(midByTop.get(tc.uid) ?? [])))
    sortedMidCtrls.push(...orphanMid)
    placeGrid(sortedMidCtrls, LAYER_Z[ETopologyNodeKind.REPLICASET], sf, cols)

    // ── 3. Pods: group by owning mid controller, fall back to top controller ───
    const allCtrlByUid = new Map<string, ITopologyNode>()
    ;[...topCtrls, ...midCtrls].forEach(c => allCtrlByUid.set(c.uid, c))

    const podsByCtrl = new Map<string, ITopologyNode[]>()
    const orphanPods: ITopologyNode[] = []

    pods.forEach(pod => {
        const ownerUid = (pod.ownerUids ?? []).find(u => allCtrlByUid.has(u))
        if (ownerUid) {
            if (!podsByCtrl.has(ownerUid)) podsByCtrl.set(ownerUid, [])
            podsByCtrl.get(ownerUid)!.push(pod)
        } else {
            orphanPods.push(pod)
        }
    })

    // Flat grid sorted by grandparent→parent order — pods near their controller without sub-grid spread
    const sortedPods: ITopologyNode[] = []
    topCtrls.forEach(tc => {
        ;(midByTop.get(tc.uid) ?? []).forEach(mid => sortedPods.push(...(podsByCtrl.get(mid.uid) ?? [])))
        sortedPods.push(...(podsByCtrl.get(tc.uid) ?? []))
    })
    sortedPods.push(...orphanPods)
    placeGrid(sortedPods, LAYER_Z[ETopologyNodeKind.POD], sf, cols)

    // ── 3. PVCs: group by namespace, align under that namespace's pods ─────────
    const podsByNs = new Map<string, ITopologyNode[]>()
    pods.forEach(pod => {
        if (!podsByNs.has(pod.namespace)) podsByNs.set(pod.namespace, [])
        podsByNs.get(pod.namespace)!.push(pod)
    })

    const pvcsByNs = new Map<string, ITopologyNode[]>()
    const orphanPvcs: ITopologyNode[] = []

    pvcs.forEach(pvc => {
        if (podsByNs.has(pvc.namespace)) {
            if (!pvcsByNs.has(pvc.namespace)) pvcsByNs.set(pvc.namespace, [])
            pvcsByNs.get(pvc.namespace)!.push(pvc)
        } else {
            orphanPvcs.push(pvc)
        }
    })

    pvcsByNs.forEach((nsPvcs, ns) => {
        const nsPods = podsByNs.get(ns)!
        const avgX = nsPods.reduce((s, p) => s + p.x, 0) / nsPods.length
        placeGrid(nsPvcs, LAYER_Z[ETopologyNodeKind.PERSISTENTVOLUMECLAIM], sf, cols, avgX)
    })

    if (orphanPvcs.length > 0) {
        placeGrid(orphanPvcs, LAYER_Z[ETopologyNodeKind.PERSISTENTVOLUMECLAIM], sf, cols)
    }

    // ── 4. Containers: grouped under their parent pod ─────────────────────────
    placeContainers(containers, nodes, SPACING * sf)

    // ── 5. Services ───────────────────────────────────────────────────────────
    placeGrid(services, LAYER_Z[ETopologyNodeKind.SERVICE], sf, cols)

    // ── 6. Ingresses ──────────────────────────────────────────────────────────
    placeGrid(ingresses, LAYER_Z[ETopologyNodeKind.INGRESS], sf, cols)

    // ── 7. Others ─────────────────────────────────────────────────────────────
    others.forEach((n, i) => {
        n.x = i * SPACING * sf
        n.y = 0
        n.z = LAYER_Z[n.kind] ?? 0
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
        backChannels:  false,
    }

    getScope() { return EInstanceConfigScope.VIEW }
    getChannelIcon(): JSX.Element { return TopologyIcon }

    getSetupVisibility(): boolean   { return this.setupVisible }
    setSetupVisibility(v: boolean)  { this.setupVisible = v }

    processChannelMessage(channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction {
        let action = EChannelRefreshAction.NONE
        const data: ITopologyData   = channelObject.data
        const cfg:  ITopologyConfig = channelObject.config ?? new TopologyConfig()

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

                if (topoAction === 'ENDPOINTS_RESULT' || topoAction === 'INGRESS_RULES_RESULT') {
                    console.log('[topology] received', topoAction, msg.name, (msg as any).responseData)
                    data.infoResult = {
                        kind:      topoAction === 'ENDPOINTS_RESULT' ? 'endpoints' : 'ingress-rules',
                        name:      msg.name,
                        namespace: msg.namespace,
                        data:      msg.responseData,
                    }
                    data.lastUpdated = Date.now()
                    action = EChannelRefreshAction.REFRESH
                    break
                }

                if (!this.isVisible(msg.kind, cfg)) break
                if (cfg.showOnlyRunning && msg.status !== ETopologyNodeStatus.RUNNING && topoAction !== 'DELETED') break

                if (msg.kind === ETopologyNodeKind.REPLICASET && topoAction !== 'DELETED' &&
                    (msg.replicas ?? 0) === 0 && (msg.readyReplicas ?? 0) === 0) {
                    if (data.nodes.delete(msg.uid)) {
                        recomputeLayout(data.nodes, cfg.nodeSpacingFactor, cfg.gridColumns)
                        data.lastUpdated = Date.now()
                        action = EChannelRefreshAction.REFRESH
                    }
                    break
                }

                if (topoAction === 'DELETED') {
                    data.nodes.delete(msg.uid)
                    if (msg.kind === ETopologyNodeKind.POD) {
                        const prefix = `${msg.uid}/container/`
                        data.nodes.forEach((_, uid) => { if (uid.startsWith(prefix)) data.nodes.delete(uid) })
                    }
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
                        containers:    msg.containers,
                        ports:         msg.ports,
                        host:          msg.host,
                        storageClass:  msg.storageClass,
                        capacity:      msg.capacity,
                        accessModes:   msg.accessModes,
                        edges:         msg.edges,
                        ownerUids:     msg.ownerUids,
                        x: existing?.x ?? 0,
                        y: existing?.y ?? 0,
                        z: existing?.z ?? (LAYER_Z[msg.kind] ?? 0),
                    }
                    data.nodes.set(msg.uid, node)

                    if (msg.kind === ETopologyNodeKind.POD && msg.containers && msg.containers.length > 0) {
                        const prefix = `${msg.uid}/container/`
                        data.nodes.forEach((_, uid) => { if (uid.startsWith(prefix)) data.nodes.delete(uid) })
                        msg.containers.forEach(containerName => {
                            const containerUid = `${msg.uid}/container/${containerName}`
                            const existingContainer = data.nodes.get(containerUid)
                            const containerNode: ITopologyNode = {
                                uid:       containerUid,
                                name:      containerName,
                                namespace: msg.namespace,
                                kind:      ETopologyNodeKind.CONTAINER,
                                status:    msg.status ?? ETopologyNodeStatus.UNKNOWN,
                                labels:    {},
                                ownerUids: [msg.uid],
                                podName:   msg.name,
                                x: existingContainer?.x ?? node.x,
                                y: existingContainer?.y ?? node.y,
                                z: existingContainer?.z ?? LAYER_Z[ETopologyNodeKind.CONTAINER],
                            }
                            data.nodes.set(containerUid, containerNode)
                        })
                    }
                }

                recomputeLayout(data.nodes, cfg.nodeSpacingFactor, cfg.gridColumns)
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

    prepareExternalChannel(view: EInstanceConfigView, selectedResources: any[], _container: string): { data: any; config: any; instanceConfig: any; formConfig: any } {
        const instanceConfig: ITopologyInstanceConfig = {}
        if (view === EInstanceConfigView.POD && selectedResources.length > 0) {
            instanceConfig.pods = selectedResources.map((f: any) => f.data.origin.metadata.name as string)
        } else if (view === EInstanceConfigView.GROUP && selectedResources.length > 0) {
            const kind = selectedResources[0]?.data?.origin?.kind as string
            if (kind === 'Service')      instanceConfig.services  = selectedResources.map((f: any) => f.data.origin.metadata.name as string)
            else if (kind === 'Ingress') instanceConfig.ingresses = selectedResources.map((f: any) => f.data.origin.metadata.name as string)
            else                         instanceConfig.groups    = selectedResources.map((f: any) => `${f.data.origin.kind}/${f.data.origin.metadata.name}`)
        }
        const config = new TopologyConfig()
        return {
            data: new TopologyData(),
            config,
            instanceConfig,
            formConfig: {
                showOnlyRunning:   config.showOnlyRunning,
                labelSize:         config.labelSize,
                nodeSpacingFactor: config.nodeSpacingFactor,
                gridColumns:       config.gridColumns,
            },
        }
    }

    getExternalHelpContent(): ReactNode {
        return getTopologyExternalHelpContent()
    }

    onExternalConfigApply(channelObject: IChannelObject, values: any): boolean {
        const cfg  = channelObject.config as ITopologyConfig
        cfg.showOnlyRunning   = values.showOnlyRunning
        cfg.labelSize         = values.labelSize
        cfg.nodeSpacingFactor = values.nodeSpacingFactor
        cfg.gridColumns       = values.gridColumns
        const data = channelObject.data as ITopologyData
        recomputeLayout(data.nodes, cfg.nodeSpacingFactor, cfg.gridColumns)
        data.lastUpdated = Date.now()
        return true
    }

    private isVisible(kind: ETopologyNodeKind, cfg: ITopologyConfig): boolean {
        switch (kind) {
            case ETopologyNodeKind.INGRESS:              return cfg.showIngresses
            case ETopologyNodeKind.SERVICE:              return cfg.showServices
            case ETopologyNodeKind.DEPLOYMENT:           return cfg.showDeployments
            case ETopologyNodeKind.STATEFULSET:          return cfg.showStatefulSets
            case ETopologyNodeKind.DAEMONSET:            return cfg.showDaemonSets
            case ETopologyNodeKind.JOB:                  return cfg.showJobs
            case ETopologyNodeKind.CRONJOB:              return cfg.showCronJobs
            case ETopologyNodeKind.POD:                  return cfg.showPods
            case ETopologyNodeKind.CONTAINER:            return cfg.showPods
            case ETopologyNodeKind.PERSISTENTVOLUMECLAIM: return cfg.showPvcs
            default:                                     return true
        }
    }
}
