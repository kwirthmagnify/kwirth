import { IAiToolset, IToolHost, defineTool, z } from '@kwirthmagnify/kwirth-common-ai/back'
import { ECapability, EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'

/*
    Toolset `k8s-describe` — the detail of ONE object (plan: plans/ai-tools/PLAN.md, S3).

    Where `k8s-inventory` answers "what is there", this one answers "what is wrong with this": the
    equivalent of `kubectl describe` and of `kubectl get -o yaml`. It is the biggest package of the lot,
    12 tools.

    Own copies of 12 of the 43; the ones in `common-ai` stay FROZEN until the plugins are wired up (see
    the plan, "When the 43 get deleted").

    ⚠️ `get_space_data` was born in `k8s-inventory` and moved here (2026-09-17, the user caught it): it
    describes ONE namespace, which is exactly what this package does. The clue that it was in the wrong
    place was that its pair, `get_namespace_yaml`, already lived here: the same object, split across two
    packages.

    ⚠️ About sensitivity, which here is not uniform: a complete pod or controller manifest brings the
    `env` with their VALUES in the clear, and that is where people put passwords without realising. That
    is why those are INTERNAL even though they are read-only, while Service/Ingress/Namespace stay PUBLIC.
*/

const k8s = (host: IToolHost, toolName: string, args: Record<string, unknown> = {}) => {
    host.trace(toolName, args)
    if (!host.k8s) throw new Error(`[k8s-describe] '${toolName}' needs cluster access and the host did not provide it`)
    return host.k8s
}

/** A failure is returned as data, not as an exception: the model has to be able to read it and decide. */
const failed = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })

type TAnyObject = Record<string, any>

const CONTROLLER_KINDS = ['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'] as const

/** A single place to read any controller: four types, one call. */
const readController = async (apps: TAnyObject, kind: string, name: string, namespace: string): Promise<TAnyObject> => {
    switch (kind) {
        case 'StatefulSet': return await apps.readNamespacedStatefulSet({ name, namespace })
        case 'DaemonSet': return await apps.readNamespacedDaemonSet({ name, namespace })
        case 'ReplicaSet': return await apps.readNamespacedReplicaSet({ name, namespace })
        default: return await apps.readNamespacedDeployment({ name, namespace })
    }
}

/** The state of a running container, with what it takes to classify a failure. */
const containerStatus = (cs: TAnyObject) => ({
    name: cs.name,
    image: cs.image,
    // image is the tag; imageID the resolved digest. The pair gives away a mutable tag republished with
    // a broken build: same tag, different digest.
    imageID: cs.imageID,
    ready: cs.ready,
    restartCount: cs.restartCount,
    state: cs.state?.waiting ? { waiting: { reason: cs.state.waiting.reason, message: cs.state.waiting.message } }
        : cs.state?.terminated ? { terminated: { reason: cs.state.terminated.reason, exitCode: cs.state.terminated.exitCode } }
            : cs.state?.running ? { running: { startedAt: cs.state.running.startedAt } }
                : cs.state,
    lastTerminated: cs.lastState?.terminated
        ? { reason: cs.lastState.terminated.reason, exitCode: cs.lastState.terminated.exitCode, signal: cs.lastState.terminated.signal, finishedAt: cs.lastState.terminated.finishedAt }
        : undefined
})

const specContainer = (ct: TAnyObject) => ({
    name: ct.name, image: ct.image, resources: ct.resources,
    livenessProbe: !!ct.livenessProbe, readinessProbe: !!ct.readinessProbe, startupProbe: !!ct.startupProbe
})

const templateContainer = (ct: TAnyObject) => ({
    name: ct.name, image: ct.image, resources: ct.resources,
    livenessProbe: !!ct.livenessProbe, readinessProbe: !!ct.readinessProbe
})

/** Where an environment variable whose value is not set by hand comes from. */
const envSource = (e: TAnyObject): string | undefined =>
    e.valueFrom?.configMapKeyRef ? `configMap:${e.valueFrom.configMapKeyRef.name}/${e.valueFrom.configMapKeyRef.key}`
        : e.valueFrom?.secretKeyRef ? `secret:${e.valueFrom.secretKeyRef.name}/${e.valueFrom.secretKeyRef.key}`
            : e.valueFrom?.fieldRef ? `field:${e.valueFrom.fieldRef.fieldPath}`
                : undefined

const backendOf = (b: TAnyObject | undefined): string | undefined =>
    b?.service ? `${b.service.name}:${b.service.port?.number ?? b.service.port?.name}`
        : b?.resource ? `${b.resource.kind}/${b.resource.name}`
            : undefined

const nsName = z.object({
    namespace: z.string().describe('Namespace of the object'),
    name: z.string().describe('Name of the object')
})

const k8sDescribe: IAiToolset = {
    id: 'k8s-describe',
    version: '0.2.0',
    displayName: 'K8s Describe',
    description: 'Diagnostic detail of a single object: describe and full manifests for pods, controllers, services, ingresses and namespaces',
    requires: [ECapability.K8S],
    tools: [
        defineTool({
            name: 'describe_pod',
            description: 'Returns a diagnostic summary of a pod (equivalent to kubectl describe pod): phase, conditions, and per-container status — waiting reason (CrashLoopBackOff/ImagePullBackOff…), last termination reason + exitCode (137=OOMKilled, 1=app error, 143=SIGTERM), restart count, image, resources and probes. Best first step to categorize a pod failure.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the pod'),
                name: z.string().describe('Name of the pod')
            }),
            execute: async ({ namespace, name }, host) => {
                const c = k8s(host, 'describe_pod', { namespace, name })
                try {
                    const pod: TAnyObject = await c.coreApi.readNamespacedPod({ name, namespace })
                    const spec = pod.spec ?? {}
                    const status = pod.status ?? {}

                    // Who owns the pod (pod → ReplicaSet → Deployment), resolved here so the model can
                    // call get_rollout_history without having to guess the name.
                    let controlledBy: { kind: string, name: string } | undefined
                    const podOwner = (pod.metadata?.ownerReferences ?? [])[0]
                    if (podOwner?.kind === 'ReplicaSet') {
                        try {
                            const rs: TAnyObject = await c.appsApi.readNamespacedReplicaSet({ name: podOwner.name, namespace })
                            const rsOwner = (rs.metadata?.ownerReferences ?? [])[0]
                            controlledBy = rsOwner ? { kind: rsOwner.kind, name: rsOwner.name } : { kind: 'ReplicaSet', name: podOwner.name }
                        }
                        catch { controlledBy = { kind: 'ReplicaSet', name: podOwner.name } }
                    }
                    else if (podOwner) {
                        controlledBy = { kind: podOwner.kind, name: podOwner.name }   // StatefulSet/DaemonSet/Job mandan directamente
                    }

                    // Provenance of the code: standard OCI annotations, backed by kwirth.io. With this the
                    // model can go from the pod to the source that built it.
                    const ann = pod.metadata?.annotations ?? {}
                    const sourceRepo = ann['org.opencontainers.image.source'] ?? ann['kwirth.io/source-repo']
                    const source = sourceRepo
                        ? { repo: sourceRepo, revision: ann['org.opencontainers.image.revision'] ?? ann['kwirth.io/source-ref'] }
                        : undefined

                    return {
                        name, namespace,
                        phase: status.phase, node: spec.nodeName, startTime: status.startTime,
                        reason: status.reason, message: status.message,
                        controlledBy,
                        source,
                        conditions: (status.conditions ?? []).map((x: TAnyObject) => ({ type: x.type, status: x.status, reason: x.reason })),
                        containers: (status.containerStatuses ?? []).map(containerStatus),
                        initContainers: (status.initContainerStatuses ?? []).map(containerStatus),
                        spec: { containers: (spec.containers ?? []).map(specContainer), restartPolicy: spec.restartPolicy }
                    }
                }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'describe_service',
            description: 'Diagnostic summary of a Service (equivalent to kubectl describe service): type, clusterIP, ports, selector, sessionAffinity, external/loadBalancer, AND its live Endpoints — the pod IPs currently backing it (ready vs not-ready). Best tool to see WHY traffic is not reaching pods (empty/not-ready endpoints = selector mismatch or unready pods).',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: nsName,
            execute: async ({ namespace, name }, host) => {
                const c = k8s(host, 'describe_service', { namespace, name })
                try {
                    const svc: TAnyObject = await c.coreApi.readNamespacedService({ name, namespace })
                    // The endpoints are best-effort: their absence must not hide the service's record.
                    const ep: TAnyObject | undefined = await c.coreApi.readNamespacedEndpoints({ name, namespace }).catch(() => undefined)
                    const address = (a: TAnyObject, ready: boolean, ports: TAnyObject[]) => ({
                        ip: a.ip, ready,
                        targetRef: a.targetRef ? `${a.targetRef.kind}/${a.targetRef.name}` : undefined,
                        ports: ports.map(p => p.port)
                    })
                    const endpoints = (ep?.subsets ?? []).flatMap((ss: TAnyObject) => [
                        ...(ss.addresses ?? []).map((a: TAnyObject) => address(a, true, ss.ports ?? [])),
                        ...(ss.notReadyAddresses ?? []).map((a: TAnyObject) => address(a, false, ss.ports ?? []))
                    ])
                    return {
                        name, namespace,
                        type: svc.spec?.type, clusterIP: svc.spec?.clusterIP, externalIPs: svc.spec?.externalIPs ?? [],
                        loadBalancer: svc.status?.loadBalancer?.ingress ?? [], sessionAffinity: svc.spec?.sessionAffinity,
                        selector: svc.spec?.selector ?? {},
                        ports: svc.spec?.ports?.map((p: TAnyObject) => ({ name: p.name, port: p.port, targetPort: p.targetPort, nodePort: p.nodePort, protocol: p.protocol })) ?? [],
                        endpoints,          // los pods que hay detrás AHORA MISMO; vacío = no sirve nadie
                        endpointCount: endpoints.length
                    }
                }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'describe_ingress',
            description: 'Diagnostic summary of an Ingress (equivalent to kubectl describe ingress): ingressClass, the routing rules (host → path → backend service:port), the default backend, TLS (hosts + secret), and the load-balancer address assigned by the controller. Use to see how external traffic is routed to services.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: nsName,
            execute: async ({ namespace, name }, host) => {
                const c = k8s(host, 'describe_ingress', { namespace, name })
                try {
                    const ing: TAnyObject = await c.networkApi.readNamespacedIngress({ name, namespace })
                    return {
                        name, namespace,
                        ingressClass: ing.spec?.ingressClassName,
                        defaultBackend: backendOf(ing.spec?.defaultBackend),
                        rules: (ing.spec?.rules ?? []).flatMap((r: TAnyObject) =>
                            (r.http?.paths ?? []).map((p: TAnyObject) => ({ host: r.host, path: p.path, pathType: p.pathType, backend: backendOf(p.backend) }))),
                        tls: (ing.spec?.tls ?? []).map((t: TAnyObject) => ({ hosts: t.hosts, secretName: t.secretName })),
                        loadBalancer: ing.status?.loadBalancer?.ingress ?? []
                    }
                }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'describe_controller',
            description: 'Diagnostic summary of a workload controller (equivalent to kubectl describe deployment/statefulset/daemonset/replicaset): replica counts (desired/ready/available/updated), rollout strategy, conditions (Available/Progressing + reason — why it is not fully rolled out), selector, and its pod template (image, resources, probes). Parametrised by kind, so one call covers any controller type.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the controller'),
                kind: z.enum(CONTROLLER_KINDS).describe('Controller kind'),
                name: z.string().describe('Name of the controller')
            }),
            execute: async ({ namespace, kind, name }, host) => {
                const c = k8s(host, 'describe_controller', { namespace, kind, name })
                try {
                    const obj = await readController(c.appsApi, kind, name, namespace)
                    const spec = obj.spec ?? {}
                    const status = obj.status ?? {}
                    const tpl = spec.template?.spec ?? {}

                    // A DaemonSet has no replicas: it has nodes where it is meant to run. Its own counters
                    // are reported instead of leaving the block at zero and looking as if it were down.
                    const replicas = kind === 'DaemonSet'
                        ? { desired: status.desiredNumberScheduled, current: status.currentNumberScheduled, ready: status.numberReady, available: status.numberAvailable, updated: status.updatedNumberScheduled }
                        : { desired: spec.replicas, ready: status.readyReplicas ?? 0, available: status.availableReplicas ?? 0, updated: status.updatedReplicas ?? 0 }

                    return {
                        kind, name, namespace,
                        replicas,
                        strategy: spec.strategy?.type ?? spec.updateStrategy?.type,
                        conditions: (status.conditions ?? []).map((x: TAnyObject) => ({ type: x.type, status: x.status, reason: x.reason, message: x.message })),
                        selector: spec.selector?.matchLabels ?? {},
                        template: {
                            containers: (tpl.containers ?? []).map(templateContainer),
                            initContainers: (tpl.initContainers ?? []).map(templateContainer),
                            serviceAccount: tpl.serviceAccountName
                        }
                    }
                }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'get_space_data',
            description: 'Describes a Kubernetes namespace (equivalent to kubectl describe namespace plus a rollup): its status and labels, ResourceQuota usage (used vs hard) and LimitRange defaults, plus the resources in it — pods (with restart count), deployments, services and configmap names.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({ namespace: z.string().describe('Name of the namespace to retrieve data for') }),
            execute: async ({ namespace }, host) => {
                const c = k8s(host, 'get_space_data', { namespace })
                try {
                    // ns/quota/limits are best-effort: missing RBAC for one must not hide the rest.
                    const [ns, p, d, s, cm, rq, lr] = await Promise.all([
                        c.coreApi.readNamespace({ name: namespace }).catch(() => undefined),
                        c.coreApi.listNamespacedPod({ namespace }),
                        c.appsApi.listNamespacedDeployment({ namespace }),
                        c.coreApi.listNamespacedService({ namespace }),
                        c.coreApi.listNamespacedConfigMap({ namespace }),
                        c.coreApi.listNamespacedResourceQuota({ namespace }).catch(() => ({ items: [] })),
                        c.coreApi.listNamespacedLimitRange({ namespace }).catch(() => ({ items: [] }))
                    ])
                    return {
                        namespace,
                        status: ns?.status?.phase,
                        labels: ns?.metadata?.labels ?? {},
                        resourceQuotas: rq.items.map(q => ({ name: q.metadata?.name, hard: q.status?.hard ?? q.spec?.hard ?? {}, used: q.status?.used ?? {} })),
                        limitRanges: lr.items.map(l => ({ name: l.metadata?.name, limits: l.spec?.limits ?? [] })),
                        pods: p.items.map(x => ({
                            name: x.metadata?.name,
                            phase: x.status?.phase,
                            nodeName: x.spec?.nodeName,
                            ready: x.status?.conditions?.find(c2 => c2.type === 'Ready')?.status === 'True',
                            restartCount: x.status?.containerStatuses?.reduce((sum, cs) => sum + cs.restartCount, 0) ?? 0
                        })),
                        deployments: d.items.map(x => ({ name: x.metadata?.name, replicas: x.spec?.replicas, readyReplicas: x.status?.readyReplicas ?? 0, image: x.spec?.template?.spec?.containers?.[0]?.image })),
                        services: s.items.map(x => ({ name: x.metadata?.name, type: x.spec?.type, clusterIP: x.spec?.clusterIP })),
                        configMaps: cm.items.map(x => x.metadata?.name)
                    }
                }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'get_rollout_history',
            description: 'Returns the rollout history (revisions) of a Deployment via its ReplicaSets: per revision the image(s), replicas and pod-template summary (env with inline VALUES and their configMap/secret source, resources, command). Use to see WHAT CHANGED recently — a new image tag, a changed inline env value, a resource/command change — that may have broken the pods. Compare the newest revision against the previous one. NOTE: a change to a ConfigMap/Secret VALUE does NOT create a revision — use get_workload_config_refs for that.',
            effect: EToolEffect.READ,
            // Revisions carry the `env` with their values in the clear: it is READ, but it shows more than a describe.
            sensitivity: EToolSensitivity.INTERNAL,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the deployment'),
                name: z.string().describe('Name of the Deployment (the owning workload, e.g. describe_pod.controlledBy.name — NOT the pod name)')
            }),
            execute: async ({ namespace, name }, host) => {
                const c = k8s(host, 'get_rollout_history', { namespace, name })
                try {
                    const rsList: TAnyObject = await c.appsApi.listNamespacedReplicaSet({ namespace })
                    const owned = (rsList.items ?? []).filter((rs: TAnyObject) =>
                        (rs.metadata?.ownerReferences ?? []).some((o: TAnyObject) => o.kind === 'Deployment' && o.name === name))

                    // The env goes with a value AND with provenance: the value so revisions can be
                    // compared, the provenance to know which ones have to be looked at separately (those
                    // do not change with a revision).
                    const container = (ct: TAnyObject) => ({
                        name: ct.name, image: ct.image, command: ct.command, args: ct.args, resources: ct.resources,
                        env: (ct.env ?? []).map((e: TAnyObject) => ({ name: e.name, value: e.value, from: envSource(e) }))
                    })

                    const revisions = owned.map((rs: TAnyObject) => {
                        const tmpl = rs.spec?.template?.spec ?? {}
                        return {
                            revision: Number(rs.metadata?.annotations?.['deployment.kubernetes.io/revision'] ?? 0),
                            replicaSet: rs.metadata?.name,
                            createdAt: rs.metadata?.creationTimestamp,
                            replicas: rs.spec?.replicas ?? 0,
                            readyReplicas: rs.status?.readyReplicas ?? 0,
                            containers: (tmpl.containers ?? []).map(container),
                            serviceAccount: tmpl.serviceAccountName,
                            securityContext: tmpl.securityContext
                        }
                    }).sort((a: { revision: number }, b: { revision: number }) => b.revision - a.revision)   // la más nueva primero

                    return { deployment: name, namespace, revisionCount: revisions.length, revisions }
                }
                catch (err) { return failed(err) }
            }
        }),

        // ── manifests completos ──────────────────────────────────────────────────────────────────────

        defineTool({
            name: 'get_pod_yaml',
            description: 'Returns the full Kubernetes Pod manifest (equivalent to kubectl get pod -o yaml): complete spec (env, volumes, resources, probes) and status. Use for deeper misconfiguration analysis after describe_pod.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.INTERNAL,   // el spec trae los env con sus valores en claro
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the pod'),
                name: z.string().describe('Name of the pod')
            }),
            execute: async ({ namespace, name }, host) => {
                const c = k8s(host, 'get_pod_yaml', { namespace, name })
                try { return await c.coreApi.readNamespacedPod({ name, namespace }) }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'get_deployment_yaml',
            description: 'Returns the full Kubernetes Deployment manifest (equivalent to kubectl get deployment -o yaml): the pod template (image, env, resources, probes) and strategy. Use to check if a pod problem comes from the owning workload spec.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.INTERNAL,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the deployment'),
                name: z.string().describe('Name of the deployment')
            }),
            execute: async ({ namespace, name }, host) => {
                const c = k8s(host, 'get_deployment_yaml', { namespace, name })
                try { return await c.appsApi.readNamespacedDeployment({ name, namespace }) }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'get_controller_yaml',
            description: 'Returns the full manifest of a workload controller (equivalent to kubectl get <kind> -o yaml), for ANY kind — Deployment, StatefulSet, DaemonSet or ReplicaSet. Complete metadata (uid, labels, annotations), spec (pod template, strategy) and status. Use when you need a specific field the describe summary does not include.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.INTERNAL,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the controller'),
                kind: z.enum(CONTROLLER_KINDS).describe('Controller kind'),
                name: z.string().describe('Name of the controller')
            }),
            execute: async ({ namespace, kind, name }, host) => {
                const c = k8s(host, 'get_controller_yaml', { namespace, kind, name })
                try { return await readController(c.appsApi, kind, name, namespace) }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'get_service_yaml',
            description: 'Returns the full Kubernetes Service manifest (equivalent to kubectl get service -o yaml) for a given namespace and service name.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace where the service lives'),
                name: z.string().describe('Name of the service')
            }),
            execute: async ({ namespace, name }, host) => {
                const c = k8s(host, 'get_service_yaml', { namespace, name })
                try { return await c.coreApi.readNamespacedService({ name, namespace }) }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'get_ingress_yaml',
            description: 'Returns the full Kubernetes Ingress manifest (equivalent to kubectl get ingress -o yaml) for a given namespace and ingress name.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace where the ingress lives'),
                name: z.string().describe('Name of the ingress')
            }),
            execute: async ({ namespace, name }, host) => {
                const c = k8s(host, 'get_ingress_yaml', { namespace, name })
                try { return await c.networkApi.readNamespacedIngress({ name, namespace }) }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'get_namespace_yaml',
            description: 'Returns the full Kubernetes Namespace manifest (equivalent to kubectl get namespace -o yaml): complete metadata (uid, labels, annotations, creationTimestamp), spec (finalizers) and status. Use when you need a specific field the namespace summary does not include (e.g. its uid).',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({ name: z.string().describe('Name of the namespace') }),
            execute: async ({ name }, host) => {
                const c = k8s(host, 'get_namespace_yaml', { name })
                try { return await c.coreApi.readNamespace({ name }) }
                catch (err) { return failed(err) }
            }
        })
    ]
}

export default k8sDescribe
