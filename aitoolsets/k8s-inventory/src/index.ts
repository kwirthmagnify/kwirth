import { IAiToolset, IToolHost, z } from '@kwirthmagnify/kwirth-common-ai/back'
import { ECapability, EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'

/*
    Toolset `k8s-inventory` — S1's second validation toolset (plan: plans/ai-tools/PLAN.md), and the one
    that really exercises the CONTRACT.

    `playground` proved the mechanics (package → publish → install → register → invoke) with two toy
    tools. Two tools that take a number and give back another say nothing about whether `ECapability` or
    `sensitivity` are well conceived: they ask the host for nothing, they read nothing and they do not
    tell a harmless `read` from a dangerous one. These eight do.

    ⚠️ `get_space_data` was here until 2026-09-17 and moved to `k8s-describe`: it describes ONE namespace,
    and that is what that package does, not this one. Here the answer is "what is there", there it is
    "what is wrong with this".

    They are OWN copies of seven of the 43 in common-ai, which are NOT touched: those live along the old
    route (`ctx()` over AsyncLocalStorage) until S3. Here they are written against the new contract — what
    each tool receives is an `IToolHost` with ONLY what is declared in `requires` — which is what has to
    be validated before freezing it.

    Everything is read-only: no tool of this toolset writes to the cluster.
*/

// The cluster is asked for, not assumed: when the host does not provision it, the tool says so instead
// of blowing up inside with a 'cannot read property of undefined'.
const k8s = (host: IToolHost, toolName: string, args: Record<string, unknown> = {}) => {
    host.trace(toolName, args)
    if (!host.k8s) throw new Error(`[k8s-inventory] '${toolName}' needs cluster access and the host did not provide it`)
    return host.k8s
}

/** A tool's failure is returned as data, not as an exception: the model has to be able to read it. */
const failed = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })

interface IObjectMetaTimes {
    managedFields?: { time?: Date | string }[]
    creationTimestamp?: Date | string
}

// ⚠️ `managedFields[].time` arrives as a Date with the typed client. It is normalised to ISO BEFORE
// sorting: sorting Dates with the default sort compares them as text ('Apr' < 'Aug' < 'Dec') and gives
// the wrong date. With ISO, lexicographic and chronological order are the same.
const iso = (t: Date | string | undefined): string | undefined => {
    if (!t) return undefined
    const d = t instanceof Date ? t : new Date(t)
    return isNaN(d.getTime()) ? undefined : d.toISOString()
}

const lastModifiedOf = (meta: IObjectMetaTimes | undefined): string | undefined => {
    const times = (meta?.managedFields ?? []).map(f => iso(f.time)).filter((t): t is string => Boolean(t))
    return times.length ? times.sort()[times.length - 1] : iso(meta?.creationTimestamp)
}

interface IConfigRef { kind: 'ConfigMap' | 'Secret', name: string, via: string }

/** The same object referenced in several ways: the reasons are gathered into a list. */
interface IMergedConfigRef { kind: 'ConfigMap' | 'Secret', name: string, via: string[] }

// The ConfigMap/Secret references a pod template consumes: envFrom, env.valueFrom and volumes.
const configRefsOfPodSpec = (spec: Record<string, any> | undefined): IConfigRef[] => {
    const refs: IConfigRef[] = []
    const add = (kind: 'ConfigMap' | 'Secret', name: string | undefined, via: string) => { if (name) refs.push({ kind, name, via }) }
    for (const ct of [...(spec?.containers ?? []), ...(spec?.initContainers ?? [])]) {
        for (const ef of ct.envFrom ?? []) {
            add('ConfigMap', ef.configMapRef?.name, `envFrom(${ct.name})`)
            add('Secret', ef.secretRef?.name, `envFrom(${ct.name})`)
        }
        for (const e of ct.env ?? []) {
            add('ConfigMap', e.valueFrom?.configMapKeyRef?.name, `env ${e.name}`)
            add('Secret', e.valueFrom?.secretKeyRef?.name, `env ${e.name}`)
        }
    }
    for (const v of spec?.volumes ?? []) {
        add('ConfigMap', v.configMap?.name, `volume ${v.name}`)
        add('Secret', v.secret?.secretName, `volume ${v.name}`)
    }
    return refs
}

/** '*' and empty mean the same thing: every namespace. */
const nsFilter = (namespace: unknown): string | undefined =>
    typeof namespace === 'string' && namespace && namespace !== '*' ? namespace : undefined

const k8sInventory: IAiToolset = {
    id: 'k8s-inventory',
    version: '0.2.0',
    displayName: 'K8s Inventory',
    description: 'Read-only inventory of the Kubernetes cluster: namespaces, nodes, workloads, services and ingresses',
    requires: [ECapability.K8S],
    tools: [
        {
            name: 'list_namespaces',
            description: 'Lists all namespaces in the cluster with their status and labels.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({}),
            execute: async (_args, host) => {
                const c = k8s(host, 'list_namespaces')
                try {
                    const resp = await c.coreApi.listNamespace()
                    return {
                        namespaces: resp.items.map(ns => ({
                            name: ns.metadata?.name,
                            uid: ns.metadata?.uid,
                            status: ns.status?.phase,
                            labels: ns.metadata?.labels ?? {}
                        }))
                    }
                }
                catch (err) { return failed(err) }
            }
        },
        {
            name: 'get_cluster_data',
            description: 'Returns general cluster info: name, flavour (AKS/EKS/GKE/k3s/k3d), total vCPUs, total memory, node count and readiness status.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({}),
            execute: async (_args, host) => {
                const c = k8s(host, 'get_cluster_data')
                try {
                    const resp = await c.coreApi.listNode()
                    return {
                        name: c.name,
                        flavour: c.flavour,
                        vcpus: c.vcpus,
                        memoryGB: Math.round(c.memory / 1024 / 1024 / 1024 * 100) / 100,
                        nodeCount: resp.items.length,
                        nodes: resp.items.map(n => ({
                            name: n.metadata?.name,
                            cpu: n.status?.capacity?.['cpu'],
                            memoryKi: n.status?.capacity?.['memory'],
                            ready: n.status?.conditions?.find(x => x.type === 'Ready')?.status === 'True',
                            unschedulable: n.spec?.unschedulable ?? false
                        }))
                    }
                }
                catch (err) { return failed(err) }
            }
        },
        {
            name: 'get_node_data',
            description: 'Returns configuration info about all Kubernetes nodes (name, IP, max pods). Configuration only — not workload or usage data.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({}),
            execute: async (_args, host) => {
                // The node map is kept by the core and lent by the capability: there is no call to the cluster.
                const c = k8s(host, 'get_node_data')
                return { nodes: [...c.nodes.values()] }
            }
        },
        {
            name: 'get_workload_data',
            description: 'Returns all workloads in the cluster: deployments, statefulsets, daemonsets, pods and services. Optionally filter by namespace.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({ namespace: z.string().optional().describe('Namespace to filter results (omit or pass "*" for all namespaces)') }),
            execute: async (args, host) => {
                const ns = nsFilter(args.namespace)
                const c = k8s(host, 'get_workload_data', { namespace: ns ?? '*' })
                try {
                    const [d, s, ds, p, svc] = await Promise.all([
                        ns ? c.appsApi.listNamespacedDeployment({ namespace: ns }) : c.appsApi.listDeploymentForAllNamespaces(),
                        ns ? c.appsApi.listNamespacedStatefulSet({ namespace: ns }) : c.appsApi.listStatefulSetForAllNamespaces(),
                        ns ? c.appsApi.listNamespacedDaemonSet({ namespace: ns }) : c.appsApi.listDaemonSetForAllNamespaces(),
                        ns ? c.coreApi.listNamespacedPod({ namespace: ns }) : c.coreApi.listPodForAllNamespaces(),
                        ns ? c.coreApi.listNamespacedService({ namespace: ns }) : c.coreApi.listServiceForAllNamespaces()
                    ])
                    return {
                        deployments: d.items.map(x => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, replicas: x.spec?.replicas, readyReplicas: x.status?.readyReplicas ?? 0, availableReplicas: x.status?.availableReplicas ?? 0 })),
                        statefulSets: s.items.map(x => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, replicas: x.spec?.replicas, readyReplicas: x.status?.readyReplicas ?? 0 })),
                        daemonSets: ds.items.map(x => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, desired: x.status?.desiredNumberScheduled, ready: x.status?.numberReady })),
                        pods: p.items.map(x => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, nodeName: x.spec?.nodeName, phase: x.status?.phase, ready: x.status?.conditions?.find(c2 => c2.type === 'Ready')?.status === 'True' })),
                        services: svc.items.map(x => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, type: x.spec?.type, clusterIP: x.spec?.clusterIP }))
                    }
                }
                catch (err) { return failed(err) }
            }
        },
        {
            name: 'list_services',
            description: 'Lists all Services in the cluster with full details (type, clusterIP, ports, selector). Optionally filter by namespace.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({ namespace: z.string().optional().describe('Namespace to filter results (omit or pass "*" for all namespaces)') }),
            execute: async (args, host) => {
                const ns = nsFilter(args.namespace)
                const c = k8s(host, 'list_services', { namespace: ns ?? '*' })
                try {
                    const resp = ns
                        ? await c.coreApi.listNamespacedService({ namespace: ns })
                        : await c.coreApi.listServiceForAllNamespaces()
                    return {
                        services: resp.items.map(x => ({
                            name: x.metadata?.name,
                            namespace: x.metadata?.namespace,
                            type: x.spec?.type,
                            clusterIP: x.spec?.clusterIP,
                            externalIPs: x.spec?.externalIPs ?? [],
                            ports: x.spec?.ports?.map(p => ({ name: p.name, port: p.port, targetPort: p.targetPort, protocol: p.protocol })) ?? [],
                            selector: x.spec?.selector ?? {}
                        }))
                    }
                }
                catch (err) { return failed(err) }
            }
        },
        {
            name: 'list_ingresses',
            description: 'Lists all Ingresses in the cluster (hosts, paths, TLS, backend services). Optionally filter by namespace.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({ namespace: z.string().optional().describe('Namespace to filter results (omit or pass "*" for all namespaces)') }),
            execute: async (args, host) => {
                const ns = nsFilter(args.namespace)
                const c = k8s(host, 'list_ingresses', { namespace: ns ?? '*' })
                try {
                    const resp = ns
                        ? await c.networkApi.listNamespacedIngress({ namespace: ns })
                        : await c.networkApi.listIngressForAllNamespaces()
                    return {
                        ingresses: resp.items.map(x => ({
                            name: x.metadata?.name,
                            namespace: x.metadata?.namespace,
                            ingressClass: x.spec?.ingressClassName,
                            hosts: x.spec?.rules?.map(r => r.host) ?? [],
                            paths: x.spec?.rules?.flatMap(r =>
                                r.http?.paths?.map(p => ({ host: r.host, path: p.path, pathType: p.pathType, service: p.backend?.service?.name, port: p.backend?.service?.port?.number })) ?? []
                            ) ?? [],
                            tls: x.spec?.tls?.map(t => ({ secretName: t.secretName, hosts: t.hosts })) ?? [],
                            loadBalancer: x.status?.loadBalancer?.ingress ?? []
                        }))
                    }
                }
                catch (err) { return failed(err) }
            }
        },
        {
            name: 'get_workload_config_refs',
            // ⚠️ It is READ, but it is NOT public: it enumerates the Secrets a deployment consumes. It does
            // not return their content — the names already say plenty — and that is precisely the
            // distinction this toolset comes to exercise: the effect axis and the sensitivity axis are
            // independent.
            description: 'Given a Deployment, lists the ConfigMaps and Secrets its pods consume (via envFrom, env valueFrom and volumes), each with its lastModified time and resourceVersion. Use it on a crash to find a config source that CHANGED WITHOUT A ROLLOUT: editing a ConfigMap/Secret value keeps the same env spec (no new revision) yet can break the pod — compare each reference lastModified against when the pods started crashing.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.INTERNAL,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the deployment'),
                name: z.string().describe('Name of the Deployment')
            }),
            execute: async (args, host) => {
                const namespace = String(args.namespace)
                const name = String(args.name)
                const c = k8s(host, 'get_workload_config_refs', { namespace, name })
                try {
                    const dep = await c.appsApi.readNamespacedDeployment({ name, namespace })
                    // dedupe by kind+name, gathering the reasons (an object can be referenced in several ways)
                    const byKey = new Map<string, IMergedConfigRef>()
                    for (const r of configRefsOfPodSpec(dep.spec?.template?.spec as Record<string, any> | undefined)) {
                        const cur = byKey.get(`${r.kind}/${r.name}`) ?? { kind: r.kind, name: r.name, via: [] as string[] }
                        if (!cur.via.includes(r.via)) cur.via.push(r.via)
                        byKey.set(`${r.kind}/${r.name}`, cur)
                    }
                    const refs = await Promise.all([...byKey.values()].map(async r => {
                        try {
                            const meta = (r.kind === 'ConfigMap'
                                ? await c.coreApi.readNamespacedConfigMap({ name: r.name, namespace })
                                : await c.coreApi.readNamespacedSecret({ name: r.name, namespace })).metadata
                            return { ...r, resourceVersion: meta?.resourceVersion, lastModified: lastModifiedOf(meta) }
                        }
                        catch (err) { return { ...r, ...failed(err) } }
                    }))
                    return { deployment: name, namespace, refs }
                }
                catch (err) { return failed(err) }
            }
        }
    ]
}

export default k8sInventory
