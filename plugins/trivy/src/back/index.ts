import { IChannelInstances, IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize, parseResources, BackChannelData, EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel, EInstanceMessageChannel, EInstanceMessageType, EClusterType, IBackChannelRequirements, IExtensionScope, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { IBackChannelObject, IChannel, keyMatchesResource, scopeAllows } from '@kwirthmagnify/kwirth-common-back'
import { Request, Response } from 'express'
import { ETrivyCommand, ETrivyScope, TRIVY_SCOPES, IKnown, ITrivyMessage, ITrivyMessageResponse, ITrivyProviderEvent, isWorkloadKind } from '../common/TrivyTypes'


const TRIVY_API_VERSION = 'v1alpha1'
const TRIVY_API_GROUP = 'aquasecurity.github.io'
const TRIVY_API_VULN_PLURAL = 'vulnerabilityreports'
const TRIVY_API_AUDIT_PLURAL = 'configauditreports'
const TRIVY_API_SBOM_PLURAL = 'sbomreports'
const TRIVY_API_EXPOSED_PLURAL = 'exposedsecretreports'
const ALL_PLURALS = [TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_SBOM_PLURAL, TRIVY_API_EXPOSED_PLURAL]

export interface IInstance {
    instanceId: string
    accessKey: AccessKey
    view: EInstanceConfigView
    namespace: string           // comma-separated namespaces (from instanceConfig)
    workloadNames: string[]     // resolved workload names (for POD/CONTAINER views)
    container: string           // selected container (for CONTAINER view)
}

class TrivyChannel implements IChannel {
    readonly channelId = 'trivy'
    readonly requirements: IBackChannelRequirements = { storage: false, providers: ['trivy'] }
    clusterInfo: any
    backChannelObject: IBackChannelObject
    webSockets: { ws: WebSocket, lastRefresh: number, instances: IInstance[] }[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    /*
        What this channel has running right now, for Status's Plugins tab. Instances are counted
        across EVERY connection: one browser carries one instance per open tab, and a user may have
        several browsers. Connections carrying no instance mean the channel is open but unused.
    */
    getInstances = (): IChannelInstances => ({
        instances: this.webSockets.reduce((total, socket) => total + socket.instances.length, 0),
        connections: this.webSockets.length
    })

    getChannelData = (): BackChannelData => ({
        id: this.channelId, routable: false, pauseable: false, modifiable: false, reconnectable: false,
        metrics: false, sources: [EClusterType.KUBERNETES],
        // No endpoints: the 'operator' one went to the trivy PROVIDER in provider/trivy@0.4.0. Leaving it
        // declared would advertise a route that now answers 404, and the Status channel's Routes tab
        // would list it as if it worked.
        endpoints: [],
        // cluster: Trivy reads reports for the WHOLE cluster, so it is a cluster-level channel and not
        // an autonomous one. Declaring what it really is, is what makes 'does this key have cluster?'
        // the right question to ask.
        websocket: false, cluster: true, resourced: false
    })

    /*
        'trivy$user' opens the channel and reads what the key reaches; 'cluster' reaches everything,
        because that is what it means everywhere else; 'admin' also manages the operator.

        There is no step of its own between user and cluster any more: 'trivy$kubernetes' gated reports
        this channel never asked Kubernetes for.
    */
    getChannelScopeLevel = (scope: string): number => ['', ETrivyScope.USER, 'cluster', 'admin'].indexOf(scope)

    getScopeCatalog = (): IExtensionScope[] => TRIVY_SCOPES   // RBAC: scopes que declara Trivy (validar/gestionar)

    startChannel = async (): Promise<void> => {
        // The provider forwards every report of these types; filtering by concrete
        // asset is done by this channel in processProviderEvent.
        this.clusterInfo.addSubscriber('trivy', this, { reportTypes: ALL_PLURALS })
    }

    processProviderEvent(providerId: string, obj: any): void {
        if (providerId !== 'trivy') return
        const pe = obj as ITrivyProviderEvent
        // The provider sends pe.podName = `resource.name` (the workload that owns the
        // report, a ReplicaSet for instance), not the real pod. We match by scope
        // (namespace + workload + container) against the instance's selectors.
        // Only workloads: a ConfigAuditReport of a Service or an Ingress has no place on this screen
        if (!isWorkloadKind(pe.kind)) return
        const isAudit = pe.plural === TRIVY_API_AUDIT_PLURAL
        // Defaulting as in the priming below: a report may arrive without a container
        const namespace = pe.namespace ?? ''
        const workloadName = pe.podName ?? ''
        const containerName = pe.containerName ?? ''
        for (const socket of this.webSockets) {
            for (const instance of socket.instances) {
                if (!this.matchesScope(instance, namespace, workloadName, containerName, isAudit)) continue
                const payload = this.buildDataPayload(instance.instanceId, namespace, workloadName, containerName, pe.plural, pe.event, pe.report, pe.kind)
                socket.ws.send(JSON.stringify(payload))
            }
        }
    }

    /*
        🔴 THIS CHANNEL NO LONGER EXPOSES ENDPOINTS.

        Installing, removing and querying the Trivy Operator used to live here, behind a 'Manage' button
        in the tab. They moved to the trivy PROVIDER in `provider/trivy@0.4.0`, where they belong: the
        operator is what WRITES the CRDs the provider reads, while this channel only paints reports that
        already exist. They are now its gear in ☰ → Manage extensions → Providers → Trivy.

        The method stays because IChannel requires it — it is not optional — so it answers 404 and says
        where the thing went, rather than disappearing and leaving a caller with a bare 'not found'.
    */
    async endpointRequest(endpoint: string, _req: Request, res: Response): Promise<void> {
        res.status(404).send(`The trivy channel exposes no endpoints ('${endpoint}'). Managing the Trivy Operator moved to the trivy PROVIDER: Manage extensions → Providers → Trivy → the gear.`)
    }

    async websocketRequest(_newWebSocket: WebSocket): Promise<void> { }

    containsAsset = (_webSocket: WebSocket, _podNamespace: string, _podName: string, _containerName: string): boolean => false

    containsInstance = (instanceId: string): boolean => this.webSockets.some(s => s.instances.find(i => i.instanceId === instanceId))

    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (instanceMessage.flow === EInstanceMessageFlow.IMMEDIATE) return false
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) return false
        const instance = socket.instances.find(i => i.instanceId === instanceMessage.instance)
        if (!instance) {
            this.sendSignalMessage(webSocket, instanceMessage.action, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, `Instance not found`)
            return false
        }
        const resp = await this.executeCommand(instanceMessage as ITrivyMessage, instance)
        if (resp) webSocket.send(JSON.stringify(resp))
        return Boolean(resp)
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, _podNamespace: string, _podName: string, _containerName: string): Promise<boolean> => {
        /*
            Two layers, and this is the first: STARTING the channel. It asks for the channel's OWN
            minimum, the same way Agora checks 'agora$user' in its own addObject — and not for
            'cluster', which is what it asked for at first and had to be undone: 'cluster' sits ABOVE
            the channel's scope in the ladder, so requiring it made 'trivy$user' impossible to use —
            anybody who could enter already outranked it. A permission that can be granted and grants
            nothing is worse than no permission at all.

            Asking for the minimum keeps 'cluster' and 'admin' working (the ladder puts them higher) and
            lets somebody be given Trivy and nothing else.

            The core does not check any of this: its cluster branch hands the channel '*all' without
            looking at a single scope, so it is the channel that settles who may read its data — and
            these are vulnerability reports, detected secrets and configuration audits.

            The SECOND layer is what you see and do once inside: the reports are filtered by the key's
            own namespaces (`matchesScope`), 'cluster' reaches them all, and installing or removing the
            operator asks for 'admin' — that is configuring the tool, not using it.

            What the KEY carries is read, never `instanceConfig.scope`: that is a field of an unsigned
            message, so the client could write anything in it and it would prove nothing.
        */
        const accessKey = accessKeyDeserialize(instanceConfig.accessKey)
        if (!scopeAllows(accessKey.resources, ETrivyScope.USER, this.getChannelScopeLevel)) {
            this.backChannelObject.logWarning?.(`Denied start to key ${accessKey.id}: '${ETrivyScope.USER}' required`)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.START, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR,
                instanceConfig.instance, `You don't have permission to use Trivy. It requires the '${ETrivyScope.USER}' scope — ask an administrator.`)
            return false
        }

        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            const len = this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[len - 1]
        }
        let instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = {
                accessKey: accessKeyDeserialize(instanceConfig.accessKey),
                instanceId: instanceConfig.instance,
                view: instanceConfig.view,
                namespace: instanceConfig.namespace ?? '',
                workloadNames: [],
                container: instanceConfig.container ?? ''
            }
            socket.instances.push(instance)
        }

        // For POD/CONTAINER views: resolve each selected pod to its workload name
        // (Trivy names reports by the workload, e.g. ReplicaSet, not by the pod).
        if (instanceConfig.view === EInstanceConfigView.POD || instanceConfig.view === EInstanceConfigView.CONTAINER) {
            const podNames = (instanceConfig.pod ?? '').split(',').filter(Boolean)
            for (const podName of podNames) {
                const ns = instanceConfig.namespace ?? ''
                if (ns && podName) {
                    const workloadName = await this.resolveWorkloadName(ns, podName)
                    instance.workloadNames.push(workloadName)
                }
            }
        }

        // Prime from cluster: list CRDs directly (like Excubitor's primeFromCluster).
        const namespaces = (instanceConfig.namespace ?? '').split(',').filter(Boolean)
        const isClusterView = instanceConfig.view === EInstanceConfigView.CLUSTER || instanceConfig.view === EInstanceConfigView.NONE || namespaces.length === 0
        for (const plural of ALL_PLURALS) {
            try {
                let items: any[] = []
                if (isClusterView) {
                    const res: any = await this.clusterInfo.crdApi.listCustomObjectForAllNamespaces({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, plural })
                    items = res?.items ?? res?.body?.items ?? []
                }
                else {
                    for (const ns of namespaces) {
                        const res: any = await this.clusterInfo.crdApi.listNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: ns, plural })
                        const nsItems = res?.items ?? res?.body?.items ?? []
                        items = items.concat(nsItems)
                    }
                }
                for (const obj of items) {
                    const labels = obj.metadata?.labels ?? {}
                    /*
                        🔴 Defaulted to '', because not every report HAS a container.

                        A ConfigAuditReport is written for whatever the operator audits — a Service, an
                        Ingress, a Role — and those carry no `container.name`. Since the channel stopped
                        being `resourced` (0.2.x, when the core no longer discovered the pods for it),
                        those reports reach the front end too, and an `undefined` travelling as the
                        container was enough to take the screen down the moment somebody typed in the
                        filter: it did `container.toLowerCase()`.

                        A missing label is an empty string here and nowhere else.
                    */
                    // Only workloads, the same cut as the live events above
                    if (!isWorkloadKind(labels['trivy-operator.resource.kind'])) continue
                    const ns = labels['trivy-operator.resource.namespace'] ?? ''
                    const workloadName = labels['trivy-operator.resource.name'] ?? ''
                    const containerName = labels['trivy-operator.container.name'] ?? ''
                    const isAudit = plural === TRIVY_API_AUDIT_PLURAL
                    if (!this.matchesScope(instance, ns, workloadName, containerName, isAudit)) continue
                    const payload = this.buildDataPayload(instance.instanceId, ns, workloadName, containerName, plural, 'add', obj.report, labels['trivy-operator.resource.kind'])
                    webSocket.send(JSON.stringify(payload))
                }
            }
            catch (err) {
                console.error(`[trivy] prime error (${plural}):`, err)
            }
        }
        return true
    }

    deleteObject = async (_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _podNamespace: string, _podName: string, _containerName: string): Promise<boolean> => true

    pauseContinueInstance(_webSocket: WebSocket, _instanceConfig: IInstanceConfig, _action: EInstanceMessageAction): void { }
    modifyInstance(_webSocket: WebSocket, _instanceConfig: IInstanceConfig): void { }

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket?.instances.find(i => i.instanceId === instanceConfig.instance)) {
            this.removeInstance(webSocket, instanceConfig.instance)
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, 'Trivy instance stopped')
        }
        else {
            this.sendSignalMessage(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceConfig.instance, `Trivy instance not found`)
        }
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            const pos = socket.instances.findIndex(t => t.instanceId === instanceId)
            if (pos >= 0) socket.instances.splice(pos, 1)
        }
        if (!this.webSockets.some(s => s.instances.length > 0)) {
            this.clusterInfo.removeSubscriber('trivy', this)
        }
    }

    containsConnection = (webSocket: WebSocket): boolean => Boolean(this.webSockets.find(s => s.ws === webSocket))

    removeConnection = (webSocket: WebSocket): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) {
            for (const id of socket.instances.map(i => i.instanceId)) this.removeInstance(webSocket, id)
            const pos = this.webSockets.findIndex(s => s.ws === webSocket)
            this.webSockets.splice(pos, 1)
        }
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) { socket.lastRefresh = Date.now(); return true }
        return false
    }

    updateConnection = (_newWebSocket: WebSocket, _instanceId: string): boolean => false

    // ─── PRIVATE ────────────────────────────────────────────────────────────────

    private matchesScope = (instance: IInstance, namespace: string, workloadName: string, containerName: string, isAudit: boolean): boolean => {
        /*
            🔴 FIRST, what the KEY grants — and only then what the client asked for.

            Everything below this line is the SELECTION: the view, the namespaces and the workloads come
            from the `instanceConfig`, which the browser composes. Until now that was the only filter, so
            opening Trivy on the cluster view handed over the vulnerability reports and the DETECTED
            SECRETS of every namespace, whatever the key granted. It took no tampering: it is what the
            UI does when you pick the cluster.

            Both ways reports leave this channel go through here — the priming at start and the live
            events from the provider — so one check covers them.

            ⚠️ Only the NAMESPACE is matched, deliberately. A report names the workload that owns it (a
            ReplicaSet, say), not the pod, so contrasting it with the key's `pods` would reject reports
            the grant was meant to cover. Namespaces are the dimension that answers 'whose cluster slice
            is this', which is the question being asked.
        */
        if (!keyMatchesResource(instance.accessKey, { namespace })) return false

        switch (instance.view) {
            case EInstanceConfigView.CLUSTER:
            case EInstanceConfigView.NONE:
                return true
            case EInstanceConfigView.NAMESPACE:
            case EInstanceConfigView.GROUP:
                return instance.namespace.split(',').includes(namespace)
            case EInstanceConfigView.POD:
                return instance.namespace.split(',').includes(namespace) && instance.workloadNames.includes(workloadName)
            case EInstanceConfigView.CONTAINER:
                return instance.namespace.split(',').includes(namespace) && instance.workloadNames.includes(workloadName) && (isAudit || containerName === instance.container)
            default:
                return true
        }
    }

    private buildDataPayload = (instanceId: string, namespace: string, podName: string, containerName: string, plural: string, event: string, report: any, kind?: string): ITrivyMessageResponse => {
        const payload: ITrivyMessageResponse = {
            msgtype: 'trivymessageresponse',
            msgsubtype: event,
            id: '',
            namespace,
            group: '',
            pod: podName,
            container: containerName,
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            channel: EInstanceMessageChannel.TRIVY,
            instance: instanceId
        }
        if (event === 'delete') {
            payload.data = { resource: plural, known: { name: podName, namespace, container: containerName, kind, report: undefined } satisfies IKnown }
        }
        else {
            payload.data = { resource: plural, known: { name: podName, namespace, container: containerName, kind, report } }
        }
        return payload
    }

    private sendSignalMessage = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        ws.send(JSON.stringify({ action, flow, channel: EInstanceMessageChannel.TRIVY, instance: instanceId, type: EInstanceMessageType.SIGNAL, text, level } as ISignalMessage))
    }

    private checkScopes = (instance: IInstance, scope: string) => {
        const resources = parseResources(instance.accessKey.resources)
        const requiredLevel = this.getChannelScopeLevel(scope)
        return resources.some((r: any) => r.scopes.split(',').some((sc: string) => this.getChannelScopeLevel(sc) >= requiredLevel))
    }

    removeReport = async (plural: string, trivyMessage: ITrivyMessage): Promise<string | undefined> => {
        const crdName = await this.getCrdName(trivyMessage.namespace, trivyMessage.pod, trivyMessage.container)
        if (crdName) {
            try {
                await this.clusterInfo.crdApi.deleteNamespacedCustomObject({ group: TRIVY_API_GROUP, version: TRIVY_API_VERSION, namespace: trivyMessage.namespace, plural, name: crdName })
                return undefined
            } catch (err) { return `Error removing ${plural}: ` + err }
        }
        return `Couldn't get CRD name`
    }

    executeCommand = async (trivyMessage: ITrivyMessage, _instance: IInstance): Promise<ITrivyMessageResponse> => {
        const resp: ITrivyMessageResponse = {
            msgtype: 'trivymessageresponse', id: '', namespace: trivyMessage.namespace, group: trivyMessage.group,
            pod: trivyMessage.pod, container: trivyMessage.container, action: trivyMessage.action,
            flow: EInstanceMessageFlow.RESPONSE, type: EInstanceMessageType.DATA, channel: trivyMessage.channel, instance: trivyMessage.instance
        }
        if (trivyMessage.command === ETrivyCommand.RESCAN) {
            const errors = await Promise.all([TRIVY_API_VULN_PLURAL, TRIVY_API_AUDIT_PLURAL, TRIVY_API_EXPOSED_PLURAL, TRIVY_API_SBOM_PLURAL].map(p => this.removeReport(p, trivyMessage)))
            const err = errors.find(Boolean)
            if (err) resp.data = err
        }
        return resp
    }

    getCrdName = async (namespace: string, podName: string, containerName?: string): Promise<string | undefined> => {
        try {
            const podData = await this.clusterInfo.coreApi.readNamespacedPod({ name: podName, namespace })
            const ctrl = podData.metadata?.ownerReferences?.find((or: any) => or.controller)
            if (ctrl) return `${ctrl.kind.toLowerCase()}-${ctrl.name}${containerName ? '-' + containerName : ''}`
            return `pod-${podName}${containerName ? '-' + containerName : ''}`
        } catch (err) {
            console.error('[trivy] Cannot get CRD name:', err)
            return undefined
        }
    }

    // Resolves the name of the workload that owns the pod (= Trivy's `resource.name`):
    // the controller (a ReplicaSet…) when there is one, or the pod itself when it stands alone.
    private resolveWorkloadName = async (namespace: string, podName: string): Promise<string> => {
        try {
            const podData = await this.clusterInfo.coreApi.readNamespacedPod({ name: podName, namespace })
            const ctrl = podData.metadata?.ownerReferences?.find((or: any) => or.controller)
            return ctrl ? ctrl.name : podName
        } catch (err) {
            console.error('[trivy] Cannot resolve workload name:', err)
            return podName
        }
    }
}

export { TrivyChannel }
