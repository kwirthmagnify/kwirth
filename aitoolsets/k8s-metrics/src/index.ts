import { IAiToolset, IMetricsNodeSample, IMetricsSample, IToolHost, defineTool, z } from '@kwirthmagnify/kwirth-common-ai/back'
import { ECapability, EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'

/*
    Toolset `k8s-metrics` — cuánto consume el cluster, y cuánto consumía hace un rato
    (plan: plans/ai-tools/PLAN.md, S3).

    Estrena `ECapability.METRICS`. Las muestras las mantiene el core en memoria: aquí no se pide nada al
    cluster para leerlas, solo para resolver QUÉ pods son de un deployment.

    Las siete van en pares: la del momento y la de las últimas N lecturas. La histórica no es un lujo —
    un 90 % de CPU no dice nada por sí solo; lo que dice algo es que hace cinco lecturas iba al 20 %.
*/

const metrics = (host: IToolHost, toolName: string, args: Record<string, unknown> = {}): IMetricsSample[] => {
    host.trace(toolName, args)
    if (!host.metrics) throw new Error(`[k8s-metrics] '${toolName}' needs cluster metrics and the host did not provide it`)
    return host.metrics.samples
}

const k8s = (host: IToolHost) => {
    if (!host.k8s) throw new Error('[k8s-metrics] this tool needs cluster access and the host did not provide it')
    return host.k8s
}

const failed = (err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })

/** Aún no hay lecturas. Es un estado normal al arrancar, no un fallo: se dice tal cual. */
const NO_METRICS = { error: 'No metrics available yet' }

const DEFAULT_COUNT = 5
const NANO = 1_000_000
const MB = 1024 * 1024
const GB = 1024 * 1024 * 1024

const round2 = (n: number) => Math.round(n * 100) / 100

/** El resumen de uso del cluster en una lectura. Mismo formato para la actual y para las históricas. */
const clusterUsage = (sample: IMetricsSample) => ({
    vcpus: sample.cluster.vcpus,
    memoryGB: round2(sample.cluster.memory / GB),
    cpuUsagePercent: round2(sample.cluster.cpuUsage),
    memoryUsagePercent: round2(sample.cluster.memoryUsage),
    networkTxMbps: round2(sample.cluster.txmbps),
    networkRxMbps: round2(sample.cluster.rxmbps)
})

const nodeUsage = (node: IMetricsNodeSample) => ({
    name: node.name,
    cpuMillicores: Math.round((node.summary?.cpu?.usageNanoCores ?? 0) / NANO),
    memoryMB: Math.round((node.summary?.memory?.workingSetBytes ?? 0) / MB),
    timestamp: node.timestamp
})

const filterNodes = (sample: IMetricsSample, nodeName?: string): IMetricsNodeSample[] =>
    nodeName ? sample.nodes.filter(n => n.name === nodeName) : sample.nodes

/**
 * Suma el consumo de los pods de una lectura que cumplan el filtro.
 *
 * Se recorre POR NODO porque así vienen las muestras: un mismo deployment tiene pods repartidos, y
 * sumar solo el primer nodo daría una cifra baja que parece correcta.
 */
const sumPods = (sample: IMetricsSample, matches: (namespace?: string, name?: string) => boolean) => {
    let cpu = 0
    let mem = 0
    let podCount = 0
    for (const node of sample.nodes) {
        for (const pod of node.summary?.pods ?? []) {
            if (!matches(pod.podRef?.namespace, pod.podRef?.name)) continue
            cpu += pod.cpu?.usageNanoCores ?? 0
            mem += pod.memory?.workingSetBytes ?? 0
            podCount++
        }
    }
    return { podCount, cpuMillicores: Math.round(cpu / NANO), memoryMB: Math.round(mem / MB), timestamp: sample.nodes[0]?.timestamp }
}

/** Los pods que hoy pertenecen a un deployment, por su selector. Es la única parte que toca el cluster. */
const podsOfDeployment = async (host: IToolHost, namespace: string, name: string): Promise<Set<string>> => {
    const c = k8s(host)
    const deployment = await c.appsApi.readNamespacedDeployment({ name, namespace })
    const labelSelector = Object.entries(deployment.spec?.selector?.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(',')
    const pods = await c.coreApi.listNamespacedPod({ namespace, labelSelector })
    return new Set(pods.items.map(p => p.metadata?.name).filter((n): n is string => Boolean(n)))
}

const countArg = z.number().optional().describe('Number of historical readings to return (default: 5)')

const k8sMetrics: IAiToolset = {
    id: 'k8s-metrics',
    version: '0.1.0',
    displayName: 'K8s Metrics',
    description: 'Resource usage of the cluster, its nodes, a deployment or a namespace, now and over the recent readings',
    // K8S ademas de METRICS: las de deployment necesitan resolver que pods lo componen.
    requires: [ECapability.K8S, ECapability.METRICS],
    tools: [
        defineTool({
            name: 'get_cluster_usage',
            description: 'Returns current overall cluster resource usage: CPU%, memory%, network Mbps, total vCPUs and total memory GB.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({}),
            execute: async (_args, host) => {
                const samples = metrics(host, 'get_cluster_usage')
                if (samples.length === 0) return NO_METRICS
                const latest = samples[samples.length - 1]
                return { ...clusterUsage(latest), metricsIntervalSeconds: latest.metricsInterval }
            }
        }),
        defineTool({
            name: 'get_node_usage',
            description: 'Returns current CPU and memory usage for one node or all nodes from the latest metrics reading.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({ nodeName: z.string().optional().describe('Node name to filter (omit for all nodes)') }),
            execute: async ({ nodeName }, host) => {
                const samples = metrics(host, 'get_node_usage', { nodeName: nodeName ?? '*' })
                if (samples.length === 0) return NO_METRICS
                const latest = samples[samples.length - 1]
                return filterNodes(latest, nodeName).map(n => ({
                    ...nodeUsage(n),
                    networkRxMB: Math.round((n.summary?.network?.rxBytes ?? 0) / MB),
                    networkTxMB: Math.round((n.summary?.network?.txBytes ?? 0) / MB),
                    podCount: n.summary?.pods?.length ?? 0
                }))
            }
        }),
        defineTool({
            name: 'get_deployment_usage',
            description: 'Returns current aggregated CPU and memory usage for all pods belonging to a specific deployment.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the deployment'),
                name: z.string().describe('Name of the deployment')
            }),
            execute: async ({ namespace, name }, host) => {
                const samples = metrics(host, 'get_deployment_usage', { namespace, name })
                if (samples.length === 0) return NO_METRICS
                try {
                    const podNames = await podsOfDeployment(host, namespace, name)
                    const latest = samples[samples.length - 1]
                    return { deployment: name, namespace, ...sumPods(latest, (ns, n) => ns === namespace && Boolean(n) && podNames.has(n!)) }
                }
                catch (err) { return failed(err) }
            }
        }),

        // ── las mismas, pero mirando hacia atras ─────────────────────────────────────────────────────

        defineTool({
            name: 'get_prev_cluster_usage',
            description: 'Returns historical overall cluster usage over the last N metrics readings (CPU%, memory%, network Mbps).',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({ count: countArg }),
            execute: async ({ count = DEFAULT_COUNT }, host) => {
                const samples = metrics(host, 'get_prev_cluster_usage', { count })
                if (samples.length === 0) return NO_METRICS
                return samples.slice(-count).map(clusterUsage)
            }
        }),
        defineTool({
            name: 'get_prev_node_usage',
            description: 'Returns historical CPU and memory usage for one or all nodes over the last N metrics readings.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({
                nodeName: z.string().optional().describe('Node name to filter (omit for all nodes)'),
                count: countArg
            }),
            execute: async ({ nodeName, count = DEFAULT_COUNT }, host) => {
                const samples = metrics(host, 'get_prev_node_usage', { nodeName: nodeName ?? '*', count })
                if (samples.length === 0) return NO_METRICS
                return samples.slice(-count).map(sample => ({ nodes: filterNodes(sample, nodeName).map(nodeUsage) }))
            }
        }),
        defineTool({
            name: 'get_prev_deployment_usage',
            description: 'Returns historical aggregated CPU and memory usage for a deployment over the last N metrics readings.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the deployment'),
                name: z.string().describe('Name of the deployment'),
                count: countArg
            }),
            execute: async ({ namespace, name, count = DEFAULT_COUNT }, host) => {
                const samples = metrics(host, 'get_prev_deployment_usage', { namespace, name, count })
                if (samples.length === 0) return NO_METRICS
                try {
                    // ⚠️ Los pods se resuelven UNA vez, con los de ahora, y se aplican a todas las lecturas.
                    // Es lo que hacia la version original y tiene una consecuencia que conviene saber: si el
                    // deployment se reinicio, los pods viejos ya no casan y las lecturas antiguas salen a cero.
                    const podNames = await podsOfDeployment(host, namespace, name)
                    return samples.slice(-count).map(sample => ({
                        deployment: name, namespace,
                        ...sumPods(sample, (ns, n) => ns === namespace && Boolean(n) && podNames.has(n!))
                    }))
                }
                catch (err) { return failed(err) }
            }
        }),
        defineTool({
            name: 'get_prev_space_data',
            description: 'Returns historical aggregated CPU and memory usage for all pods in a namespace over the last N metrics readings.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({
                namespace: z.string().describe('Namespace name'),
                count: countArg
            }),
            execute: async ({ namespace, count = DEFAULT_COUNT }, host) => {
                const samples = metrics(host, 'get_prev_space_data', { namespace, count })
                if (samples.length === 0) return NO_METRICS
                // Por namespace no hace falta cluster: el podRef de cada muestra ya lo trae.
                return samples.slice(-count).map(sample => ({ namespace, ...sumPods(sample, ns => ns === namespace) }))
            }
        })
    ]
}

export default k8sMetrics
