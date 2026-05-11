import { ETopologyNodeKind, ITopologyNode } from './TopologyData'

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

const TOP_CONTROLLER_KINDS = new Set([
    ETopologyNodeKind.DEPLOYMENT,
    ETopologyNodeKind.STATEFULSET,
    ETopologyNodeKind.DAEMONSET,
    ETopologyNodeKind.CRONJOB,
])

const MID_CONTROLLER_KINDS = new Set([
    ETopologyNodeKind.REPLICASET,
    ETopologyNodeKind.JOB,
])

const SPACING = 180

function placeGrid(items: ITopologyNode[], z: number, sf: number, cols: number, originX: number = 0, originY: number = 0): void {
    if (items.length === 0) return
    const stepX = SPACING * sf
    const stepY = SPACING * sf * 1.1
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

function placeContainers(containers: ITopologyNode[], allNodes: Map<string, ITopologyNode>, stepX: number): void {
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

export function recomputeLayout(nodes: Map<string, ITopologyNode>, spacing: number, cols: number = 8): void {
    const sf = spacing
    const topCtrls: ITopologyNode[] = []
    const midCtrls: ITopologyNode[] = []
    const pods: ITopologyNode[] = []
    const containers: ITopologyNode[] = []
    const pvcs: ITopologyNode[] = []
    const services: ITopologyNode[] = []
    const ingresses: ITopologyNode[] = []
    const others: ITopologyNode[] = []

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

    placeGrid(topCtrls, LAYER_Z[ETopologyNodeKind.DEPLOYMENT], sf, cols)

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
    const sortedMidCtrls: ITopologyNode[] = []
    topCtrls.forEach(tc => sortedMidCtrls.push(...(midByTop.get(tc.uid) ?? [])))
    sortedMidCtrls.push(...orphanMid)
    placeGrid(sortedMidCtrls, LAYER_Z[ETopologyNodeKind.REPLICASET], sf, cols)

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
    const sortedPods: ITopologyNode[] = []
    topCtrls.forEach(tc => {
        ;(midByTop.get(tc.uid) ?? []).forEach(mid => sortedPods.push(...(podsByCtrl.get(mid.uid) ?? [])))
        sortedPods.push(...(podsByCtrl.get(tc.uid) ?? []))
    })
    sortedPods.push(...orphanPods)
    placeGrid(sortedPods, LAYER_Z[ETopologyNodeKind.POD], sf, cols)

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
    if (orphanPvcs.length > 0) placeGrid(orphanPvcs, LAYER_Z[ETopologyNodeKind.PERSISTENTVOLUMECLAIM], sf, cols)

    placeContainers(containers, nodes, SPACING * sf)
    placeGrid(services, LAYER_Z[ETopologyNodeKind.SERVICE], sf, cols)
    placeGrid(ingresses, LAYER_Z[ETopologyNodeKind.INGRESS], sf, cols)
    others.forEach((n, i) => { n.x = i * SPACING * sf; n.y = 0; n.z = LAYER_Z[n.kind] ?? 0 })
}
