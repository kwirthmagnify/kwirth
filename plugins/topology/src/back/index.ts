import {
    BackChannelData,
    EClusterType,
    EInstanceMessageAction,
    EInstanceMessageFlow,
    EInstanceMessageType,
    ESignalMessageLevel,
    IBackChannelObject,
    IInstanceConfig,
    IInstanceConfigResponse,
    IInstanceMessage,
    ISignalMessage,
} from '@kwirthmagnify/kwirth-common'
import { ETopologyNodeKind, ETopologyNodeStatus } from '../common/TopologyTypes'

type TTopoAction = 'ADDED' | 'MODIFIED' | 'DELETED' | 'ENDPOINTS_RESULT' | 'INGRESS_RULES_RESULT'

interface ITopologyWsMessage {
    action:   EInstanceMessageAction
    flow:     EInstanceMessageFlow
    channel:  string
    instance: string
    type:     EInstanceMessageType
    topoAction?:    TTopoAction
    kind:           ETopologyNodeKind
    uid:            string
    name:           string
    namespace:      string
    status:         ETopologyNodeStatus
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
    containers?:    string[]
    responseData?:  any
}

interface ITopologyInstance {
    instanceId:  string
    namespaces:  string[]
    pods?:       string[]
    services?:   string[]
    ingresses?:  string[]
    groups?:     string[]
    focusedUids?: Set<string>
    paused:      boolean
}

interface ISocketEntry {
    ws:          WebSocket
    lastRefresh: number
    instances:   ITopologyInstance[]
}

interface IFocusContext {
    allPods:  any[]
    allSvcs:  any[]
    allDeps:  any[]
    allSts:   any[]
    allDs:    any[]
    allRs:    any[]
    allJobs:  any[]
    allCrons: any[]
    allIngs:  any[]
    allPvcs:  any[]
    included: Set<string>
}

function podStatus(p: any): ETopologyNodeStatus {
    if (p.metadata?.deletionTimestamp) return ETopologyNodeStatus.TERMINATING
    switch (p.status?.phase) {
        case 'Running':   return ETopologyNodeStatus.RUNNING
        case 'Pending':   return ETopologyNodeStatus.PENDING
        case 'Succeeded': return ETopologyNodeStatus.SUCCEEDED
        case 'Failed':    return ETopologyNodeStatus.FAILED
        default:          return ETopologyNodeStatus.UNKNOWN
    }
}

function controllerStatus(ready?: number, desired?: number): ETopologyNodeStatus {
    if (desired === undefined || desired === 0) return ETopologyNodeStatus.UNKNOWN
    if ((ready ?? 0) >= desired) return ETopologyNodeStatus.RUNNING
    if ((ready ?? 0) > 0)       return ETopologyNodeStatus.PENDING
    return ETopologyNodeStatus.FAILED
}

function pvcStatus(p: any): ETopologyNodeStatus {
    switch (p.status?.phase) {
        case 'Bound':    return ETopologyNodeStatus.BOUND
        case 'Pending':  return ETopologyNodeStatus.PENDING
        case 'Released': return ETopologyNodeStatus.RELEASED
        case 'Lost':     return ETopologyNodeStatus.LOST
        default:         return ETopologyNodeStatus.UNKNOWN
    }
}

export class TopologyChannel {
    readonly channelId = 'topology'
    readonly requirements = {
        storage: false,
        providers: ['events']
    }

    private clusterInfo:       any
    private backChannelObject: IBackChannelObject
    private webSockets:        ISocketEntry[] = []
    private serviceCache = new Map<string, any>()
    private pvcCache     = new Map<string, any>()

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
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
            resourced:     true,
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
    }

    processProviderEvent(providerId: string, obj: any): void {
        if (providerId !== 'events') return

        const type: TTopoAction = obj.type as TTopoAction
        const resource = obj.obj

        if (resource.kind === 'Service') {
            if (type === 'DELETED') this.serviceCache.delete(resource.metadata?.uid ?? '')
            else if (resource.metadata?.uid) this.serviceCache.set(resource.metadata.uid, resource)
        }
        if (resource.kind === 'PersistentVolumeClaim') {
            if (type === 'DELETED') this.pvcCache.delete(resource.metadata?.uid ?? '')
            else if (resource.metadata?.uid) this.pvcCache.set(resource.metadata.uid, resource)
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
                if (!inst.namespaces.includes('*all') && ns && !inst.namespaces.includes(ns)) continue
                if (inst.focusedUids && !inst.focusedUids.has(resource.metadata?.uid ?? '')) continue
                this.emit(entry.ws, inst, mapped as ITopologyWsMessage, type)
            }
        }
    }

    async endpointRequest(_e: string, _req: unknown, _res: unknown): Promise<void> {}
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
                case 'GET_ENDPOINTS': {
                    this.backChannelObject.logInfo?.(`[topology] GET_ENDPOINTS ${m.namespace}/${m.name}`)
                    const eps = await this.clusterInfo.coreApi.readNamespacedEndpoints({ name: m.name, namespace: m.namespace })
                    const subsets = (eps.subsets ?? []).map((s: any) => ({
                        addresses: (s.addresses ?? []).map((a: any) => ({ ip: a.ip, node: a.nodeName, pod: a.targetRef?.name })),
                        ports: (s.ports ?? []).map((p: any) => ({ name: p.name, port: p.port, protocol: p.protocol })),
                    }))
                    this.sendDataResponse(ws, msg, 'ENDPOINTS_RESULT', m.kind, m.uid, m.name, m.namespace, subsets)
                    return true
                }
                case 'GET_INGRESS_RULES': {
                    const ing = await this.clusterInfo.networkApi.readNamespacedIngress({ name: m.name, namespace: m.namespace })
                    const rules = (ing.spec?.rules ?? []).map((r: any) => ({
                        host: r.host ?? '*',
                        paths: (r.http?.paths ?? []).map((p: any) => ({
                            path: p.path ?? '/',
                            pathType: p.pathType,
                            service: p.backend?.service?.name,
                            port: p.backend?.service?.port?.number,
                        })),
                    }))
                    this.sendDataResponse(ws, msg, 'INGRESS_RULES_RESULT', m.kind, m.uid, m.name, m.namespace, rules)
                    return true
                }
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
            const existing = entry.instances.find(i => i.instanceId === instanceConfig.instance)
            if (existing) {
                await this.sendSnapshot(ws, existing)
                return true
            }

            const ns = instanceConfig.namespace
            const namespaces: string[] = ns && ns !== '' && ns !== '*all'
                ? ns.split(',').filter(Boolean)
                : ['*all']

            const data = instanceConfig.data as Partial<ITopologyInstance> | undefined

            const toStrArray = (v: unknown): string[] | undefined =>
                Array.isArray(v) && v.length > 0 ? v as string[] : undefined

            const pods      = toStrArray(data?.pods)
            const services  = toStrArray(data?.services)
            const ingresses = toStrArray(data?.ingresses)
            const groups    = toStrArray(data?.groups)

            const inst: ITopologyInstance = {
                instanceId: instanceConfig.instance,
                namespaces,
                pods,
                services,
                ingresses,
                groups,
                paused: false,
            }
            entry.instances.push(inst)
            await this.sendSnapshot(ws, inst)
        } catch (err: any) {
            this.sendSignal(ws, instanceConfig as any, ESignalMessageLevel.ERROR, err?.message ?? String(err))
        }
        return true
    }

    deleteObject = async (ws: WebSocket, instanceConfig: IInstanceConfig): Promise<boolean> => {
        const entry = this.webSockets.find(s => s.ws === ws)
        const inst = entry?.instances.find(i => i.instanceId === instanceConfig.instance)
        if (inst) await this.sendSnapshot(ws, inst)
        return true
    }

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

    private nsMatch(inst: ITopologyInstance, ns: string | undefined): boolean {
        return inst.namespaces.includes('*all') || (!!ns && inst.namespaces.includes(ns))
    }

    private async sendSnapshot(ws: WebSocket, inst: ITopologyInstance): Promise<void> {
        const isFocused = !!(inst.pods?.length || inst.services?.length || inst.ingresses?.length || inst.groups?.length)
        if (isFocused) {
            await this.sendFocusedSnapshot(ws, inst)
        } else {
            await this.sendFullSnapshot(ws, inst)
        }
    }

    private async sendFullSnapshot(ws: WebSocket, inst: ITopologyInstance): Promise<void> {
        const [pods, svcs, deps, sts, ds, rs, jobs, crons, ings, pvcs] = await Promise.allSettled([
            this.clusterInfo.coreApi.listPodForAllNamespaces(),
            this.clusterInfo.coreApi.listServiceForAllNamespaces(),
            this.clusterInfo.appsApi.listDeploymentForAllNamespaces(),
            this.clusterInfo.appsApi.listStatefulSetForAllNamespaces(),
            this.clusterInfo.appsApi.listDaemonSetForAllNamespaces(),
            this.clusterInfo.appsApi.listReplicaSetForAllNamespaces(),
            this.clusterInfo.batchApi.listJobForAllNamespaces(),
            this.clusterInfo.batchApi.listCronJobForAllNamespaces(),
            this.clusterInfo.networkApi.listIngressForAllNamespaces(),
            this.clusterInfo.coreApi.listPersistentVolumeClaimForAllNamespaces(),
        ])

        const svcList = svcs.status === 'fulfilled' ? (svcs.value as any).items.filter((s: any) => this.nsMatch(inst, s.metadata?.namespace)) : []
        const pvcList = pvcs.status === 'fulfilled' ? (pvcs.value as any).items.filter((p: any) => this.nsMatch(inst, p.metadata?.namespace)) : []

        svcList.forEach((s: any) => { if (s.metadata?.uid) this.serviceCache.set(s.metadata.uid, s) })
        pvcList.forEach((p: any) => { if (p.metadata?.uid) this.pvcCache.set(p.metadata.uid, p) })

        svcList.forEach((s: any) => this.emit(ws, inst, this.mapService(s), 'ADDED'))

        if (deps.status  === 'fulfilled') (deps.value as any).items.filter((d: any) => this.nsMatch(inst, d.metadata?.namespace)).forEach((d: any) => this.emit(ws, inst, { ...this.mapDeployment(d),  edges: this.edgesForController(d.spec?.selector?.matchLabels, d.metadata?.namespace, svcList) }, 'ADDED'))
        if (sts.status   === 'fulfilled') (sts.value as any).items.filter((s: any)  => this.nsMatch(inst, s.metadata?.namespace)).forEach((s: any) => this.emit(ws, inst, { ...this.mapStatefulSet(s), edges: this.edgesForController(s.spec?.selector?.matchLabels, s.metadata?.namespace, svcList) }, 'ADDED'))
        if (ds.status    === 'fulfilled') (ds.value as any).items.filter((d: any)   => this.nsMatch(inst, d.metadata?.namespace)).forEach((d: any) => this.emit(ws, inst, { ...this.mapDaemonSet(d),   edges: this.edgesForController(d.spec?.selector?.matchLabels, d.metadata?.namespace, svcList) }, 'ADDED'))
        if (rs.status    === 'fulfilled') (rs.value as any).items.filter((r: any)   => this.nsMatch(inst, r.metadata?.namespace)).forEach((r: any) => this.emit(ws, inst, this.mapReplicaSet(r), 'ADDED'))
        if (jobs.status  === 'fulfilled') (jobs.value as any).items.filter((j: any) => this.nsMatch(inst, j.metadata?.namespace)).forEach((j: any) => this.emit(ws, inst, this.mapJob(j), 'ADDED'))
        if (crons.status === 'fulfilled') (crons.value as any).items.filter((c: any) => this.nsMatch(inst, c.metadata?.namespace)).forEach((c: any) => this.emit(ws, inst, this.mapCronJob(c), 'ADDED'))
        if (ings.status  === 'fulfilled') (ings.value as any).items.filter((i: any) => this.nsMatch(inst, i.metadata?.namespace)).forEach((i: any) => this.emit(ws, inst, { ...this.mapIngress(i), edges: this.edgesForIngress(i, svcList) }, 'ADDED'))
        if (pods.status  === 'fulfilled') (pods.value as any).items.filter((p: any) => this.nsMatch(inst, p.metadata?.namespace)).forEach((p: any) => this.emit(ws, inst, this.mapPod(p), 'ADDED'))
        pvcList.forEach((p: any) => this.emit(ws, inst, this.mapPvc(p), 'ADDED'))
    }

    private async sendFocusedSnapshot(ws: WebSocket, inst: ITopologyInstance): Promise<void> {
        const [pods, svcs, deps, sts, ds, rs, jobs, crons, ings, pvcs] = await Promise.allSettled([
            this.clusterInfo.coreApi.listPodForAllNamespaces(),
            this.clusterInfo.coreApi.listServiceForAllNamespaces(),
            this.clusterInfo.appsApi.listDeploymentForAllNamespaces(),
            this.clusterInfo.appsApi.listStatefulSetForAllNamespaces(),
            this.clusterInfo.appsApi.listDaemonSetForAllNamespaces(),
            this.clusterInfo.appsApi.listReplicaSetForAllNamespaces(),
            this.clusterInfo.batchApi.listJobForAllNamespaces(),
            this.clusterInfo.batchApi.listCronJobForAllNamespaces(),
            this.clusterInfo.networkApi.listIngressForAllNamespaces(),
            this.clusterInfo.coreApi.listPersistentVolumeClaimForAllNamespaces(),
        ])

        const ctx: IFocusContext = {
            allPods:  pods.status  === 'fulfilled' ? (pods.value as any).items.filter((p: any)  => this.nsMatch(inst, p.metadata?.namespace))  : [],
            allSvcs:  svcs.status  === 'fulfilled' ? (svcs.value as any).items.filter((s: any)  => this.nsMatch(inst, s.metadata?.namespace))  : [],
            allDeps:  deps.status  === 'fulfilled' ? (deps.value as any).items.filter((d: any)  => this.nsMatch(inst, d.metadata?.namespace))  : [],
            allSts:   sts.status   === 'fulfilled' ? (sts.value as any).items.filter((s: any)   => this.nsMatch(inst, s.metadata?.namespace))  : [],
            allDs:    ds.status    === 'fulfilled' ? (ds.value as any).items.filter((d: any)    => this.nsMatch(inst, d.metadata?.namespace))   : [],
            allRs:    rs.status    === 'fulfilled' ? (rs.value as any).items.filter((r: any)    => this.nsMatch(inst, r.metadata?.namespace))   : [],
            allJobs:  jobs.status  === 'fulfilled' ? (jobs.value as any).items.filter((j: any)  => this.nsMatch(inst, j.metadata?.namespace))  : [],
            allCrons: crons.status === 'fulfilled' ? (crons.value as any).items.filter((c: any) => this.nsMatch(inst, c.metadata?.namespace))  : [],
            allIngs:  ings.status  === 'fulfilled' ? (ings.value as any).items.filter((i: any)  => this.nsMatch(inst, i.metadata?.namespace))  : [],
            allPvcs:  pvcs.status  === 'fulfilled' ? (pvcs.value as any).items.filter((p: any)  => this.nsMatch(inst, p.metadata?.namespace))  : [],
            included: new Set<string>(),
        }

        ctx.allSvcs.forEach((s: any) => { if (s.metadata?.uid) this.serviceCache.set(s.metadata.uid, s) })
        ctx.allPvcs.forEach((p: any) => { if (p.metadata?.uid) this.pvcCache.set(p.metadata.uid, p) })

        for (const name of inst.pods ?? []) {
            const pod = ctx.allPods.find((p: any) => p.metadata?.name === name)
            if (pod) this.addPodChain(pod, ctx)
        }
        for (const name of inst.services ?? []) {
            const svc = ctx.allSvcs.find((s: any) => s.metadata?.name === name)
            if (svc) this.addServiceChain(svc, ctx)
        }
        for (const name of inst.ingresses ?? []) {
            const ing = ctx.allIngs.find((i: any) => i.metadata?.name === name)
            if (ing) this.addIngressChain(ing, ctx)
        }
        for (const groupStr of inst.groups ?? []) {
            const sep = groupStr.indexOf('/')
            if (sep > 0) this.addGroupChain(groupStr.substring(0, sep), groupStr.substring(sep + 1), ctx)
        }

        inst.focusedUids = ctx.included

        const inc = ctx.included
        ctx.allSvcs.filter((s: any)  => inc.has(s.metadata?.uid ?? '')).forEach((s: any)  => this.emit(ws, inst, this.mapService(s), 'ADDED'))
        ctx.allDeps.filter((d: any)  => inc.has(d.metadata?.uid ?? '')).forEach((d: any)  => this.emit(ws, inst, { ...this.mapDeployment(d),  edges: this.edgesForController(d.spec?.selector?.matchLabels, d.metadata?.namespace, ctx.allSvcs) }, 'ADDED'))
        ctx.allSts.filter((s: any)   => inc.has(s.metadata?.uid ?? '')).forEach((s: any)  => this.emit(ws, inst, { ...this.mapStatefulSet(s), edges: this.edgesForController(s.spec?.selector?.matchLabels, s.metadata?.namespace, ctx.allSvcs) }, 'ADDED'))
        ctx.allDs.filter((d: any)    => inc.has(d.metadata?.uid ?? '')).forEach((d: any)  => this.emit(ws, inst, { ...this.mapDaemonSet(d),   edges: this.edgesForController(d.spec?.selector?.matchLabels, d.metadata?.namespace, ctx.allSvcs) }, 'ADDED'))
        ctx.allRs.filter((r: any)    => inc.has(r.metadata?.uid ?? '')).forEach((r: any)  => this.emit(ws, inst, this.mapReplicaSet(r), 'ADDED'))
        ctx.allJobs.filter((j: any)  => inc.has(j.metadata?.uid ?? '')).forEach((j: any)  => this.emit(ws, inst, this.mapJob(j), 'ADDED'))
        ctx.allCrons.filter((c: any) => inc.has(c.metadata?.uid ?? '')).forEach((c: any)  => this.emit(ws, inst, this.mapCronJob(c), 'ADDED'))
        ctx.allIngs.filter((i: any)  => inc.has(i.metadata?.uid ?? '')).forEach((i: any)  => this.emit(ws, inst, { ...this.mapIngress(i), edges: this.edgesForIngress(i, ctx.allSvcs) }, 'ADDED'))
        ctx.allPods.filter((p: any)  => inc.has(p.metadata?.uid ?? '')).forEach((p: any)  => this.emit(ws, inst, this.mapPod(p), 'ADDED'))
        ctx.allPvcs.filter((p: any)  => inc.has(p.metadata?.uid ?? '')).forEach((p: any)  => this.emit(ws, inst, this.mapPvc(p), 'ADDED'))
    }

    private addPodChain(pod: any, ctx: IFocusContext): void {
        const uid = pod.metadata?.uid ?? ''
        if (ctx.included.has(uid)) return
        ctx.included.add(uid)
        const podNs = pod.metadata?.namespace
        for (const vol of pod.spec?.volumes ?? []) {
            const claimName = vol.persistentVolumeClaim?.claimName
            if (!claimName) continue
            const pvc = ctx.allPvcs.find((p: any) => p.metadata?.name === claimName && p.metadata?.namespace === podNs)
            if (pvc?.metadata?.uid) ctx.included.add(pvc.metadata.uid)
        }
        for (const ownerRef of pod.metadata?.ownerReferences ?? []) {
            if (ownerRef.kind === 'ReplicaSet') {
                const rs = ctx.allRs.find((r: any) => r.metadata?.uid === ownerRef.uid)
                if (rs) {
                    ctx.included.add(rs.metadata?.uid ?? '')
                    for (const rsOwner of rs.metadata?.ownerReferences ?? []) {
                        if (rsOwner.kind === 'Deployment') {
                            const dep = ctx.allDeps.find((d: any) => d.metadata?.uid === rsOwner.uid)
                            if (dep?.metadata?.uid) ctx.included.add(dep.metadata.uid)
                        }
                    }
                }
            } else if (ownerRef.kind === 'StatefulSet') {
                const sts = ctx.allSts.find((s: any) => s.metadata?.uid === ownerRef.uid)
                if (sts?.metadata?.uid) ctx.included.add(sts.metadata.uid)
            } else if (ownerRef.kind === 'DaemonSet') {
                const ds = ctx.allDs.find((d: any) => d.metadata?.uid === ownerRef.uid)
                if (ds?.metadata?.uid) ctx.included.add(ds.metadata.uid)
            } else if (ownerRef.kind === 'Job') {
                const job = ctx.allJobs.find((j: any) => j.metadata?.uid === ownerRef.uid)
                if (job) {
                    ctx.included.add(job.metadata?.uid ?? '')
                    for (const jobOwner of job.metadata?.ownerReferences ?? []) {
                        if (jobOwner.kind === 'CronJob') {
                            const cron = ctx.allCrons.find((c: any) => c.metadata?.uid === jobOwner.uid)
                            if (cron?.metadata?.uid) ctx.included.add(cron.metadata.uid)
                        }
                    }
                }
            }
        }
        const podLabels = pod.metadata?.labels ?? {}
        for (const svc of ctx.allSvcs) {
            if (svc.metadata?.namespace !== podNs) continue
            const sel = svc.spec?.selector ?? {}
            if (Object.keys(sel).length > 0 && Object.entries(sel).every(([k, v]) => podLabels[k] === v)) {
                ctx.included.add(svc.metadata?.uid ?? '')
                this.addIngressForService(svc, ctx)
            }
        }
    }

    private addIngressForService(svc: any, ctx: IFocusContext): void {
        for (const ing of ctx.allIngs) {
            if (ing.metadata?.namespace !== svc.metadata?.namespace) continue
            for (const rule of ing.spec?.rules ?? []) {
                for (const path of rule.http?.paths ?? []) {
                    if (path.backend?.service?.name === svc.metadata?.name) {
                        ctx.included.add(ing.metadata?.uid ?? '')
                    }
                }
            }
        }
    }

    private addServiceChain(svc: any, ctx: IFocusContext): void {
        if (ctx.included.has(svc.metadata?.uid ?? '')) return
        ctx.included.add(svc.metadata?.uid ?? '')
        this.addIngressForService(svc, ctx)
        const sel = svc.spec?.selector ?? {}
        if (Object.keys(sel).length === 0) return
        const svcNs = svc.metadata?.namespace
        for (const pod of ctx.allPods) {
            if (pod.metadata?.namespace !== svcNs) continue
            const podLabels = pod.metadata?.labels ?? {}
            if (Object.entries(sel).every(([k, v]) => podLabels[k] === v)) {
                this.addPodChain(pod, ctx)
            }
        }
    }

    private addIngressChain(ing: any, ctx: IFocusContext): void {
        if (ctx.included.has(ing.metadata?.uid ?? '')) return
        ctx.included.add(ing.metadata?.uid ?? '')
        const ingNs = ing.metadata?.namespace
        for (const rule of ing.spec?.rules ?? []) {
            for (const path of rule.http?.paths ?? []) {
                const svcName = path.backend?.service?.name
                const svc = ctx.allSvcs.find((s: any) => s.metadata?.namespace === ingNs && s.metadata?.name === svcName)
                if (svc) this.addServiceChain(svc, ctx)
            }
        }
    }

    private addGroupChain(kind: string, name: string, ctx: IFocusContext): void {
        switch (kind) {
            case 'Deployment': {
                const dep = ctx.allDeps.find((d: any) => d.metadata?.name === name)
                if (!dep?.metadata?.uid) return
                ctx.included.add(dep.metadata.uid)
                for (const rs of ctx.allRs) {
                    if (!rs.metadata?.ownerReferences?.some((r: any) => r.uid === dep.metadata?.uid)) continue
                    ctx.included.add(rs.metadata?.uid ?? '')
                    ctx.allPods.filter((p: any) => p.metadata?.ownerReferences?.some((r: any) => r.uid === rs.metadata?.uid)).forEach((p: any) => this.addPodChain(p, ctx))
                }
                break
            }
            case 'StatefulSet': {
                const sts = ctx.allSts.find((s: any) => s.metadata?.name === name)
                if (!sts?.metadata?.uid) return
                ctx.included.add(sts.metadata.uid)
                ctx.allPods.filter((p: any) => p.metadata?.ownerReferences?.some((r: any) => r.uid === sts.metadata?.uid)).forEach((p: any) => this.addPodChain(p, ctx))
                break
            }
            case 'DaemonSet': {
                const ds = ctx.allDs.find((d: any) => d.metadata?.name === name)
                if (!ds?.metadata?.uid) return
                ctx.included.add(ds.metadata.uid)
                ctx.allPods.filter((p: any) => p.metadata?.ownerReferences?.some((r: any) => r.uid === ds.metadata?.uid)).forEach((p: any) => this.addPodChain(p, ctx))
                break
            }
            case 'ReplicaSet': {
                const rs = ctx.allRs.find((r: any) => r.metadata?.name === name)
                if (!rs?.metadata?.uid) return
                ctx.included.add(rs.metadata.uid)
                ctx.allPods.filter((p: any) => p.metadata?.ownerReferences?.some((r: any) => r.uid === rs.metadata?.uid)).forEach((p: any) => this.addPodChain(p, ctx))
                break
            }
            case 'Job': {
                const job = ctx.allJobs.find((j: any) => j.metadata?.name === name)
                if (!job?.metadata?.uid) return
                ctx.included.add(job.metadata.uid)
                ctx.allPods.filter((p: any) => p.metadata?.ownerReferences?.some((r: any) => r.uid === job.metadata?.uid)).forEach((p: any) => this.addPodChain(p, ctx))
                break
            }
            case 'CronJob': {
                const cron = ctx.allCrons.find((c: any) => c.metadata?.name === name)
                if (!cron?.metadata?.uid) return
                ctx.included.add(cron.metadata.uid)
                for (const job of ctx.allJobs.filter((j: any) => j.metadata?.ownerReferences?.some((r: any) => r.uid === cron.metadata?.uid))) {
                    ctx.included.add(job.metadata?.uid ?? '')
                    ctx.allPods.filter((p: any) => p.metadata?.ownerReferences?.some((r: any) => r.uid === job.metadata?.uid)).forEach((p: any) => this.addPodChain(p, ctx))
                }
                break
            }
        }
    }

    private mapResource(resource: any): Partial<ITopologyWsMessage> | null {
        switch (resource.kind) {
            case 'Pod':                   return this.mapPod(resource)
            case 'Service':               return this.mapService(resource)
            case 'Deployment':            return this.mapDeployment(resource)
            case 'StatefulSet':           return this.mapStatefulSet(resource)
            case 'DaemonSet':             return this.mapDaemonSet(resource)
            case 'ReplicaSet':            return this.mapReplicaSet(resource)
            case 'Job':                   return this.mapJob(resource)
            case 'CronJob':               return this.mapCronJob(resource)
            case 'Ingress':               return this.mapIngress(resource)
            case 'PersistentVolumeClaim': return this.mapPvc(resource)
            default:                      return null
        }
    }

    private computeEdges(resource: any, svcList: any[]): Array<{ targetUid: string; label: string }> {
        switch (resource.kind) {
            case 'Deployment':
            case 'StatefulSet':
            case 'DaemonSet':
                return this.edgesForController(resource.spec?.selector?.matchLabels, resource.metadata?.namespace, svcList)
            case 'Ingress':
                return this.edgesForIngress(resource, svcList)
            default:
                return []
        }
    }

    private mapPod(p: any): Partial<ITopologyWsMessage> {
        const ns = p.metadata?.namespace ?? ''
        const pvcEdges: Array<{ targetUid: string; label: string }> = []
        for (const vol of p.spec?.volumes ?? []) {
            const claimName = vol.persistentVolumeClaim?.claimName
            if (!claimName) continue
            for (const pvc of this.pvcCache.values()) {
                if (pvc.metadata?.name === claimName && pvc.metadata?.namespace === ns && pvc.metadata?.uid) {
                    pvcEdges.push({ targetUid: pvc.metadata.uid, label: vol.name })
                    break
                }
            }
        }
        return {
            kind: ETopologyNodeKind.POD, uid: p.metadata?.uid ?? '', name: p.metadata?.name ?? '',
            namespace: ns, status: podStatus(p),
            labels: p.metadata?.labels ?? {},
            image: p.spec?.containers?.[0]?.image,
            containers: p.spec?.containers?.map((c: any) => c.name) ?? [],
            ownerUids: p.metadata?.ownerReferences?.map((r: any) => r.uid) ?? [],
            edges: pvcEdges.length > 0 ? pvcEdges : undefined,
        }
    }

    private mapService(s: any): Partial<ITopologyWsMessage> {
        return {
            kind: ETopologyNodeKind.SERVICE, uid: s.metadata?.uid ?? '', name: s.metadata?.name ?? '',
            namespace: s.metadata?.namespace ?? '', status: ETopologyNodeStatus.RUNNING,
            labels: s.metadata?.labels ?? {},
            ports: s.spec?.ports?.map((p: any) => p.port) ?? [],
        }
    }

    private mapDeployment(d: any): Partial<ITopologyWsMessage> {
        const ready   = d.status?.readyReplicas   ?? 0
        const desired = d.spec?.replicas ?? 0
        const avail   = d.status?.availableReplicas ?? 0
        const status: ETopologyNodeStatus = desired === 0 ? ETopologyNodeStatus.UNKNOWN : (ready === desired && avail === desired) ? ETopologyNodeStatus.RUNNING : ready > 0 ? ETopologyNodeStatus.PENDING : ETopologyNodeStatus.FAILED
        return {
            kind: ETopologyNodeKind.DEPLOYMENT, uid: d.metadata?.uid ?? '', name: d.metadata?.name ?? '',
            namespace: d.metadata?.namespace ?? '', status, labels: d.metadata?.labels ?? {},
            replicas: desired, readyReplicas: ready,
        }
    }

    private mapStatefulSet(s: any): Partial<ITopologyWsMessage> {
        return {
            kind: ETopologyNodeKind.STATEFULSET, uid: s.metadata?.uid ?? '', name: s.metadata?.name ?? '',
            namespace: s.metadata?.namespace ?? '',
            status: controllerStatus(s.status?.readyReplicas, s.spec?.replicas),
            labels: s.metadata?.labels ?? {},
            replicas: s.spec?.replicas ?? 0, readyReplicas: s.status?.readyReplicas ?? 0,
        }
    }

    private mapDaemonSet(d: any): Partial<ITopologyWsMessage> {
        return {
            kind: ETopologyNodeKind.DAEMONSET, uid: d.metadata?.uid ?? '', name: d.metadata?.name ?? '',
            namespace: d.metadata?.namespace ?? '',
            status: controllerStatus(d.status?.numberReady, d.status?.desiredNumberScheduled),
            labels: d.metadata?.labels ?? {},
            replicas: d.status?.desiredNumberScheduled ?? 0, readyReplicas: d.status?.numberReady ?? 0,
        }
    }

    private mapReplicaSet(r: any): Partial<ITopologyWsMessage> {
        return {
            kind: ETopologyNodeKind.REPLICASET, uid: r.metadata?.uid ?? '', name: r.metadata?.name ?? '',
            namespace: r.metadata?.namespace ?? '',
            status: controllerStatus(r.status?.readyReplicas, r.spec?.replicas),
            labels: r.metadata?.labels ?? {},
            replicas: r.spec?.replicas ?? 0, readyReplicas: r.status?.readyReplicas ?? 0,
            ownerUids: r.metadata?.ownerReferences?.map((ref: any) => ref.uid) ?? [],
        }
    }

    private mapJob(j: any): Partial<ITopologyWsMessage> {
        const status: ETopologyNodeStatus = (j.status?.succeeded ?? 0) > 0 ? ETopologyNodeStatus.SUCCEEDED : (j.status?.active ?? 0) > 0 ? ETopologyNodeStatus.RUNNING : ETopologyNodeStatus.UNKNOWN
        return {
            kind: ETopologyNodeKind.JOB, uid: j.metadata?.uid ?? '', name: j.metadata?.name ?? '',
            namespace: j.metadata?.namespace ?? '', status, labels: j.metadata?.labels ?? {},
            ownerUids: j.metadata?.ownerReferences?.map((ref: any) => ref.uid) ?? [],
        }
    }

    private mapCronJob(c: any): Partial<ITopologyWsMessage> {
        return {
            kind: ETopologyNodeKind.CRONJOB, uid: c.metadata?.uid ?? '', name: c.metadata?.name ?? '',
            namespace: c.metadata?.namespace ?? '',
            status: (c.status?.active?.length ?? 0) > 0 ? ETopologyNodeStatus.RUNNING : ETopologyNodeStatus.UNKNOWN,
            labels: c.metadata?.labels ?? {},
        }
    }

    private mapIngress(i: any): Partial<ITopologyWsMessage> {
        return {
            kind: ETopologyNodeKind.INGRESS, uid: i.metadata?.uid ?? '', name: i.metadata?.name ?? '',
            namespace: i.metadata?.namespace ?? '', status: ETopologyNodeStatus.RUNNING,
            labels: i.metadata?.labels ?? {},
            host: i.spec?.rules?.[0]?.host,
        }
    }

    private mapPvc(p: any): Partial<ITopologyWsMessage> {
        return {
            kind: ETopologyNodeKind.PERSISTENTVOLUMECLAIM, uid: p.metadata?.uid ?? '', name: p.metadata?.name ?? '',
            namespace: p.metadata?.namespace ?? '', status: pvcStatus(p),
            labels: p.metadata?.labels ?? {},
            storageClass: p.spec?.storageClassName,
            capacity: p.status?.capacity?.['storage'],
            accessModes: p.spec?.accessModes,
        }
    }

    private edgesForController(matchLabels: Record<string, string> | undefined, namespace: string | undefined, services: any[]): Array<{ targetUid: string; label: string }> {
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

    private edgesForIngress(ingress: any, services: any[]): Array<{ targetUid: string; label: string }> {
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
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.UNSOLICITED,
            channel: 'topology', instance: inst.instanceId, type: EInstanceMessageType.DATA,
            topoAction, kind: partial.kind!, uid: partial.uid!, name: partial.name!,
            namespace: partial.namespace!, status: partial.status!, labels: partial.labels ?? {},
            annotations: partial.annotations, replicas: partial.replicas, readyReplicas: partial.readyReplicas,
            image: partial.image, ports: partial.ports, host: partial.host,
            storageClass: partial.storageClass, capacity: partial.capacity, accessModes: partial.accessModes,
            edges: partial.edges, ownerUids: partial.ownerUids, containers: partial.containers,
        }
        try { ws.send(JSON.stringify(msg)) }
        catch (err) { this.backChannelObject.logWarning?.(`[topology] send error: ${err}`) }
    }

    private sendInstanceConfig(ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, cfg: IInstanceConfig, text: string): void {
        const resp: IInstanceConfigResponse = {
            action, flow, channel: 'topology' as any, instance: cfg.instance, type: EInstanceMessageType.SIGNAL, text,
        }
        try { ws.send(JSON.stringify(resp)) }
        catch (err) { this.backChannelObject.logWarning?.(`[topology] sendInstanceConfig error: ${err}`) }
    }

    private sendDataResponse(ws: WebSocket, msg: IInstanceMessage, topoAction: TTopoAction, kind: string, uid: string, name: string, namespace: string, responseData: any): void {
        const resp = {
            action: EInstanceMessageAction.COMMAND, flow: EInstanceMessageFlow.RESPONSE,
            channel: 'topology', instance: msg.instance, type: EInstanceMessageType.DATA,
            topoAction, kind, uid, name, namespace,
            status: 'Unknown', labels: {}, responseData,
        }
        try { ws.send(JSON.stringify(resp)) }
        catch (err) { this.backChannelObject.logWarning?.(`[topology] sendDataResponse error: ${err}`) }
    }

    private sendSignal(ws: WebSocket, msg: IInstanceMessage, level: ESignalMessageLevel, text: string): void {
        const sig: ISignalMessage = {
            action: EInstanceMessageAction.NONE, flow: EInstanceMessageFlow.RESPONSE, level,
            channel: 'topology' as any, instance: msg.instance, type: EInstanceMessageType.SIGNAL, text,
        }
        try { ws.send(JSON.stringify(sig)) }
        catch (err) { this.backChannelObject.logWarning?.(`[topology] sendSignal error: ${err}`) }
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

export default TopologyChannel
