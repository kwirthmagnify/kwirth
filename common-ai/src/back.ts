import { IBackChannelObject } from '@kwirthmagnify/kwirth-common'
import { ILlm, ILlmModel, ILlmProvider, IAgent } from './index'
import { LanguageModel, tool, generateText, stepCountIs } from 'ai'
import { z } from 'zod'
import { AsyncLocalStorage } from 'async_hooks'
import { exec } from 'child_process'
import { promisify } from 'util'
import * as tls from 'tls'

const execAsync = promisify(exec)
import { createOpenAI } from '@ai-sdk/openai'
import { createGroq } from '@ai-sdk/groq'
import { createMistral } from '@ai-sdk/mistral'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createDeepSeek } from '@ai-sdk/deepseek'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export const buildModel = (llm: ILlm, providers: ILlmProvider[]): LanguageModel | null => {
    const key = llm.useProviderKey ? providers.find(p => p.name === llm.provider)?.key : llm.key
    if (!key) {
        console.log('Could not find a key')
        return null
    }
    switch (llm.provider) {
        case 'openai': return createOpenAI({ apiKey: key })(llm.model)
        case 'groq': return createGroq({ apiKey: key })(llm.model)
        case 'mistral': return createMistral({ apiKey: key })(llm.model)
        case 'google': return createGoogleGenerativeAI({ apiKey: key })(llm.model)
        case 'deepseek': return createDeepSeek({ apiKey: key })(llm.model)
        case 'openrouter': return createOpenRouter({ apiKey: key })(llm.model)
        default: 
            console.log('Invalid provider', llm.provider)
            return null
    }
}

export const loadModels = async (providers: ILlmProvider[], log: IBackChannelObject) => {
    log.logInfo?.('Loading AI models...')
    for (const provider of providers) {
        try {
            switch (provider.name) {
                case 'deepseek': {
                    const resp = await fetch('https://api.deepseek.com/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json() as any
                    provider.models = data.data.filter((m: { object: string }) => m.object === 'model').map((m: { id: string; description: string }) => ({
                        id: m.id, name: m.id, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'google': {
                    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${provider.key}`)
                    const data = await resp.json() as any
                    provider.models = data.models.map((m: { name: string; displayName: string; description: string }) => ({
                        id: m.name.startsWith('models/') ? m.name.substring(7) : m.name,
                        name: m.displayName,
                        description: m.description,
                        type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'groq': {
                    const resp = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json() as any
                    provider.models = data.data.filter((m: { object: string; active: boolean }) => m.object === 'model' && m.active).map((m: { id: string; description: string }) => ({
                        id: m.id, name: m.id, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'openai': {
                    const resp = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json() as any
                    provider.models = data.data.filter((m: { object: string }) => m.object === 'model').map((m: { id: string; description: string }) => ({
                        id: m.id, name: m.id, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'openrouter': {
                    const resp = await fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json() as any
                    provider.models = data.data.map((m: { id: string; name: string; description: string }) => ({
                        id: m.id, name: m.name, description: m.description, type: 'text'
                    } satisfies ILlmModel))
                    break
                }
                case 'mistral': {
                    const resp = await fetch('https://api.mistral.ai/v1/models', { headers: { Authorization: 'Bearer ' + provider.key } })
                    const data = await resp.json() as any
                    provider.models = data.data.filter((m: { object: string }) => m.object === 'model').map((m: { id: string; description: string; capabilities?: { completion_chat?: boolean } }) => ({
                        id: m.id, name: m.id, description: m.description,
                        type: m.capabilities?.completion_chat === true ? 'text' : 'other'
                    } satisfies ILlmModel))
                    break
                }
                case 'kwirth':
                    provider.models = [
                        { id: 'alberto-1-flash-gordon-lite', name: 'Alberto model quick response', description: 'Albert #1 model', type: 'text' },
                        { id: 'alberto-1.5-python-forever', name: 'Alberto model legacy frameworks', description: 'Albert Pythoneer', type: 'text' }
                    ]
                    break
                default:
                    log.logWarning?.(`Provider '${provider.name}' is not implemented, will not be available.`)
            }
            log.logInfo?.(`Provider '${provider.name}' loaded ${provider.models.length} models`)
        }
        catch (err) {
            log.logError?.(`Error loading models from provider '${provider.name}': ${err}`)
        }
    }
}

const inferZod = (value: unknown): z.ZodTypeAny => {
    if (Array.isArray(value))
        return value.length > 0 ? z.array(inferZod(value[0])) : z.array(z.unknown())
    if (typeof value === 'string')  return z.string()
    if (typeof value === 'number')  return z.number()
    if (typeof value === 'boolean') return z.boolean()
    if (value !== null && typeof value === 'object')
        return zodFromExample(value as Record<string, unknown>)
    return z.unknown()
}

// Re-export AI SDK symbols so plugins can use them without bundling the SDK
export { generateText, Output, stepCountIs, tool } from 'ai'
export { z } from 'zod'

export const zodFromExample = (example: Record<string, unknown>): z.ZodObject<Record<string, z.ZodTypeAny>> => {
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, value] of Object.entries(example)) {
        shape[key] = inferZod(value)
    }
    return z.object(shape)
}

// ── TOOL SYSTEM ──────────────────────────────────────────────────────────────

// Git host credentials for source investigation (get_source_file). The consumer provisions these (Agora keeps
// them in its own per-channel config); consumers that leave sourceRepos empty can only reach public repos.
export interface ISourceRepoCred {
    host: string                       // e.g. 'github.com', 'gitlab.com', 'gitlab.mycompany.com'
    type: 'github' | 'gitlab'
    token: string
    apiBaseUrl?: string                // on-prem API override (e.g. 'https://gitlab.mycompany.com/api/v4')
}

export interface IToolContext {
    origin: string
    nodes: Map<string, any>
    clusterInfo: any
    clusterMetrics: any[]
    clusterEvents?: any[]   // recent k8s events buffer ({type, obj}), optional for backward compat
    sourceRepos?: ISourceRepoCred[]   // git credentials for get_source_file (optional; Agora provisions them)
    trace: (toolName: string, args: Record<string, unknown>) => void
}

// Parse a repo reference (full URL or 'owner/name'; bare form assumes github.com). Owner keeps GitLab subgroups.
const parseRepoRef = (repo: string): { host: string; projectPath: string } => {
    let host = 'github.com'
    let pathPart = repo.trim()
    const m = pathPart.match(/^(?:git@|https?:\/\/)?([^/:]+)[/:](.+)$/)
    if (m && m[1].includes('.')) { host = m[1]; pathPart = m[2] }
    const projectPath = pathPart.replace(/\.git$/, '').replace(/^\/+|\/+$/g, '')
    return { host, projectPath }
}

// Fetch one file's raw content at a ref from GitHub or GitLab (cloud or on-prem), using the matching cred.
const fetchSourceFile = async (cred: ISourceRepoCred, projectPath: string, ref: string, path: string): Promise<string> => {
    const cleanPath = path.replace(/^\/+/, '')
    if (cred.type === 'github') {
        const base = cred.apiBaseUrl ?? 'https://api.github.com'
        const url = `${base}/repos/${projectPath}/contents/${cleanPath.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${cred.token}`, Accept: 'application/vnd.github.raw', 'User-Agent': 'kwirth-agora' } })
        if (!resp.ok) throw new Error(`GitHub ${resp.status} for ${projectPath}/${cleanPath}@${ref}`)
        return await resp.text()
    }
    const base = cred.apiBaseUrl ?? `https://${cred.host}/api/v4`
    const url = `${base}/projects/${encodeURIComponent(projectPath)}/repository/files/${encodeURIComponent(cleanPath)}/raw?ref=${encodeURIComponent(ref)}`
    const resp = await fetch(url, { headers: { 'PRIVATE-TOKEN': cred.token, 'User-Agent': 'kwirth-agora' } })
    if (!resp.ok) throw new Error(`GitLab ${resp.status} for ${projectPath}/${cleanPath}@${ref}`)
    return await resp.text()
}

// Effect of a tool: READ (safe, informational) or WRITE (has side effects on the cluster).
// Dual purpose: hints the LLM, and gates authorization (Agora/readOnly filter out WRITE).
export enum EToolEffect {
    READ = 'read',
    WRITE = 'write'
}

export interface IToolInfo {
    name: string
    description: string
    effect: EToolEffect
}

const toolContextStorage = new AsyncLocalStorage<IToolContext>()

export const runWithToolContext = <T>(context: IToolContext, fn: () => Promise<T>): Promise<T> =>
    toolContextStorage.run(context, fn)

const ctx = (): IToolContext => {
    const store = toolContextStorage.getStore()
    if (!store) throw new Error('[common-ai] Tool executed outside runWithToolContext')
    return store
}

function mapToJson(data: any): any {
    if (data instanceof Map) {
        const obj: Record<string, any> = {}
        for (const [key, value] of data.entries()) obj[String(key)] = mapToJson(value)
        return obj
    }
    if (Array.isArray(data)) return data.map(mapToJson)
    if (data !== null && typeof data === 'object') {
        const obj: Record<string, any> = {}
        for (const key of Object.keys(data)) obj[key] = mapToJson(data[key])
        return obj
    }
    return data
}

// Compact, LLM-friendly view of one buffered event ({type, obj}): a CoreV1Event (kind='Event') or an
// object lifecycle change.
const summarizeClusterEvent = (e: any): Record<string, unknown> => {
    const o = e?.obj ?? {}
    if (o.kind === 'Event') {
        return {
            kind: 'Event',
            eventType: o.type,          // Normal | Warning
            reason: o.reason,
            message: o.message,
            involved: o.involvedObject ? { kind: o.involvedObject.kind, name: o.involvedObject.name, namespace: o.involvedObject.namespace } : undefined,
            count: o.count,
            lastTimestamp: o.lastTimestamp ?? o.eventTime
        }
    }
    return {
        changeType: e?.type,            // ADDED | MODIFIED
        kind: o.kind,
        name: o.metadata?.name,
        namespace: o.metadata?.namespace
    }
}

// Best-effort "last modified" of a k8s object: the newest managedFields time (each apply stamps one),
// falling back to creationTimestamp. k8s keeps no explicit lastModified, so this is the closest signal to
// "when did this ConfigMap/Secret last change" — used to correlate a config edit with a crash.
const lastModifiedOf = (meta: any): string | undefined => {
    const times: string[] = (meta?.managedFields ?? []).map((f: any) => f.time).filter(Boolean)
    return times.length ? times.sort()[times.length - 1] : meta?.creationTimestamp
}

// The ConfigMap/Secret references a pod template consumes: envFrom, env.valueFrom, and volumes.
const configRefsOfPodSpec = (spec: any): { kind: 'ConfigMap' | 'Secret'; name: string; via: string }[] => {
    const refs: { kind: 'ConfigMap' | 'Secret'; name: string; via: string }[] = []
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

export const tools = {

    // ── CLUSTER CONFIG ───────────────────────────────────────────────────────

    list_namespaces: tool({
        description: 'Lists all namespaces in the cluster with their status and labels.',
        inputSchema: z.object({}),
        execute: async () => {
            ctx().trace('list_namespaces', {})
            try {
                const resp = await ctx().clusterInfo.coreApi.listNamespace()
                return {
                    namespaces: resp.items.map((ns: any) => ({
                        name: ns.metadata?.name,
                        status: ns.status?.phase,
                        labels: ns.metadata?.labels ?? {}
                    }))
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_node_data: tool({
        description: 'Returns configuration info about all Kubernetes nodes (name, IP). Configuration only — not workload or usage data.',
        inputSchema: z.object({}),
        execute: async () => { ctx().trace('get_node_data', {}); return mapToJson(ctx().nodes) }
    }),

    get_cluster_data: tool({
        description: 'Returns general cluster info: name, flavour (AKS/EKS/GKE/k3s/k3d), total vCPUs, total memory, node count and readiness status.',
        inputSchema: z.object({}),
        execute: async () => {
            ctx().trace('get_cluster_data', {})
            try {
                const resp = await ctx().clusterInfo.coreApi.listNode()
                return { name: ctx().clusterInfo.name, flavour: ctx().clusterInfo.flavour, vcpus: ctx().clusterInfo.vcpus, memoryGB: Math.round(ctx().clusterInfo.memory / 1024 / 1024 / 1024 * 100) / 100, nodeCount: resp.items.length, nodes: resp.items.map((n: any) => ({ name: n.metadata?.name, cpu: n.status?.capacity?.['cpu'], memoryKi: n.status?.capacity?.['memory'], ready: n.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True', unschedulable: n.spec?.unschedulable ?? false })) }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_workload_data: tool({
        description: 'Returns all workloads in the cluster: deployments, statefulsets, daemonsets, pods and services. Optionally filter by namespace.',
        inputSchema: z.object({ namespace: z.string().optional().describe('Namespace to filter results (omit or pass "*" for all namespaces)') }),
        execute: async ({ namespace }) => {
            const ns = namespace && namespace !== '*' ? namespace : undefined
            ctx().trace('get_workload_data', { namespace: ns ?? '*' })
            try {
                const c = ctx().clusterInfo
                const [d, s, ds, p, svc] = await Promise.all([
                    ns ? c.appsApi.listNamespacedDeployment({ namespace: ns }) : c.appsApi.listDeploymentForAllNamespaces(),
                    ns ? c.appsApi.listNamespacedStatefulSet({ namespace: ns }) : c.appsApi.listStatefulSetForAllNamespaces(),
                    ns ? c.appsApi.listNamespacedDaemonSet({ namespace: ns }) : c.appsApi.listDaemonSetForAllNamespaces(),
                    ns ? c.coreApi.listNamespacedPod({ namespace: ns }) : c.coreApi.listPodForAllNamespaces(),
                    ns ? c.coreApi.listNamespacedService({ namespace: ns }) : c.coreApi.listServiceForAllNamespaces()
                ])
                return {
                    deployments: d.items.map((x: any) => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, replicas: x.spec?.replicas, readyReplicas: x.status?.readyReplicas ?? 0, availableReplicas: x.status?.availableReplicas ?? 0 })),
                    statefulSets: s.items.map((x: any) => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, replicas: x.spec?.replicas, readyReplicas: x.status?.readyReplicas ?? 0 })),
                    daemonSets: ds.items.map((x: any) => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, desired: x.status?.desiredNumberScheduled, ready: x.status?.numberReady })),
                    pods: p.items.map((x: any) => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, nodeName: x.spec?.nodeName, phase: x.status?.phase, ready: x.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True' })),
                    services: svc.items.map((x: any) => ({ name: x.metadata?.name, namespace: x.metadata?.namespace, type: x.spec?.type, clusterIP: x.spec?.clusterIP }))
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_space_data: tool({
        description: 'Returns all resources in a specific Kubernetes namespace: pods (with restart count), deployments, services, configmap names.',
        inputSchema: z.object({ namespace: z.string().describe('Name of the namespace to retrieve data for') }),
        execute: async ({ namespace }) => {
            ctx().trace('get_space_data', { namespace })
            try {
                const c = ctx().clusterInfo
                const [p, d, s, cm] = await Promise.all([c.coreApi.listNamespacedPod({ namespace }), c.appsApi.listNamespacedDeployment({ namespace }), c.coreApi.listNamespacedService({ namespace }), c.coreApi.listNamespacedConfigMap({ namespace })])
                return {
                    namespace,
                    pods: p.items.map((x: any) => ({ name: x.metadata?.name, phase: x.status?.phase, nodeName: x.spec?.nodeName, ready: x.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True', restartCount: x.status?.containerStatuses?.reduce((sum: number, cs: any) => sum + cs.restartCount, 0) ?? 0 })),
                    deployments: d.items.map((x: any) => ({ name: x.metadata?.name, replicas: x.spec?.replicas, readyReplicas: x.status?.readyReplicas ?? 0, image: x.spec?.template?.spec?.containers?.[0]?.image })),
                    services: s.items.map((x: any) => ({ name: x.metadata?.name, type: x.spec?.type, clusterIP: x.spec?.clusterIP })),
                    configMaps: cm.items.map((x: any) => x.metadata?.name)
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_service_yaml: tool({
        description: 'Returns the full Kubernetes Service manifest (equivalent to kubectl get service -o yaml) for a given namespace and service name.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace where the service lives'),
            name: z.string().describe('Name of the service')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_service_yaml', { namespace, name })
            try {
                const svc = await ctx().clusterInfo.coreApi.readNamespacedService({ name, namespace })
                return svc
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    list_services: tool({
        description: 'Lists all Services in the cluster with full details (type, clusterIP, ports, selector). Optionally filter by namespace.',
        inputSchema: z.object({ namespace: z.string().optional().describe('Namespace to filter results (omit or pass "*" for all namespaces)') }),
        execute: async ({ namespace }) => {
            const ns = namespace && namespace !== '*' ? namespace : undefined
            ctx().trace('list_services', { namespace: ns ?? '*' })
            try {
                const c = ctx().clusterInfo
                const resp = ns
                    ? await c.coreApi.listNamespacedService({ namespace: ns })
                    : await c.coreApi.listServiceForAllNamespaces()
                return {
                    services: resp.items.map((x: any) => ({
                        name: x.metadata?.name,
                        namespace: x.metadata?.namespace,
                        type: x.spec?.type,
                        clusterIP: x.spec?.clusterIP,
                        externalIPs: x.spec?.externalIPs ?? [],
                        ports: x.spec?.ports?.map((p: any) => ({ name: p.name, port: p.port, targetPort: p.targetPort, protocol: p.protocol })) ?? [],
                        selector: x.spec?.selector ?? {}
                    }))
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    list_ingresses: tool({
        description: 'Lists all Ingresses in the cluster (hosts, paths, TLS, backend services). Optionally filter by namespace.',
        inputSchema: z.object({ namespace: z.string().optional().describe('Namespace to filter results (omit or pass "*" for all namespaces)') }),
        execute: async ({ namespace }) => {
            const ns = namespace && namespace !== '*' ? namespace : undefined
            ctx().trace('list_ingresses', { namespace: ns ?? '*' })
            try {
                const c = ctx().clusterInfo
                const resp = ns
                    ? await c.networkApi.listNamespacedIngress({ namespace: ns })
                    : await c.networkApi.listIngressForAllNamespaces()
                return {
                    ingresses: resp.items.map((x: any) => ({
                        name: x.metadata?.name,
                        namespace: x.metadata?.namespace,
                        ingressClass: x.spec?.ingressClassName,
                        hosts: x.spec?.rules?.map((r: any) => r.host) ?? [],
                        paths: x.spec?.rules?.flatMap((r: any) =>
                            r.http?.paths?.map((p: any) => ({ host: r.host, path: p.path, pathType: p.pathType, service: p.backend?.service?.name, port: p.backend?.service?.port?.number })) ?? []
                        ) ?? [],
                        tls: x.spec?.tls?.map((t: any) => ({ secretName: t.secretName, hosts: t.hosts })) ?? [],
                        loadBalancer: x.status?.loadBalancer?.ingress ?? []
                    }))
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_ingress_yaml: tool({
        description: 'Returns the full Kubernetes Ingress manifest (equivalent to kubectl get ingress -o yaml) for a given namespace and ingress name.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace where the ingress lives'),
            name: z.string().describe('Name of the ingress')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_ingress_yaml', { namespace, name })
            try {
                const ing = await ctx().clusterInfo.networkApi.readNamespacedIngress({ name, namespace })
                return ing
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    // ── CURRENT USAGE ────────────────────────────────────────────────────────

    get_cluster_usage: tool({
        description: 'Returns current overall cluster resource usage: CPU%, memory%, network Mbps, total vCPUs and total memory GB.',
        inputSchema: z.object({}),
        execute: async () => {
            ctx().trace('get_cluster_usage', {})
            if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
            const latest = ctx().clusterMetrics[ctx().clusterMetrics.length - 1]
            return { vcpus: latest.cluster.vcpus, memoryGB: Math.round(latest.cluster.memory / 1024 / 1024 / 1024 * 100) / 100, cpuUsagePercent: Math.round(latest.cluster.cpuUsage * 100) / 100, memoryUsagePercent: Math.round(latest.cluster.memoryUsage * 100) / 100, networkTxMbps: Math.round(latest.cluster.txmbps * 100) / 100, networkRxMbps: Math.round(latest.cluster.rxmbps * 100) / 100, metricsIntervalSeconds: latest.metricsInterval }
        }
    }),

    get_node_usage: tool({
        description: 'Returns current CPU and memory usage for one node or all nodes from the latest metrics reading.',
        inputSchema: z.object({ nodeName: z.string().optional().describe('Node name to filter (omit for all nodes)') }),
        execute: async ({ nodeName }) => {
            ctx().trace('get_node_usage', { nodeName: nodeName ?? '*' })
            if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
            const latest = ctx().clusterMetrics[ctx().clusterMetrics.length - 1]
            const nodes = nodeName ? latest.nodes.filter((n: any) => n.name === nodeName) : latest.nodes
            return nodes.map((n: any) => ({ name: n.name, cpuMillicores: Math.round((n.summary?.cpu?.usageNanoCores ?? 0) / 1_000_000), memoryMB: Math.round((n.summary?.memory?.workingSetBytes ?? 0) / 1024 / 1024), networkRxMB: Math.round((n.summary?.network?.rxBytes ?? 0) / 1024 / 1024), networkTxMB: Math.round((n.summary?.network?.txBytes ?? 0) / 1024 / 1024), podCount: n.summary?.pods?.length ?? 0, timestamp: n.timestamp }))
        }
    }),

    get_deployment_usage: tool({
        description: 'Returns current aggregated CPU and memory usage for all pods belonging to a specific deployment.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the deployment'), name: z.string().describe('Name of the deployment') }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_deployment_usage', { namespace, name })
            try {
                if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
                const latest = ctx().clusterMetrics[ctx().clusterMetrics.length - 1]
                const c = ctx().clusterInfo
                const deployResp = await c.appsApi.readNamespacedDeployment({ name, namespace })
                const labelSelector = Object.entries(deployResp.spec?.selector?.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(',')
                const podsResp = await c.coreApi.listNamespacedPod({ namespace, labelSelector })
                const podNames = new Set(podsResp.items.map((p: any) => p.metadata?.name))
                let totalCpu = 0, totalMem = 0, podCount = 0
                for (const node of latest.nodes) for (const pod of (node.summary?.pods ?? [])) if (pod.podRef?.namespace === namespace && podNames.has(pod.podRef?.name)) { totalCpu += pod.cpu?.usageNanoCores ?? 0; totalMem += pod.memory?.workingSetBytes ?? 0; podCount++ }
                return { deployment: name, namespace, podCount, cpuMillicores: Math.round(totalCpu / 1_000_000), memoryMB: Math.round(totalMem / 1024 / 1024), timestamp: latest.nodes[0]?.timestamp }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    // ── HISTORICAL USAGE ─────────────────────────────────────────────────────

    get_prev_cluster_usage: tool({
        description: 'Returns historical overall cluster usage over the last N metrics readings (CPU%, memory%, network Mbps).',
        inputSchema: z.object({ count: z.number().optional().describe('Number of historical readings to return (default: 5)') }),
        execute: async ({ count = 5 }) => {
            ctx().trace('get_prev_cluster_usage', { count })
            if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
            return ctx().clusterMetrics.slice(-count).map((r: any) => ({ vcpus: r.cluster.vcpus, memoryGB: Math.round(r.cluster.memory / 1024 / 1024 / 1024 * 100) / 100, cpuUsagePercent: Math.round(r.cluster.cpuUsage * 100) / 100, memoryUsagePercent: Math.round(r.cluster.memoryUsage * 100) / 100, networkTxMbps: Math.round(r.cluster.txmbps * 100) / 100, networkRxMbps: Math.round(r.cluster.rxmbps * 100) / 100 }))
        }
    }),

    get_prev_node_usage: tool({
        description: 'Returns historical CPU and memory usage for one or all nodes over the last N metrics readings.',
        inputSchema: z.object({ nodeName: z.string().optional().describe('Node name to filter (omit for all nodes)'), count: z.number().optional().describe('Number of historical readings (default: 5)') }),
        execute: async ({ nodeName, count = 5 }) => {
            ctx().trace('get_prev_node_usage', { nodeName: nodeName ?? '*', count })
            if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
            return ctx().clusterMetrics.slice(-count).map((r: any) => ({ nodes: (nodeName ? r.nodes.filter((n: any) => n.name === nodeName) : r.nodes).map((n: any) => ({ name: n.name, cpuMillicores: Math.round((n.summary?.cpu?.usageNanoCores ?? 0) / 1_000_000), memoryMB: Math.round((n.summary?.memory?.workingSetBytes ?? 0) / 1024 / 1024), timestamp: n.timestamp })) }))
        }
    }),

    get_prev_deployment_usage: tool({
        description: 'Returns historical aggregated CPU and memory usage for a deployment over the last N metrics readings.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the deployment'), name: z.string().describe('Name of the deployment'), count: z.number().optional().describe('Number of historical readings (default: 5)') }),
        execute: async ({ namespace, name, count = 5 }) => {
            ctx().trace('get_prev_deployment_usage', { namespace, name, count })
            try {
                if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
                const c = ctx().clusterInfo
                const deployResp = await c.appsApi.readNamespacedDeployment({ name, namespace })
                const labelSelector = Object.entries(deployResp.spec?.selector?.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(',')
                const podsResp = await c.coreApi.listNamespacedPod({ namespace, labelSelector })
                const podNames = new Set(podsResp.items.map((p: any) => p.metadata?.name))
                return ctx().clusterMetrics.slice(-count).map((r: any) => { let cpu = 0, mem = 0, pc = 0; for (const node of r.nodes) for (const pod of (node.summary?.pods ?? [])) if (pod.podRef?.namespace === namespace && podNames.has(pod.podRef?.name)) { cpu += pod.cpu?.usageNanoCores ?? 0; mem += pod.memory?.workingSetBytes ?? 0; pc++ } return { deployment: name, namespace, podCount: pc, cpuMillicores: Math.round(cpu / 1_000_000), memoryMB: Math.round(mem / 1024 / 1024), timestamp: r.nodes[0]?.timestamp } })
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_prev_space_data: tool({
        description: 'Returns historical aggregated CPU and memory usage for all pods in a namespace over the last N metrics readings.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace name'), count: z.number().optional().describe('Number of historical readings (default: 5)') }),
        execute: async ({ namespace, count = 5 }) => {
            ctx().trace('get_prev_space_data', { namespace, count })
            if (ctx().clusterMetrics.length === 0) return { error: 'No metrics available yet' }
            return ctx().clusterMetrics.slice(-count).map((r: any) => { let cpu = 0, mem = 0, pc = 0; for (const node of r.nodes) for (const pod of (node.summary?.pods ?? [])) if (pod.podRef?.namespace === namespace) { cpu += pod.cpu?.usageNanoCores ?? 0; mem += pod.memory?.workingSetBytes ?? 0; pc++ } return { namespace, podCount: pc, cpuMillicores: Math.round(cpu / 1_000_000), memoryMB: Math.round(mem / 1024 / 1024), timestamp: r.nodes[0]?.timestamp } })
        }
    }),

    // ── CLUSTER ACTIONS ──────────────────────────────────────────────────────

    add_node: tool({
        description: 'Adds a new agent node to the cluster. For k3d uses `k3d node create`. Cloud providers not yet implemented.',
        inputSchema: z.object({ nodeName: z.string().optional().describe('Suffix for the new node name'), nodePoolName: z.string().optional().describe('Node pool name (cloud provider specific, ignored for k3d)') }),
        execute: async ({ nodeName, nodePoolName }) => {
            ctx().trace('add_node', { nodeName: nodeName ?? 'auto', nodePoolName: nodePoolName ?? 'default' })
            if (ctx().clusterInfo.flavour === 'k3d') {
                const suffix = nodeName ?? `agent-${Date.now()}`
                const clusterName = ctx().clusterInfo.name.replace(/^k3d-/, '')
                try { const { stdout, stderr } = await execAsync(`k3d node create ${suffix} --cluster ${clusterName} --role agent`, { timeout: 120000 }); return { success: true, message: `Node '${suffix}' added to cluster '${clusterName}'`, stdout, stderr } }
                catch (err: any) { return { success: false, error: err.message ?? String(err) } }
            }
            return { success: false, message: `add_node not yet implemented for flavour '${ctx().clusterInfo.flavour}'` }
        }
    }),

    remove_node: tool({
        description: 'Removes a node from the cluster (cordon + delete). For k3d uses `k3d node delete`. Cloud providers not yet implemented.',
        inputSchema: z.object({ nodeName: z.string().describe('Name of the Kubernetes node to remove'), nodePoolName: z.string().optional().describe('Node pool name (cloud provider specific, ignored for k3d)') }),
        execute: async ({ nodeName, nodePoolName }) => {
            ctx().trace('remove_node', { nodeName, nodePoolName: nodePoolName ?? 'default' })
            try { await ctx().clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: true }] }) } catch (_) {}
            if (ctx().clusterInfo.flavour === 'k3d') {
                try { const { stdout, stderr } = await execAsync(`k3d node delete ${nodeName}`, { timeout: 60000 }); return { success: true, message: `Node '${nodeName}' removed`, stdout, stderr } }
                catch (err: any) { return { success: false, error: err.message ?? String(err) } }
            }
            return { success: false, message: `remove_node not yet implemented for flavour '${ctx().clusterInfo.flavour}'` }
        }
    }),

    stop_node: tool({
        description: 'Stops a running cluster node: cordons it then stops the container. For k3d uses `k3d node stop`.',
        inputSchema: z.object({ nodeName: z.string().describe('Name of the Kubernetes node to stop') }),
        execute: async ({ nodeName }) => {
            ctx().trace('stop_node', { nodeName })
            try { await ctx().clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: true }] }) }
            catch (err: any) { return { success: false, error: `Failed to cordon node: ${err.message ?? String(err)}` } }
            if (ctx().clusterInfo.flavour !== 'k3d') return { success: false, message: `Node '${nodeName}' cordoned but stop only implemented for k3d` }
            try { const { stdout, stderr } = await execAsync(`k3d node stop ${nodeName}`, { timeout: 30000 }); return { success: true, message: `Node '${nodeName}' cordoned and stopped`, stdout, stderr } }
            catch (err: any) { return { success: false, error: `Node cordoned but stop failed: ${err.message ?? String(err)}` } }
        }
    }),

    start_node: tool({
        description: 'Starts a previously stopped cluster node and uncordons it. For k3d uses `k3d node start`.',
        inputSchema: z.object({ nodeName: z.string().describe('Name of the Kubernetes node to start') }),
        execute: async ({ nodeName }) => {
            ctx().trace('start_node', { nodeName })
            if (ctx().clusterInfo.flavour === 'k3d') {
                try {
                    const { stdout, stderr } = await execAsync(`k3d node start ${nodeName}`, { timeout: 30000 })
                    try { await ctx().clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: false }] }) } catch (_) {}
                    return { success: true, message: `Node '${nodeName}' started and uncordoned`, stdout, stderr }
                } catch (err: any) { return { success: false, error: err.message ?? String(err) } }
            }
            try { await ctx().clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: false }] }); return { success: false, message: `Node '${nodeName}' uncordoned but start only implemented for k3d` } }
            catch (err: any) { return { success: false, error: err.message ?? String(err) } }
        }
    }),

    add_replica: tool({
        description: 'Scales up a deployment by adding one replica.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the deployment'), name: z.string().describe('Name of the deployment') }),
        execute: async ({ namespace, name }) => {
            ctx().trace('add_replica', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const d = await c.appsApi.readNamespacedDeployment({ name, namespace })
                const cur = d.spec?.replicas ?? 1
                await c.appsApi.patchNamespacedDeployment({ name, namespace, body: [{ op: 'replace', path: '/spec/replicas', value: cur + 1 }] })
                return { success: true, message: `Deployment ${namespace}/${name} scaled from ${cur} to ${cur + 1} replicas` }
            } catch (err: any) { return { success: false, error: err.message ?? String(err) } }
        }
    }),

    remove_replica: tool({
        description: 'Scales down a deployment by removing one replica. Minimum of 1 replica is enforced.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the deployment'), name: z.string().describe('Name of the deployment') }),
        execute: async ({ namespace, name }) => {
            ctx().trace('remove_replica', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const d = await c.appsApi.readNamespacedDeployment({ name, namespace })
                const cur = d.spec?.replicas ?? 1
                if (cur <= 1) return { success: false, message: `Deployment ${namespace}/${name} already at minimum` }
                await c.appsApi.patchNamespacedDeployment({ name, namespace, body: [{ op: 'replace', path: '/spec/replicas', value: cur - 1 }] })
                return { success: true, message: `Deployment ${namespace}/${name} scaled from ${cur} to ${cur - 1} replicas` }
            } catch (err: any) { return { success: false, error: err.message ?? String(err) } }
        }
    }),

    restart_deployment: tool({
        description: 'Rollout-restarts a deployment (equivalent to `kubectl rollout restart`): recreates its pods gracefully, respecting the rolling-update strategy, by stamping the kubectl.kubernetes.io/restartedAt annotation on the pod template. Restarts a workload WITHOUT changing its spec — recover stuck/crashing pods or pick up a changed ConfigMap/Secret. Preferred over delete_pod for a whole workload.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the deployment'), name: z.string().describe('Name of the deployment') }),
        execute: async ({ namespace, name }) => {
            ctx().trace('restart_deployment', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const d = await c.appsApi.readNamespacedDeployment({ name, namespace })
                const restartedAt = new Date().toISOString()
                // Merge (not replace) the existing template annotations, then `add` the whole map: `add` on an
                // existing path replaces it and on a missing path creates it, so it is safe whether or not the
                // pod template already had annotations.
                const annotations = { ...(d.spec?.template?.metadata?.annotations ?? {}), 'kubectl.kubernetes.io/restartedAt': restartedAt }
                await c.appsApi.patchNamespacedDeployment({ name, namespace, body: [{ op: 'add', path: '/spec/template/metadata/annotations', value: annotations }] })
                return { success: true, message: `Deployment ${namespace}/${name} rollout-restarted at ${restartedAt}` }
            } catch (err: any) { return { success: false, error: err.message ?? String(err) } }
        }
    }),

    delete_pod: tool({
        description: 'Deletes a single pod (equivalent to `kubectl delete pod`). Its controller (Deployment/StatefulSet/DaemonSet) recreates it — a surgical way to restart ONE stuck or misbehaving pod. Does not respect a rolling update; for a whole workload prefer restart_deployment.',
        inputSchema: z.object({ namespace: z.string().describe('Namespace of the pod'), name: z.string().describe('Name of the pod') }),
        execute: async ({ namespace, name }) => {
            ctx().trace('delete_pod', { namespace, name })
            try {
                await ctx().clusterInfo.coreApi.deleteNamespacedPod({ name, namespace })
                return { success: true, message: `Pod ${namespace}/${name} deleted; its controller will recreate it` }
            } catch (err: any) { return { success: false, error: err.message ?? String(err) } }
        }
    }),

    // ── MISC ─────────────────────────────────────────────────────────────────

    times_two: tool({
        description: 'Multiplies a number by two.',
        inputSchema: z.object({ data: z.number() }),
        execute: async ({ data }) => { ctx().trace('times_two', { data }); return data * 2 }
    }),

    father_of: tool({
        description: 'Returns the name of the father of a person.',
        inputSchema: z.object({ data: z.string().describe('The name of the person whose father you want to discover') }),
        execute: async ({ data }) => { ctx().trace('father_of', { data }); return 'Julio' }
    }),

    get_certificate_info: tool({
        description: 'Connects to a hostname via HTTPS and returns TLS certificate details: subject, issuer, validity dates, SANs, fingerprint and whether it is currently valid.',
        inputSchema: z.object({ hostname: z.string().describe('DNS name or IP to connect to'), port: z.number().optional().describe('Port to connect to (default: 443)') }),
        execute: async ({ hostname, port }) => {
            ctx().trace('get_certificate_info', { hostname, port })
            const targetPort = port ?? 443
            return new Promise((resolve) => {
                const socket = tls.connect({ host: hostname, port: targetPort, servername: hostname, rejectUnauthorized: false }, () => {
                    try {
                        const cert = socket.getPeerCertificate(false)
                        socket.end()
                        if (!cert || !Object.keys(cert).length) return resolve({ error: 'No certificate returned' })
                        const now = Date.now()
                        const validFrom = new Date(cert.valid_from)
                        const validTo = new Date(cert.valid_to)
                        resolve({ subject: cert.subject, issuer: cert.issuer, validFrom: cert.valid_from, validTo: cert.valid_to, daysUntilExpiry: Math.floor((validTo.getTime() - now) / 86400000), isCurrentlyValid: now >= validFrom.getTime() && now <= validTo.getTime(), subjectAltNames: cert.subjectaltname ?? null, fingerprint: cert.fingerprint, serialNumber: cert.serialNumber, protocol: socket.getProtocol() })
                    } catch (err: any) { socket.end(); resolve({ error: err.message ?? String(err) }) }
                })
                socket.setTimeout(5000, () => { socket.destroy(); resolve({ error: 'Connection timed out' }) })
                socket.on('error', (err) => resolve({ error: err.message }))
            })
        }
    }),

    // ── EVENTS (from the cluster events buffer in ctx().clusterEvents) ──────────

    get_cluster_events: tool({
        description: 'Returns recent Kubernetes events buffered for this cluster: kube Events (warnings like crashloops/OOM/failed scheduling) and object lifecycle changes. Optionally filter to warnings only or by namespace.',
        inputSchema: z.object({
            warningsOnly: z.boolean().optional().describe('Only Warning-type kube Events'),
            namespace: z.string().optional().describe('Filter by namespace'),
            limit: z.number().optional().describe('Max events to return (default 50)')
        }),
        execute: async ({ warningsOnly, namespace, limit = 50 }) => {
            ctx().trace('get_cluster_events', { warningsOnly: !!warningsOnly, namespace: namespace ?? '*', limit })
            let evs = ctx().clusterEvents ?? []
            if (warningsOnly) evs = evs.filter(e => e?.obj?.kind === 'Event' && e.obj.type === 'Warning')
            if (namespace) evs = evs.filter(e => (e?.obj?.metadata?.namespace ?? e?.obj?.involvedObject?.namespace) === namespace)
            return { count: evs.length, events: evs.slice(-limit).map(summarizeClusterEvent) }
        }
    }),

    get_object_events: tool({
        description: 'Returns recent events for a specific Kubernetes object (by namespace and name): its lifecycle changes and related kube Events (via involvedObject).',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the object'),
            name: z.string().describe('Name of the object')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_object_events', { namespace, name })
            const evs = (ctx().clusterEvents ?? []).filter(e => {
                const o = e?.obj ?? {}
                const isObj = o.metadata?.namespace === namespace && o.metadata?.name === name
                const isInvolved = o.involvedObject?.namespace === namespace && o.involvedObject?.name === name
                return isObj || isInvolved
            })
            return { count: evs.length, events: evs.map(summarizeClusterEvent) }
        }
    }),

    // ── POD DIAGNOSIS ────────────────────────────────────────────────────────

    get_pod_logs: tool({
        description: 'Returns recent container logs for a pod (equivalent to kubectl logs). For a crashing pod (CrashLoopBackOff) pass previous:true to read the CRASHED container instance logs — that is where the root cause usually is (the events only say it is restarting, not why).',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the pod'),
            name: z.string().describe('Name of the pod'),
            container: z.string().optional().describe('Container name (omit to use the pod default / first container)'),
            previous: z.boolean().optional().describe('Read the previous (crashed/restarted) container instance logs — key for CrashLoopBackOff'),
            tailLines: z.number().optional().describe('How many trailing lines to return (default 200)')
        }),
        execute: async ({ namespace, name, container, previous, tailLines = 200 }) => {
            ctx().trace('get_pod_logs', { namespace, name, container: container ?? '(default)', previous: !!previous, tailLines })
            try {
                const raw = await ctx().clusterInfo.coreApi.readNamespacedPodLog({ name, namespace, container, previous: !!previous, tailLines })
                const text: string = typeof raw === 'string' ? raw : (raw?.body ?? JSON.stringify(raw))
                const truncated = text.length > 15000
                return { namespace, name, container: container ?? null, previous: !!previous, truncated, logs: truncated ? text.slice(-15000) : text }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    describe_pod: tool({
        description: 'Returns a diagnostic summary of a pod (equivalent to kubectl describe pod): phase, conditions, and per-container status — waiting reason (CrashLoopBackOff/ImagePullBackOff…), last termination reason + exitCode (137=OOMKilled, 1=app error, 143=SIGTERM), restart count, image, resources and probes. Best first step to categorize a pod failure.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the pod'),
            name: z.string().describe('Name of the pod')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('describe_pod', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const pod: any = await c.coreApi.readNamespacedPod({ name, namespace })
                const spec = pod.spec ?? {}, status = pod.status ?? {}
                // image = the tag (spec); imageID = the resolved digest (catches a mutable tag repushed with a broken build).
                const containerStatus = (cs: any) => ({
                    name: cs.name, image: cs.image, imageID: cs.imageID, ready: cs.ready, restartCount: cs.restartCount,
                    state: cs.state?.waiting ? { waiting: { reason: cs.state.waiting.reason, message: cs.state.waiting.message } }
                        : cs.state?.terminated ? { terminated: { reason: cs.state.terminated.reason, exitCode: cs.state.terminated.exitCode } }
                        : cs.state?.running ? { running: { startedAt: cs.state.running.startedAt } } : cs.state,
                    lastTerminated: cs.lastState?.terminated ? { reason: cs.lastState.terminated.reason, exitCode: cs.lastState.terminated.exitCode, signal: cs.lastState.terminated.signal, finishedAt: cs.lastState.terminated.finishedAt } : undefined
                })
                const specContainer = (ct: any) => ({ name: ct.name, image: ct.image, resources: ct.resources, livenessProbe: !!ct.livenessProbe, readinessProbe: !!ct.readinessProbe, startupProbe: !!ct.startupProbe })
                // Resolve the owning controller (pod → ReplicaSet → Deployment) so the bot can call get_rollout_history directly.
                let controlledBy: any = undefined
                const podOwner = (pod.metadata?.ownerReferences ?? [])[0]
                if (podOwner?.kind === 'ReplicaSet') {
                    try {
                        const rs: any = await c.appsApi.readNamespacedReplicaSet({ name: podOwner.name, namespace })
                        const rsOwner = (rs.metadata?.ownerReferences ?? [])[0]
                        controlledBy = rsOwner ? { kind: rsOwner.kind, name: rsOwner.name } : { kind: 'ReplicaSet', name: podOwner.name }
                    } catch { controlledBy = { kind: 'ReplicaSet', name: podOwner.name } }
                }
                else if (podOwner) {
                    controlledBy = { kind: podOwner.kind, name: podOwner.name }   // StatefulSet/DaemonSet/Job own pods directly
                }
                // Source provenance: OCI standard annotations (org.opencontainers.image.*) with a kwirth.io fallback →
                // the repo + commit the image was built from, so the bot can read the actual source (get_source_file).
                const ann = pod.metadata?.annotations ?? {}
                const sourceRepo = ann['org.opencontainers.image.source'] ?? ann['kwirth.io/source-repo']
                const source = sourceRepo ? { repo: sourceRepo, revision: ann['org.opencontainers.image.revision'] ?? ann['kwirth.io/source-ref'] } : undefined
                return {
                    name, namespace, phase: status.phase, node: spec.nodeName, startTime: status.startTime, reason: status.reason, message: status.message,
                    controlledBy,   // e.g. { kind: 'Deployment', name: 'montag-agent' } → feed to get_rollout_history
                    source,         // { repo, revision } from image annotations → feed to get_source_file

                    conditions: (status.conditions ?? []).map((c: any) => ({ type: c.type, status: c.status, reason: c.reason })),
                    containers: (status.containerStatuses ?? []).map(containerStatus),
                    initContainers: (status.initContainerStatuses ?? []).map(containerStatus),
                    spec: { containers: (spec.containers ?? []).map(specContainer), restartPolicy: spec.restartPolicy }
                }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_pod_yaml: tool({
        description: 'Returns the full Kubernetes Pod manifest (equivalent to kubectl get pod -o yaml): complete spec (env, volumes, resources, probes) and status. Use for deeper misconfiguration analysis after describe_pod.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the pod'),
            name: z.string().describe('Name of the pod')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_pod_yaml', { namespace, name })
            try { return await ctx().clusterInfo.coreApi.readNamespacedPod({ name, namespace }) }
            catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_deployment_yaml: tool({
        description: 'Returns the full Kubernetes Deployment manifest (equivalent to kubectl get deployment -o yaml): the pod template (image, env, resources, probes) and strategy. Use to check if a pod problem comes from the owning workload spec.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the deployment'),
            name: z.string().describe('Name of the deployment')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_deployment_yaml', { namespace, name })
            try { return await ctx().clusterInfo.appsApi.readNamespacedDeployment({ name, namespace }) }
            catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_rollout_history: tool({
        description: 'Returns the rollout history (revisions) of a Deployment via its ReplicaSets: per revision the image(s), replicas and pod-template summary (env with inline VALUES and their configMap/secret source, resources, command). Use to see WHAT CHANGED recently — a new image tag, a changed inline env value, a resource/command change — that may have broken the pods. Compare the newest revision against the previous one. NOTE: a change to a ConfigMap/Secret VALUE does NOT create a revision — use get_workload_config_refs for that.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the deployment'),
            name: z.string().describe('Name of the Deployment (the owning workload, e.g. describe_pod.controlledBy.name — NOT the pod name)')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_rollout_history', { namespace, name })
            try {
                const rsList = await ctx().clusterInfo.appsApi.listNamespacedReplicaSet({ namespace })
                const owned = (rsList.items ?? []).filter((rs: any) =>
                    (rs.metadata?.ownerReferences ?? []).some((o: any) => o.kind === 'Deployment' && o.name === name))
                // env: inline value + where a valueFrom env is sourced (so the LLM can both diff inline values
                // across revisions AND know which vars come from a ConfigMap/Secret to check separately).
                const envSource = (e: any): string | undefined =>
                    e.valueFrom?.configMapKeyRef ? `configMap:${e.valueFrom.configMapKeyRef.name}/${e.valueFrom.configMapKeyRef.key}`
                        : e.valueFrom?.secretKeyRef ? `secret:${e.valueFrom.secretKeyRef.name}/${e.valueFrom.secretKeyRef.key}`
                            : e.valueFrom?.fieldRef ? `field:${e.valueFrom.fieldRef.fieldPath}`
                                : undefined
                const container = (ct: any) => ({ name: ct.name, image: ct.image, command: ct.command, args: ct.args, resources: ct.resources, env: (ct.env ?? []).map((e: any) => ({ name: e.name, value: e.value, from: envSource(e) })) })
                const revisions = owned.map((rs: any) => {
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
                }).sort((a: any, b: any) => b.revision - a.revision)   // newest first
                return { deployment: name, namespace, revisionCount: revisions.length, revisions }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_configmap: tool({
        description: 'Returns a ConfigMap\'s data (key → value) plus metadata (resourceVersion, lastModified). Use to inspect the ACTUAL config a workload consumes and to check whether it changed recently — a ConfigMap value change (same env var, different value) does NOT create a Deployment revision, so it is invisible to get_rollout_history.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the ConfigMap'),
            name: z.string().describe('Name of the ConfigMap')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_configmap', { namespace, name })
            try {
                const cm: any = await ctx().clusterInfo.coreApi.readNamespacedConfigMap({ name, namespace })
                return { name, namespace, resourceVersion: cm.metadata?.resourceVersion, lastModified: lastModifiedOf(cm.metadata), data: cm.data ?? {}, binaryDataKeys: Object.keys(cm.binaryData ?? {}) }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_secret: tool({
        description: 'Returns a Secret\'s KEYS, type and metadata (resourceVersion, lastModified) — VALUES ARE REDACTED (never returned). Use to check whether a Secret a workload consumes changed recently (a value change does NOT create a Deployment revision) and which keys it holds. You cannot read the secret values.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the Secret'),
            name: z.string().describe('Name of the Secret')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_secret', { namespace, name })
            try {
                const s: any = await ctx().clusterInfo.coreApi.readNamespacedSecret({ name, namespace })
                return { name, namespace, type: s.type, resourceVersion: s.metadata?.resourceVersion, lastModified: lastModifiedOf(s.metadata), keys: Object.keys(s.data ?? {}) }   // values intentionally omitted
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_workload_config_refs: tool({
        description: 'Given a Deployment, lists the ConfigMaps and Secrets its pods consume (via envFrom, env valueFrom, and volumes), each with its lastModified time and resourceVersion. Use on a crash to find a config source that CHANGED WITHOUT A ROLLOUT: editing a ConfigMap/Secret value keeps the same env spec (no new revision) yet can break the pod — compare each ref\'s lastModified against when the pods started crashing, then read the changed one with get_configmap / get_secret.',
        inputSchema: z.object({
            namespace: z.string().describe('Namespace of the deployment'),
            name: z.string().describe('Name of the Deployment (e.g. describe_pod.controlledBy.name)')
        }),
        execute: async ({ namespace, name }) => {
            ctx().trace('get_workload_config_refs', { namespace, name })
            try {
                const c = ctx().clusterInfo
                const dep: any = await c.appsApi.readNamespacedDeployment({ name, namespace })
                // dedupe by kind+name, merging the reasons (an object may be referenced several ways)
                const byKey = new Map<string, { kind: string; name: string; via: string[] }>()
                for (const r of configRefsOfPodSpec(dep.spec?.template?.spec)) {
                    const cur = byKey.get(`${r.kind}/${r.name}`) ?? { kind: r.kind, name: r.name, via: [] }
                    if (!cur.via.includes(r.via)) cur.via.push(r.via)
                    byKey.set(`${r.kind}/${r.name}`, cur)
                }
                const refs = await Promise.all([...byKey.values()].map(async r => {
                    try {
                        const meta: any = (r.kind === 'ConfigMap'
                            ? await c.coreApi.readNamespacedConfigMap({ name: r.name, namespace })
                            : await c.coreApi.readNamespacedSecret({ name: r.name, namespace })).metadata
                        return { ...r, resourceVersion: meta?.resourceVersion, lastModified: lastModifiedOf(meta) }
                    } catch (err: any) { return { ...r, error: err.message ?? String(err) } }
                }))
                return { deployment: name, namespace, refs }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

    get_source_file: tool({
        description: 'Fetches the contents of a single source file from a Git repository (GitHub or GitLab) at a specific ref. Use to inspect the actual source behind a crash: read the stack-trace file:line from the logs, then fetch that file at the image build revision (describe_pod.source). Call repeatedly to follow the trace across files until you find the bug.',
        inputSchema: z.object({
            repo: z.string().describe('Repository URL or owner/name (e.g. https://github.com/org/app or org/app) — from describe_pod.source.repo'),
            ref: z.string().describe('Commit SHA, branch or tag — use the build revision (describe_pod.source.revision) so you read the code actually running'),
            path: z.string().describe('File path within the repo (e.g. src/regex/loader.go)')
        }),
        execute: async ({ repo, ref, path }) => {
            ctx().trace('get_source_file', { repo, ref, path })
            try {
                const { host, projectPath } = parseRepoRef(repo)
                const cred = (ctx().sourceRepos ?? []).find(r => r.host === host)
                if (!cred) return { error: `No source-repo credentials configured for host '${host}'. Add it in Agora → Source repos.` }
                const text = await fetchSourceFile(cred, projectPath, ref, path)
                const truncated = text.length > 20000
                return { repo: projectPath, ref, path, truncated, content: truncated ? text.slice(0, 20000) : text }
            } catch (err: any) { return { error: err.message ?? String(err) } }
        }
    }),

} as const

export const toolInfoList: IToolInfo[] = [
    { name: 'list_namespaces',           effect: EToolEffect.READ,  description: 'Lists all namespaces in the cluster with their status and labels.' },
    { name: 'get_node_data',             effect: EToolEffect.READ,  description: 'Returns configuration info about all Kubernetes nodes (name, IP). Configuration only — not workload or usage data.' },
    { name: 'get_cluster_data',          effect: EToolEffect.READ,  description: 'Returns general cluster info: name, flavour (AKS/EKS/GKE/k3s/k3d), total vCPUs, total memory, node count and readiness status.' },
    { name: 'get_workload_data',         effect: EToolEffect.READ,  description: 'Returns all workloads in the cluster: deployments, statefulsets, daemonsets, pods and services. Optionally filter by namespace.' },
    { name: 'get_space_data',            effect: EToolEffect.READ,  description: 'Returns all resources in a specific Kubernetes namespace: pods (with restart count), deployments, services, configmap names.' },
    { name: 'get_service_yaml',          effect: EToolEffect.READ,  description: 'Returns the full Kubernetes Service manifest (equivalent to kubectl get service -o yaml) for a given namespace and service name.' },
    { name: 'list_services',             effect: EToolEffect.READ,  description: 'Lists all Services in the cluster with full details (type, clusterIP, ports, selector). Optionally filter by namespace.' },
    { name: 'list_ingresses',            effect: EToolEffect.READ,  description: 'Lists all Ingresses in the cluster (hosts, paths, TLS, backend services). Optionally filter by namespace.' },
    { name: 'get_ingress_yaml',          effect: EToolEffect.READ,  description: 'Returns the full Kubernetes Ingress manifest (equivalent to kubectl get ingress -o yaml) for a given namespace and ingress name.' },
    { name: 'get_cluster_usage',         effect: EToolEffect.READ,  description: 'Returns current overall cluster resource usage: CPU%, memory%, network Mbps, total vCPUs and total memory GB.' },
    { name: 'get_node_usage',            effect: EToolEffect.READ,  description: 'Returns current CPU and memory usage for one node or all nodes from the latest metrics reading.' },
    { name: 'get_deployment_usage',      effect: EToolEffect.READ,  description: 'Returns current aggregated CPU and memory usage for all pods belonging to a specific deployment.' },
    { name: 'get_prev_cluster_usage',    effect: EToolEffect.READ,  description: 'Returns historical overall cluster usage over the last N metrics readings (CPU%, memory%, network Mbps).' },
    { name: 'get_prev_node_usage',       effect: EToolEffect.READ,  description: 'Returns historical CPU and memory usage for one or all nodes over the last N metrics readings.' },
    { name: 'get_prev_deployment_usage', effect: EToolEffect.READ,  description: 'Returns historical aggregated CPU and memory usage for a deployment over the last N metrics readings.' },
    { name: 'get_prev_space_data',       effect: EToolEffect.READ,  description: 'Returns historical aggregated CPU and memory usage for all pods in a namespace over the last N metrics readings.' },
    { name: 'add_node',                  effect: EToolEffect.WRITE, description: 'Adds a new agent node to the cluster. For k3d uses `k3d node create`. Cloud providers not yet implemented.' },
    { name: 'remove_node',               effect: EToolEffect.WRITE, description: 'Removes a node from the cluster (cordon + delete). For k3d uses `k3d node delete`. Cloud providers not yet implemented.' },
    { name: 'stop_node',                 effect: EToolEffect.WRITE, description: 'Stops a running cluster node: cordons it then stops the container. For k3d uses `k3d node stop`.' },
    { name: 'start_node',                effect: EToolEffect.WRITE, description: 'Starts a previously stopped cluster node and uncordons it. For k3d uses `k3d node start`.' },
    { name: 'add_replica',               effect: EToolEffect.WRITE, description: 'Scales up a deployment by adding one replica.' },
    { name: 'remove_replica',            effect: EToolEffect.WRITE, description: 'Scales down a deployment by removing one replica. Minimum of 1 replica is enforced.' },
    { name: 'restart_deployment',        effect: EToolEffect.WRITE, description: 'Rollout-restarts a deployment (recreates its pods gracefully via the restartedAt annotation, respecting the rolling update) — restart a workload without changing its spec.' },
    { name: 'delete_pod',                effect: EToolEffect.WRITE, description: 'Deletes a single pod; its controller recreates it. Surgical restart of one stuck pod (no rolling update — prefer restart_deployment for a whole workload).' },
    { name: 'times_two',                 effect: EToolEffect.READ,  description: 'Multiplies a number by two.' },
    { name: 'father_of',                 effect: EToolEffect.READ,  description: 'Returns the name of the father of a person.' },
    { name: 'get_certificate_info',      effect: EToolEffect.READ,  description: 'Connects to a hostname via HTTPS and returns TLS certificate details: subject, issuer, validity dates, SANs, fingerprint and whether it is currently valid.' },
    { name: 'get_cluster_events',        effect: EToolEffect.READ,  description: 'Returns recent buffered Kubernetes events for this cluster (warnings + object lifecycle changes); filter by warnings only or namespace.' },
    { name: 'get_object_events',         effect: EToolEffect.READ,  description: 'Returns recent events for a specific Kubernetes object (namespace + name), including related kube Events.' },
    { name: 'get_pod_logs',              effect: EToolEffect.READ,  description: 'Returns container logs for a pod (kubectl logs); previous:true reads the crashed instance logs — the root cause of a CrashLoopBackOff.' },
    { name: 'describe_pod',              effect: EToolEffect.READ,  description: 'Diagnostic summary of a pod (kubectl describe pod): per-container waiting/terminated reason + exitCode (OOMKilled/CrashLoop…), restart count, probes.' },
    { name: 'get_pod_yaml',              effect: EToolEffect.READ,  description: 'Full Pod manifest (kubectl get pod -o yaml): spec (env, volumes, resources, probes) and status.' },
    { name: 'get_deployment_yaml',       effect: EToolEffect.READ,  description: 'Full Deployment manifest (kubectl get deployment -o yaml): pod template (image, env, resources, probes) and strategy.' },
    { name: 'get_rollout_history',       effect: EToolEffect.READ,  description: 'Rollout revisions of a Deployment (via ReplicaSets): image + template per revision (env with inline values + configMap/secret source), to see what changed (new image/env/resource) that may have broken the pods.' },
    { name: 'get_configmap',             effect: EToolEffect.READ,  description: 'A ConfigMap\'s data (key→value) + lastModified. A ConfigMap value change does NOT create a rollout revision, so check it for a crash with no deployment change.' },
    { name: 'get_secret',                effect: EToolEffect.READ,  description: 'A Secret\'s keys + type + lastModified (VALUES REDACTED). Check whether a consumed Secret changed recently (no rollout revision is created by a value change).' },
    { name: 'get_workload_config_refs',  effect: EToolEffect.READ,  description: 'The ConfigMaps/Secrets a Deployment consumes (envFrom/valueFrom/volumes) with each one\'s lastModified — find a config source that changed WITHOUT a rollout and broke the pods.' },
    { name: 'get_source_file',           effect: EToolEffect.READ,  description: 'Fetches a file from a Git repo (GitHub/GitLab) at a ref — inspect the source behind a crash by following the stack trace to the offending file:line.' },
]

// ── AGENT ENGINE ─────────────────────────────────────────────────────────────

export interface IAgentRunResult {
    text: string
    inputTokens: number
    outputTokens: number
    steps: number
    toolCalls: string[]
}

// Resolves the tool names an agent may use: autoTools = full catalog, otherwise its own list
// (intersected with the catalog); readOnly filters out WRITE-effect tools. Pure (no LLM) → unit-testable.
export const selectAgentToolNames = (agent: IAgent): string[] => {
    const writeNames = new Set(toolInfoList.filter(t => t.effect === EToolEffect.WRITE).map(t => t.name))
    const catalogNames = toolInfoList.map(t => t.name)
    const wanted = agent.autoTools ? catalogNames : agent.tools.filter(n => catalogNames.includes(n))
    return wanted.filter(n => !(agent.readOnly && writeNames.has(n)))
}

// Runs an IAgent: resolves its LLM, selects/filters its tools (readOnly drops WRITE-effect tools) and
// invokes the model within the k8s tool context. Wraps the existing engine (buildModel + generateText +
// runWithToolContext) — factors the pattern pinocchio does by hand, reusable by Agora/pinocchio/defender.
// No providerOptions here: pinocchio's are for structured output; a chat/tool agent returns free text.
export const runAgent = async (
    agent: IAgent,
    prompt: string,
    llms: ILlm[],
    providers: ILlmProvider[],
    context: IToolContext
): Promise<IAgentRunResult> => {
    const llm = llms.find(l => l.id === agent.llm)
    if (!llm) throw new Error(`[common-ai] runAgent: llm '${agent.llm}' not found`)
    const model = buildModel(llm, providers)
    if (!model) throw new Error(`[common-ai] runAgent: could not build model for llm '${agent.llm}'`)

    const allowed = new Set(selectAgentToolNames(agent))
    const selectedTools = Object.fromEntries(Object.entries(tools).filter(([n]) => allowed.has(n)))

    const result = await runWithToolContext(context, () => generateText({
        model,
        temperature: llm.temperature,
        stopWhen: stepCountIs(agent.steps || 15),
        tools: selectedTools,
        system: agent.system,
        prompt
    }))

    const toolCalls: string[] = []
    for (const step of (result.steps ?? [])) {
        const s = step as unknown as { toolCalls?: { toolName: string }[] }
        for (const call of (s.toolCalls ?? [])) toolCalls.push(call.toolName)
    }
    return {
        text: result.text,
        inputTokens: result.usage?.inputTokens ?? 0,
        outputTokens: result.usage?.outputTokens ?? 0,
        steps: result.steps?.length ?? 0,
        toolCalls
    }
}
