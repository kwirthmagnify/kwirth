import {
    BackChannelData,
    EClusterType,
    EInstanceMessageAction,
    EInstanceMessageFlow,
    EInstanceMessageType,
    ESignalMessageLevel,
    IInstanceConfig,
    IInstanceConfigResponse,
    IInstanceMessage,
    ISignalMessage,
} from '@kwirthmagnify/kwirth-common'
import { Request, Response } from 'express'
import { ClusterInfo } from '../../model/ClusterInfo'
import { IBackChannelObject, IBackChannelRequirements, IChannel } from '../IChannel'
import {
    V1CronJob, V1DaemonSet, V1Deployment, V1Ingress,
    V1Job, V1PersistentVolumeClaim, V1Pod, V1ReplicaSet, V1Service, V1StatefulSet,
} from '@kubernetes/client-node'
import { ELogComponent, logInfo } from '../../tools/Logging'

type TNodeKind   = 'Ingress' | 'Service' | 'Deployment' | 'StatefulSet' | 'DaemonSet' | 'ReplicaSet' | 'Job' | 'CronJob' | 'Pod' | 'PersistentVolumeClaim'
type TNodeStatus = 'Running' | 'Pending' | 'Failed' | 'Succeeded' | 'Unknown' | 'Terminating' | 'Bound' | 'Released' | 'Lost'
type TTopoAction = 'ADDED' | 'MODIFIED' | 'DELETED'

interface ITopologyWsMessage {
    action:   EInstanceMessageAction
    flow:     EInstanceMessageFlow
    channel:  string
    instance: string
    type:     EInstanceMessageType
    topoAction?:    TTopoAction
    kind:           TNodeKind
    uid:            string
    name:           string
    namespace:      string
    status:         TNodeStatus
    labels:         Record<string, string>
    annotations?:   Record<string, string>
    replicas?:      number
    readyReplicas?: number
    image?:         string
    ports?:         number[]
    host?:          string
    storageClass?:  string
    capacity?:      string
    accessModes?:   string[]
    edges?:         Array<{ targetUid: string; label?: string }>
    ownerUids?:     string[]
}

interface ITopologyInstance {
    instanceId: string
    namespace:  string
    paused:     boolean
}

interface ISocketEntry {
    ws:          WebSocket
    lastRefresh: number
    instances:   ITopologyInstance[]
}

function podStatus(p: V1Pod): TNodeStatus {
    if (p.metadata?.deletionTimestamp) return 'Terminating'
    switch (p.status?.phase) {
        case 'Running':   return 'Running'
        case 'Pending':   return 'Pending'
        case 'Succeeded': return 'Succeeded'
        case 'Failed':    return 'Failed'
        default:          return 'Unknown'
    }
}

function controllerStatus(ready?: number, desired?: number): TNodeStatus {
    if (desired === undefined || desired === 0) return 'Unknown'
    if ((ready ?? 0) >= desired) return 'Running'
    if ((ready ?? 0) > 0)       return 'Pending'
    return 'Failed'
}

function pvcStatus(p: V1PersistentVolumeClaim): TNodeStatus {
    switch (p.status?.phase) {
        case 'Bound':    return 'Bound'
        case 'Pending':  return 'Pending'
        case 'Released': return 'Released'
        case 'Lost':     return 'Lost'
        default:         return 'Unknown'
    }
}

export class TopologyChannel implements IChannel {
    readonly channelId = 'topology'
    readonly requirements: IBackChannelRequirements = {
        storage: false,
        providers: ['events']
    }

    private clusterInfo:       ClusterInfo
    private backChannelObject: IBackChannelObject
    private webSockets:        ISocketEntry[] = []
    private serviceCache = new Map<string, V1Service>()
    private pvcCache     = new Map<string, V1PersistentVolumeClaim>()

    constructor(clusterInfo: ClusterInfo, backChannelObject: IBackChannelObject) {
        this.clusterInfo       = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData(): BackChannelData {
        return {
            id:            'topology',
            routable:      false,
            pauseable:     false,
            modifiable:    false,
            reconnectable: true,
            metrics:       false,
            sources:       [EClusterType.KUBERNETES],
            endpoints:     [],
            websocket:     false,
            cluster:       true,
        }
    }

    getChannelScopeLevel(scope: string): number {
        return ['', 'filter', 'view', 'cluster'].indexOf(scope)
    }

    startChannel = async (): Promise<void> => {
        this.clusterInfo.addSubscriber('events', this, {
            kinds: ['Pod', 'Service', 'Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob', 'Ingress', 'PersistentVolumeClaim'],
            syncInstances: false
        })
        logInfo(ELogComponent.CHANNEL, '[TopologyChannel] subscribed to events provider')
    }

    processProviderEvent(providerId: string, obj: any): void {
        if (providerId !== 'events') return

        const type: TTopoAction = obj.type as TTopoAction
        const resource = obj.obj

        if (resource.kind === 'Service') {
            if (type === 'DELETED') this.serviceCache.delete(resource.metadata?.uid ?? '')
            else if (resource.metadata?.uid) this.serviceCache.set(resource.metadata.uid, resource as V1Service)
        }
        if (resource.kind === 'PersistentVolumeClaim') {
            if (type === 'DELETED') this.pvcCache.delete(resource.metadata?.uid ?? '')
            else if (resource.metadata?.uid) this.pvcCache.set(resource.metadata.uid, resource as V1PersistentVolumeClaim)
        }

        const mapped = this.mapResource(resource)
        if (!mapped) return

        if (type !== 'DELETED') {
            const svcList = Array.from(this.serviceCache.values())
            const edges = this.computeEdges(resource, svcList)
            if (edges.length > 0) mapped.edges = edges
        }

        for (const entry of this.webSockets) {
            for (const inst of entry.instances) {
                if (inst.paused) continue
                const ns = resource.metadata?.namespace
                if (inst.namespace !== '*all' && inst.namespace !== ns) continue
                this.emit(entry.ws, inst, mapped as ITopologyWsMessage, type)
            }
        }
    }

    async endpointRequest(_e: string, _req: Request, _res: Response): Promise<void> {}
    async websocketRequest(_ws: WebSocket): Promise<void> {}

    async processCommand(ws: WebSocket, msg: IInstanceMessage): Promise<boolean> {
        const m = msg as any
        try {
            switch (m.topoAction) {
                case 'SCALE':
                    await this.doScale(ws, msg, m.kind, m.namespace, m.name, m.replicas ?? 0)
                    return true
                case 'RESTART':
                    await this.doRestart(ws, msg, m.kind, m.namespace, m.name)
                    return true
                case 'DELETE_POD':
                    await this.clusterInfo.coreApi.deleteNamespacedPod({ name: m.name, namespace: m.namespace })
                    this.sendSignal(ws, msg, ESignalMessageLevel.INFO, `Pod ${m.name} deleted`)
                    return true
                default:
                    return false
            }
        } catch (err: any) {
            this.sendSignal(ws, msg, ESignalMessageLevel.ERROR, err?.message ?? String(err))
            return false
        }
    }

    addObject = async (ws: WebSocket, instanceConfig: IInstanceConfig): Promise<boolean> => {
        try {
            let entry = this.webSockets.find(s => s.ws === ws)
            if (!entry) {
                this.webSockets.push({ ws, lastRefresh: Date.now(), instances: [] })
                entry = this.webSockets[this.webSockets.length - 1]
            }
            if (entry.instances.some(i => i.instanceId === instanceConfig.instance)) return true
            const namespace = (instanceConfig.data as any)?.namespace ?? '*all'
            const inst: ITopologyInstance = { instanceId: instanceConfig.instance, namespace, paused: false }
            entry.instances.push(inst)
            await this.sendSnapshot(ws, inst, instanceConfig)
        } catch (err: any) {
            this.sendSignal(ws, instanceConfig as any, ESignalMessageLevel.ERROR, err?.message ?? String(err))
        }
        return true
    }

    deleteObject = async (): Promise<boolean> => false

    containsAsset  = (): boolean => false
    containsInstance(instanceId: string): boolean {
        return this.webSockets.some(s => s.instances.some(i => i.instanceId === instanceId))
    }
    containsConnection(ws: WebSocket): boolean {
        return this.webSockets.some(s => s.ws === ws)
    }
    removeConnection(ws: WebSocket): void {
        this.webSockets = this.webSockets.filter(s => s.ws !== ws)
    }
    refreshConnection(ws: WebSocket): boolean {
        const entry = this.webSockets.find(s => s.ws === ws)
        if (entry) { entry.lastRefresh = Date.now(); return true }
        return false
    }
    updateConnection(ws: WebSocket, instanceId: string): boolean {
        return this.webSockets.some(s => s.ws === ws && s.instances.some(i => i.instanceId === instanceId))
    }

    pauseContinueInstance(ws: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void {
        const inst = this.findInstance(ws, instanceConfig.instance)
        if (!inst) return
        inst.paused = action === EInstanceMessageAction.PAUSE
        this.sendInstanceConfig(ws, action, EInstanceMessageFlow.RESPONSE, instanceConfig,
            inst.paused ? 'Topology paused' : 'Topology resumed')
    }

    modifyInstance(): void {}

    stopInstance(ws: WebSocket, instanceConfig: IInstanceConfig): void {
        const entry = this.webSockets.find(s => s.ws === ws)
        if (!entry) return
        entry.instances = entry.instances.filter(i => i.instanceId !== instanceConfig.instance)
        this.sendInstanceConfig(ws, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, instanceConfig, 'Topology stopped')
    }

    removeInstance(ws: WebSocket, instanceId: string): void {
        const entry = this.webSockets.find(s => s.ws === ws)
        if (!entry) return
        entry.instances = entry.instances.filter(i => i.instanceId !== instanceId)
    }

    private async sendSnapshot(ws: WebSocket, inst: ITopologyInstance, instanceConfig: IInstanceConfig): Promise<void> {
        const all = inst.namespace === '*all'
        const ns  = inst.namespace

        const [pods, svcs, deps, sts, ds, rs, jobs, crons, ings, pvcs] = await Promise.allSettled([
            all ? this.clusterInfo.coreApi.listPodForAllNamespaces()                   : this.clusterInfo.coreApi.listNamespacedPod({ namespace: ns }),
            all ? this.clusterInfo.coreApi.listServiceForAllNamespaces()               : this.clusterInfo.coreApi.listNamespacedService({ namespace: ns }),
            all ? this.clusterInfo.appsApi.listDeploymentForAllNamespaces()            : this.clusterInfo.appsApi.listNamespacedDeployment({ namespace: ns }),
            all ? this.clusterInfo.appsApi.listStatefulSetForAllNamespaces()           : this.clusterInfo.appsApi.listNamespacedStatefulSet({ namespace: ns }),
            all ? this.clusterInfo.appsApi.listDaemonSetForAllNamespaces()             : this.clusterInfo.appsApi.listNamespacedDaemonSet({ namespace: ns }),
            all ? this.clusterInfo.appsApi.listReplicaSetForAllNamespaces()            : this.clusterInfo.appsApi.listNamespacedReplicaSet({ namespace: ns }),
            all ? this.clusterInfo.batchApi.listJobForAllNamespaces()                  : this.clusterInfo.batchApi.listNamespacedJob({ namespace: ns }),
            all ? this.clusterInfo.batchApi.listCronJobForAllNamespaces()              : this.clusterInfo.batchApi.listNamespacedCronJob({ namespace: ns }),
            all ? this.clusterInfo.networkApi.listIngressForAllNamespaces()            : this.clusterInfo.networkApi.listNamespacedIngress({ namespace: ns }),
            all ? this.clusterInfo.coreApi.listPersistentVolumeClaimForAllNamespaces() : this.clusterInfo.coreApi.listNamespacedPersistentVolumeClaim({ namespace: ns }),
        ])

        const svcList = svcs.status === 'fulfilled' ? svcs.value.items : []
        const pvcList = pvcs.status === 'fulfilled' ? pvcs.value.items : []

        svcList.forEach(s => { if (s.metadata?.uid) this.serviceCache.set(s.metadata.uid, s) })
        pvcList.forEach(p => { if (p.metadata?.uid) this.pvcCache.set(p.metadata.uid, p) })

        svcList.forEach(s => this.emit(ws, inst, this.mapService(s), 'ADDED'))

        if (deps.status  === 'fulfilled') deps.value.items.forEach(d  => this.emit(ws, inst, { ...this.mapDeployment(d),  edges: this.edgesForController(d.spec?.selector?.matchLabels, d.metadata?.namespace, svcList) }, 'ADDED'))
        if (sts.status   === 'fulfilled') sts.value.items.forEach(s   => this.emit(ws, inst, { ...this.mapStatefulSet(s), edges: this.edgesForController(s.spec?.selector?.matchLabels, s.metadata?.namespace, svcList) }, 'ADDED'))
        if (ds.status    === 'fulfilled') ds.value.items.forEach(d    => this.emit(ws, inst, { ...this.mapDaemonSet(d),   edges: this.edgesForController(d.spec?.selector?.matchLabels, d.metadata?.namespace, svcList) }, 'ADDED'))
        if (rs.status    === 'fulfilled') rs.value.items.forEach(r    => this.emit(ws, inst, this.mapReplicaSet(r), 'ADDED'))
        if (jobs.status  === 'fulfilled') jobs.value.items.forEach(j  => this.emit(ws, inst, this.mapJob(j), 'ADDED'))
        if (crons.status === 'fulfilled') crons.value.items.forEach(c => this.emit(ws, inst, this.mapCronJob(c), 'ADDED'))
        if (ings.status  === 'fulfilled') ings.value.items.forEach(i  => this.emit(ws, inst, { ...this.mapIngress(i), edges: this.edgesForIngress(i, svcList) }, 'ADDED'))
        if (pods.status  === 'fulfilled') pods.value.items.forEach(p  => this.emit(ws, inst, this.mapPod(p), 'ADDED'))
        pvcList.forEach(p => this.emit(ws, inst, this.mapPvc(p), 'ADDED'))
    }

    private mapResource(resource: any): Partial<ITopologyWsMessage> | null {
        switch (resource.kind) {
            case 'Pod':                   return this.mapPod(resource as V1Pod)
            case 'Service':               return this.mapService(resource as V1Service)
            case 'Deployment':            return this.mapDeployment(resource as V1Deployment)
            case 'StatefulSet':           return this.mapStatefulSet(resource as V1StatefulSet)
            case 'DaemonSet':             return this.mapDaemonSet(resource as V1DaemonSet)
            case 'ReplicaSet':            return this.mapReplicaSet(resource as V1ReplicaSet)
            case 'Job':                   return this.mapJob(resource as V1Job)
            case 'CronJob':               return this.mapCronJob(resource as V1CronJob)
            case 'Ingress':               return this.mapIngress(resource as V1Ingress)
            case 'PersistentVolumeClaim': return this.mapPvc(resource as V1PersistentVolumeClaim)
            default:                      return null
        }
    }

    private computeEdges(resource: any, svcList: V1Service[]): Array<{ targetUid: string; label: string }> {
        switch (resource.kind) {
            case 'Deployment':
            case 'StatefulSet':
            case 'DaemonSet':
                return this.edgesForController(resource.spec?.selector?.matchLabels, resource.metadata?.namespace, svcList)
            case 'Ingress':
                return this.edgesForIngress(resource as V1Ingress, svcList)
            default:
                return []
        }
    }

    private mapPod(p: V1Pod): Partial<ITopologyWsMessage> {
        return {
            kind: 'Pod', uid: p.metadata?.uid ?? '', name: p.metadata?.name ?? '',
            namespace: p.metadata?.namespace ?? '', status: podStatus(p),
            labels: p.metadata?.labels ?? {},
            image: p.spec?.containers?.[0]?.image,
            ownerUids: p.metadata?.ownerReferences?.map(r => r.uid) ?? [],
        }
    }

    private mapService(s: V1Service): Partial<ITopologyWsMessage> {
        return {
            kind: 'Service', uid: s.metadata?.uid ?? '', name: s.metadata?.name ?? '',
            namespace: s.metadata?.namespace ?? '', status: 'Running',
            labels: s.metadata?.labels ?? {},
            ports: s.spec?.ports?.map(p => p.port) ?? [],
        }
    }

    private mapDeployment(d: V1Deployment): Partial<ITopologyWsMessage> {
        const ready   = d.status?.readyReplicas   ?? 0
        const desired = d.spec?.replicas ?? 0
        const avail   = d.status?.availableReplicas ?? 0
        const status: TNodeStatus = desired === 0 ? 'Unknown' : (ready === desired && avail === desired) ? 'Running' : ready > 0 ? 'Pending' : 'Failed'
        return {
            kind: 'Deployment', uid: d.metadata?.uid ?? '', name: d.metadata?.name ?? '',
            namespace: d.metadata?.namespace ?? '', status, labels: d.metadata?.labels ?? {},
            replicas: desired, readyReplicas: ready,
        }
    }

    private mapStatefulSet(s: V1StatefulSet): Partial<ITopologyWsMessage> {
        return {
            kind: 'StatefulSet', uid: s.metadata?.uid ?? '', name: s.metadata?.name ?? '',
            namespace: s.metadata?.namespace ?? '',
            status: controllerStatus(s.status?.readyReplicas, s.spec?.replicas),
            labels: s.metadata?.labels ?? {},
            replicas: s.spec?.replicas ?? 0, readyReplicas: s.status?.readyReplicas ?? 0,
        }
    }

    private mapDaemonSet(d: V1DaemonSet): Partial<ITopologyWsMessage> {
        return {
            kind: 'DaemonSet', uid: d.metadata?.uid ?? '', name: d.metadata?.name ?? '',
            namespace: d.metadata?.namespace ?? '',
            status: controllerStatus(d.status?.numberReady, d.status?.desiredNumberScheduled),
            labels: d.metadata?.labels ?? {},
            replicas: d.status?.desiredNumberScheduled ?? 0, readyReplicas: d.status?.numberReady ?? 0,
        }
    }

    private mapReplicaSet(r: V1ReplicaSet): Partial<ITopologyWsMessage> {
        return {
            kind: 'ReplicaSet', uid: r.metadata?.uid ?? '', name: r.metadata?.name ?? '',
            namespace: r.metadata?.namespace ?? '',
            status: controllerStatus(r.status?.readyReplicas, r.spec?.replicas),
            labels: r.metadata?.labels ?? {},
            replicas: r.spec?.replicas ?? 0, readyReplicas: r.status?.readyReplicas ?? 0,
        }
    }

    private mapJob(j: V1Job): Partial<ITopologyWsMessage> {
        const status: TNodeStatus = (j.status?.succeeded ?? 0) > 0 ? 'Succeeded' : (j.status?.active ?? 0) > 0 ? 'Running' : 'Unknown'
        return {
            kind: 'Job', uid: j.metadata?.uid ?? '', name: j.metadata?.name ?? '',
            namespace: j.metadata?.namespace ?? '', status, labels: j.metadata?.labels ?? {},
        }
    }

    private mapCronJob(c: V1CronJob): Partial<ITopologyWsMessage> {
        return {
            kind: 'CronJob', uid: c.metadata?.uid ?? '', name: c.metadata?.name ?? '',
            namespace: c.metadata?.namespace ?? '',
            status: (c.status?.active?.length ?? 0) > 0 ? 'Running' : 'Unknown',
            labels: c.metadata?.labels ?? {},
        }
    }

    private mapIngress(i: V1Ingress): Partial<ITopologyWsMessage> {
        return {
            kind: 'Ingress', uid: i.metadata?.uid ?? '', name: i.metadata?.name ?? '',
            namespace: i.metadata?.namespace ?? '', status: 'Running',
            labels: i.metadata?.labels ?? {},
            host: i.spec?.rules?.[0]?.host,
        }
    }

    private mapPvc(p: V1PersistentVolumeClaim): Partial<ITopologyWsMessage> {
        return {
            kind: 'PersistentVolumeClaim', uid: p.metadata?.uid ?? '', name: p.metadata?.name ?? '',
            namespace: p.metadata?.namespace ?? '', status: pvcStatus(p),
            labels: p.metadata?.labels ?? {},
            storageClass: p.spec?.storageClassName,
            capacity: p.status?.capacity?.['storage'],
            accessModes: p.spec?.accessModes,
        }
    }

    private edgesForController(
        matchLabels: Record<string, string> | undefined,
        namespace:   string | undefined,
        services:    V1Service[]
    ): Array<{ targetUid: string; label: string }> {
        if (!matchLabels) return []
        return services
            .filter(s => {
                if (s.metadata?.namespace !== namespace) return false
                const sel = s.spec?.selector ?? {}
                return Object.entries(sel).every(([k, v]) => matchLabels[k] === v)
            })
            .filter(s => !!s.metadata?.uid)
            .map(s => ({ targetUid: s.metadata!.uid!, label: 'exposes' }))
    }

    private edgesForIngress(ingress: V1Ingress, services: V1Service[]): Array<{ targetUid: string; label: string }> {
        const ns = ingress.metadata?.namespace
        const edges: Array<{ targetUid: string; label: string }> = []
        for (const rule of ingress.spec?.rules ?? []) {
            for (const path of rule.http?.paths ?? []) {
                const svcName = path.backend?.service?.name
                const svc     = services.find(s => s.metadata?.namespace === ns && s.metadata?.name === svcName)
                if (svc?.metadata?.uid) edges.push({ targetUid: svc.metadata.uid, label: path.path ?? '/' })
            }
        }
        return edges
    }

    private emit(ws: WebSocket, inst: ITopologyInstance, partial: Partial<ITopologyWsMessage>, topoAction: TTopoAction): void {
        if (inst.paused) return
        const msg: ITopologyWsMessage = {
            action:        EInstanceMessageAction.NONE,
            flow:          EInstanceMessageFlow.UNSOLICITED,
            channel:       'topology',
            instance:      inst.instanceId,
            type:          EInstanceMessageType.DATA,
            topoAction,
            kind:          partial.kind!,
            uid:           partial.uid!,
            name:          partial.name!,
            namespace:     partial.namespace!,
            status:        partial.status!,
            labels:        partial.labels ?? {},
            annotations:   partial.annotations,
            replicas:      partial.replicas,
            readyReplicas: partial.readyReplicas,
            image:         partial.image,
            ports:         partial.ports,
            host:          partial.host,
            storageClass:  partial.storageClass,
            capacity:      partial.capacity,
            accessModes:   partial.accessModes,
            edges:         partial.edges,
            ownerUids:     partial.ownerUids,
        }
        try { ws.send(JSON.stringify(msg)) }
        catch (err) { console.warn('[TopologyChannel] send error', err) }
    }

    private sendInstanceConfig(ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, cfg: IInstanceConfig, text: string): void {
        const resp: IInstanceConfigResponse = {
            action, flow, channel: 'topology' as any, instance: cfg.instance, type: EInstanceMessageType.SIGNAL, text,
        }
        try { ws.send(JSON.stringify(resp)) }
        catch (err) { console.warn('[TopologyChannel] sendInstanceConfig error', err) }
    }

    private sendSignal(ws: WebSocket, msg: IInstanceMessage, level: ESignalMessageLevel, text: string): void {
        const sig: ISignalMessage = {
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.RESPONSE, level,
            channel: 'topology' as any, instance: msg.instance, type: EInstanceMessageType.SIGNAL, text,
        }
        try { ws.send(JSON.stringify(sig)) }
        catch (err) { console.warn('[TopologyChannel] sendSignal error', err) }
    }

    private async doScale(ws: WebSocket, msg: IInstanceMessage, kind: string, ns: string, name: string, replicas: number): Promise<void> {
        const patch = [{ op: 'replace', path: '/spec/replicas', value: replicas }]
        switch (kind) {
            case 'Deployment':  await this.clusterInfo.appsApi.patchNamespacedDeployment({ name, namespace: ns, body: patch }); break
            case 'StatefulSet': await this.clusterInfo.appsApi.patchNamespacedStatefulSet({ name, namespace: ns, body: patch }); break
            case 'ReplicaSet':  await this.clusterInfo.appsApi.patchNamespacedReplicaSet({ name, namespace: ns, body: patch }); break
        }
        this.sendSignal(ws, msg, ESignalMessageLevel.INFO, `${kind} ${name} scaled to ${replicas}`)
    }

    private async doRestart(ws: WebSocket, msg: IInstanceMessage, kind: string, ns: string, name: string): Promise<void> {
        const patch = [{ op: 'add', path: '/spec/template/metadata/annotations', value: { 'kubectl.kubernetes.io/restartedAt': new Date().toISOString() } }]
        switch (kind) {
            case 'Deployment':  await this.clusterInfo.appsApi.patchNamespacedDeployment({ name, namespace: ns, body: patch }); break
            case 'StatefulSet': await this.clusterInfo.appsApi.patchNamespacedStatefulSet({ name, namespace: ns, body: patch }); break
            case 'DaemonSet':   await this.clusterInfo.appsApi.patchNamespacedDaemonSet({ name, namespace: ns, body: patch }); break
        }
        this.sendSignal(ws, msg, ESignalMessageLevel.INFO, `${kind} ${name} restart triggered`)
    }

    private findInstance(ws: WebSocket, instanceId: string): ITopologyInstance | undefined {
        return this.webSockets.find(s => s.ws === ws)?.instances.find(i => i.instanceId === instanceId)
    }
}
