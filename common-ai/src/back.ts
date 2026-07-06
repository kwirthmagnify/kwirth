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

export interface IToolContext {
    origin: string
    nodes: Map<string, any>
    clusterInfo: any
    clusterMetrics: any[]
    trace: (toolName: string, args: Record<string, unknown>) => void
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
    { name: 'times_two',                 effect: EToolEffect.READ,  description: 'Multiplies a number by two.' },
    { name: 'father_of',                 effect: EToolEffect.READ,  description: 'Returns the name of the father of a person.' },
    { name: 'get_certificate_info',      effect: EToolEffect.READ,  description: 'Connects to a hostname via HTTPS and returns TLS certificate details: subject, issuer, validity dates, SANs, fingerprint and whether it is currently valid.' },
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
