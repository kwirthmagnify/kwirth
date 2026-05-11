import { tool } from "ai"
import z from "zod"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

function mapToJson(data: any): any {
    if (data instanceof Map) {
        const obj: Record<string, any> = {}
        for (const [key, value] of data.entries()) {
            obj[String(key)] = mapToJson(value)
        }
        return obj
    }
    if (Array.isArray(data)) {
        return data.map(mapToJson)
    }
    if (data !== null && typeof data === 'object') {
        const newObj: Record<string, any> = {}
        for (const key of Object.keys(data)) {
            newObj[key] = mapToJson(data[key])
        }
        return newObj
    }
    return data
}

export interface IToolContext {
    origin: string
    nodes: Map<string, any>
    clusterInfo: any
    clusterMetrics: any[]
    trace: (toolName: string, args: Record<string, unknown>) => void
}

export const createTools = (context: IToolContext) => {
    return {

        // ── CLUSTER CONFIG ───────────────────────────────────────────────────

        get_node_data: tool({
            description: 'Returns configuration info about all Kubernetes nodes (name, IP). Configuration only — not workload or usage data.',
            inputSchema: z.object({}),
            execute: async () => {
                context.trace('get_node_data', {})
                return mapToJson(context.nodes)
            }
        }),

        get_cluster_data: tool({
            description: 'Returns general cluster info: name, flavour (AKS/EKS/GKE/k3s/k3d), total vCPUs, total memory, node count and readiness status.',
            inputSchema: z.object({}),
            execute: async () => {
                context.trace('get_cluster_data', {})
                try {
                    const resp = await context.clusterInfo.coreApi.listNode()
                    return {
                        name: context.clusterInfo.name,
                        flavour: context.clusterInfo.flavour,
                        vcpus: context.clusterInfo.vcpus,
                        memoryGB: Math.round(context.clusterInfo.memory / 1024 / 1024 / 1024 * 100) / 100,
                        nodeCount: resp.items.length,
                        nodes: resp.items.map((n: any) => ({
                            name: n.metadata?.name,
                            cpu: n.status?.capacity?.['cpu'],
                            memoryKi: n.status?.capacity?.['memory'],
                            ready: n.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True',
                            unschedulable: n.spec?.unschedulable ?? false
                        }))
                    }
                }
                catch (err: any) {
                    return { error: err.message ?? String(err) }
                }
            }
        }),

        get_workload_data: tool({
            description: 'Returns all workloads in the cluster: deployments, statefulsets, daemonsets, pods and services. Optionally filter by namespace.',
            inputSchema: z.object({
                namespace: z.string().optional().describe('Namespace to filter results (omit for all namespaces)')
            }),
            execute: async ({ namespace }) => {
                context.trace('get_workload_data', { namespace: namespace ?? '*' })
                try {
                    const [deploymentsResp, statefulSetsResp, daemonSetsResp, podsResp, servicesResp] = await Promise.all([
                        namespace ? context.clusterInfo.appsApi.listNamespacedDeployment({ namespace }) : context.clusterInfo.appsApi.listDeploymentForAllNamespaces(),
                        namespace ? context.clusterInfo.appsApi.listNamespacedStatefulSet({ namespace }) : context.clusterInfo.appsApi.listStatefulSetForAllNamespaces(),
                        namespace ? context.clusterInfo.appsApi.listNamespacedDaemonSet({ namespace }) : context.clusterInfo.appsApi.listDaemonSetForAllNamespaces(),
                        namespace ? context.clusterInfo.coreApi.listNamespacedPod({ namespace }) : context.clusterInfo.coreApi.listPodForAllNamespaces(),
                        namespace ? context.clusterInfo.coreApi.listNamespacedService({ namespace }) : context.clusterInfo.coreApi.listServiceForAllNamespaces()
                    ])
                    return {
                        deployments: deploymentsResp.items.map((d: any) => ({
                            name: d.metadata?.name,
                            namespace: d.metadata?.namespace,
                            replicas: d.spec?.replicas,
                            readyReplicas: d.status?.readyReplicas ?? 0,
                            availableReplicas: d.status?.availableReplicas ?? 0
                        })),
                        statefulSets: statefulSetsResp.items.map((s: any) => ({
                            name: s.metadata?.name,
                            namespace: s.metadata?.namespace,
                            replicas: s.spec?.replicas,
                            readyReplicas: s.status?.readyReplicas ?? 0
                        })),
                        daemonSets: daemonSetsResp.items.map((d: any) => ({
                            name: d.metadata?.name,
                            namespace: d.metadata?.namespace,
                            desired: d.status?.desiredNumberScheduled,
                            ready: d.status?.numberReady
                        })),
                        pods: podsResp.items.map((p: any) => ({
                            name: p.metadata?.name,
                            namespace: p.metadata?.namespace,
                            nodeName: p.spec?.nodeName,
                            phase: p.status?.phase,
                            ready: p.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True'
                        })),
                        services: servicesResp.items.map((s: any) => ({
                            name: s.metadata?.name,
                            namespace: s.metadata?.namespace,
                            type: s.spec?.type,
                            clusterIP: s.spec?.clusterIP
                        }))
                    }
                }
                catch (err: any) {
                    return { error: err.message ?? String(err) }
                }
            }
        }),

        get_space_data: tool({
            description: 'Returns all resources in a specific Kubernetes namespace: pods (with restart count), deployments, services, configmap names.',
            inputSchema: z.object({
                namespace: z.string().describe('Name of the namespace to retrieve data for')
            }),
            execute: async ({ namespace }) => {
                context.trace('get_space_data', { namespace })
                try {
                    const [podsResp, deploymentsResp, servicesResp, configMapsResp] = await Promise.all([
                        context.clusterInfo.coreApi.listNamespacedPod({ namespace }),
                        context.clusterInfo.appsApi.listNamespacedDeployment({ namespace }),
                        context.clusterInfo.coreApi.listNamespacedService({ namespace }),
                        context.clusterInfo.coreApi.listNamespacedConfigMap({ namespace })
                    ])
                    return {
                        namespace,
                        pods: podsResp.items.map((p: any) => ({
                            name: p.metadata?.name,
                            phase: p.status?.phase,
                            nodeName: p.spec?.nodeName,
                            ready: p.status?.conditions?.find((c: any) => c.type === 'Ready')?.status === 'True',
                            restartCount: p.status?.containerStatuses?.reduce((sum: number, cs: any) => sum + cs.restartCount, 0) ?? 0
                        })),
                        deployments: deploymentsResp.items.map((d: any) => ({
                            name: d.metadata?.name,
                            replicas: d.spec?.replicas,
                            readyReplicas: d.status?.readyReplicas ?? 0,
                            image: d.spec?.template?.spec?.containers?.[0]?.image
                        })),
                        services: servicesResp.items.map((s: any) => ({
                            name: s.metadata?.name,
                            type: s.spec?.type,
                            clusterIP: s.spec?.clusterIP
                        })),
                        configMaps: configMapsResp.items.map((cm: any) => cm.metadata?.name)
                    }
                }
                catch (err: any) {
                    return { error: err.message ?? String(err) }
                }
            }
        }),

        // ── CURRENT USAGE ────────────────────────────────────────────────────

        get_cluster_usage: tool({
            description: 'Returns current overall cluster resource usage: CPU%, memory%, network Mbps, total vCPUs and total memory GB.',
            inputSchema: z.object({}),
            execute: async () => {
                context.trace('get_cluster_usage', {})
                if (context.clusterMetrics.length === 0) return { error: 'No metrics available yet' }
                const latest = context.clusterMetrics[context.clusterMetrics.length - 1]
                return {
                    vcpus: latest.cluster.vcpus,
                    memoryGB: Math.round(latest.cluster.memory / 1024 / 1024 / 1024 * 100) / 100,
                    cpuUsagePercent: Math.round(latest.cluster.cpuUsage * 100) / 100,
                    memoryUsagePercent: Math.round(latest.cluster.memoryUsage * 100) / 100,
                    networkTxMbps: Math.round(latest.cluster.txmbps * 100) / 100,
                    networkRxMbps: Math.round(latest.cluster.rxmbps * 100) / 100,
                    metricsIntervalSeconds: latest.metricsInterval
                }
            }
        }),

        get_node_usage: tool({
            description: 'Returns current CPU and memory usage for one node or all nodes from the latest metrics reading.',
            inputSchema: z.object({
                nodeName: z.string().optional().describe('Node name to filter (omit for all nodes)')
            }),
            execute: async ({ nodeName }) => {
                context.trace('get_node_usage', { nodeName: nodeName ?? '*' })
                if (context.clusterMetrics.length === 0) return { error: 'No metrics available yet' }
                const latest = context.clusterMetrics[context.clusterMetrics.length - 1]
                const nodes = nodeName ? latest.nodes.filter((n: any) => n.name === nodeName) : latest.nodes
                return nodes.map((node: any) => ({
                    name: node.name,
                    cpuMillicores: Math.round((node.summary?.cpu?.usageNanoCores ?? 0) / 1_000_000),
                    memoryMB: Math.round((node.summary?.memory?.workingSetBytes ?? 0) / 1024 / 1024),
                    networkRxMB: Math.round((node.summary?.network?.rxBytes ?? 0) / 1024 / 1024),
                    networkTxMB: Math.round((node.summary?.network?.txBytes ?? 0) / 1024 / 1024),
                    podCount: node.summary?.pods?.length ?? 0,
                    timestamp: node.timestamp
                }))
            }
        }),

        get_deployment_usage: tool({
            description: 'Returns current aggregated CPU and memory usage for all pods belonging to a specific deployment.',
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the deployment'),
                name: z.string().describe('Name of the deployment')
            }),
            execute: async ({ namespace, name }) => {
                context.trace('get_deployment_usage', { namespace, name })
                try {
                    if (context.clusterMetrics.length === 0) return { error: 'No metrics available yet' }
                    const latest = context.clusterMetrics[context.clusterMetrics.length - 1]

                    const deployResp = await context.clusterInfo.appsApi.readNamespacedDeployment({ name, namespace })
                    const labelSelector = Object.entries(deployResp.spec?.selector?.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(',')
                    const podsResp = await context.clusterInfo.coreApi.listNamespacedPod({ namespace, labelSelector })
                    const podNames = new Set(podsResp.items.map((p: any) => p.metadata?.name))

                    let totalCpuNanoCores = 0
                    let totalMemoryBytes = 0
                    let podCount = 0
                    for (const node of latest.nodes) {
                        for (const pod of (node.summary?.pods ?? [])) {
                            if (pod.podRef?.namespace === namespace && podNames.has(pod.podRef?.name)) {
                                totalCpuNanoCores += pod.cpu?.usageNanoCores ?? 0
                                totalMemoryBytes += pod.memory?.workingSetBytes ?? 0
                                podCount++
                            }
                        }
                    }
                    return {
                        deployment: name,
                        namespace,
                        podCount,
                        cpuMillicores: Math.round(totalCpuNanoCores / 1_000_000),
                        memoryMB: Math.round(totalMemoryBytes / 1024 / 1024),
                        timestamp: latest.nodes[0]?.timestamp
                    }
                }
                catch (err: any) {
                    return { error: err.message ?? String(err) }
                }
            }
        }),

        // ── HISTORICAL USAGE ─────────────────────────────────────────────────

        get_prev_cluster_usage: tool({
            description: 'Returns historical overall cluster usage over the last N metrics readings (CPU%, memory%, network Mbps).',
            inputSchema: z.object({
                count: z.number().optional().describe('Number of historical readings to return (default: 5)')
            }),
            execute: async ({ count = 5 }) => {
                context.trace('get_prev_cluster_usage', { count })
                if (context.clusterMetrics.length === 0) return { error: 'No metrics available yet' }
                return context.clusterMetrics.slice(-count).map((reading: any) => ({
                    vcpus: reading.cluster.vcpus,
                    memoryGB: Math.round(reading.cluster.memory / 1024 / 1024 / 1024 * 100) / 100,
                    cpuUsagePercent: Math.round(reading.cluster.cpuUsage * 100) / 100,
                    memoryUsagePercent: Math.round(reading.cluster.memoryUsage * 100) / 100,
                    networkTxMbps: Math.round(reading.cluster.txmbps * 100) / 100,
                    networkRxMbps: Math.round(reading.cluster.rxmbps * 100) / 100
                }))
            }
        }),

        get_prev_node_usage: tool({
            description: 'Returns historical CPU and memory usage for one or all nodes over the last N metrics readings.',
            inputSchema: z.object({
                nodeName: z.string().optional().describe('Node name to filter (omit for all nodes)'),
                count: z.number().optional().describe('Number of historical readings (default: 5)')
            }),
            execute: async ({ nodeName, count = 5 }) => {
                context.trace('get_prev_node_usage', { nodeName: nodeName ?? '*', count })
                if (context.clusterMetrics.length === 0) return { error: 'No metrics available yet' }
                return context.clusterMetrics.slice(-count).map((reading: any) => ({
                    nodes: (nodeName ? reading.nodes.filter((n: any) => n.name === nodeName) : reading.nodes).map((node: any) => ({
                        name: node.name,
                        cpuMillicores: Math.round((node.summary?.cpu?.usageNanoCores ?? 0) / 1_000_000),
                        memoryMB: Math.round((node.summary?.memory?.workingSetBytes ?? 0) / 1024 / 1024),
                        timestamp: node.timestamp
                    }))
                }))
            }
        }),

        get_prev_deployment_usage: tool({
            description: 'Returns historical aggregated CPU and memory usage for a deployment over the last N metrics readings.',
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the deployment'),
                name: z.string().describe('Name of the deployment'),
                count: z.number().optional().describe('Number of historical readings (default: 5)')
            }),
            execute: async ({ namespace, name, count = 5 }) => {
                context.trace('get_prev_deployment_usage', { namespace, name, count })
                try {
                    if (context.clusterMetrics.length === 0) return { error: 'No metrics available yet' }

                    const deployResp = await context.clusterInfo.appsApi.readNamespacedDeployment({ name, namespace })
                    const labelSelector = Object.entries(deployResp.spec?.selector?.matchLabels ?? {}).map(([k, v]) => `${k}=${v}`).join(',')
                    const podsResp = await context.clusterInfo.coreApi.listNamespacedPod({ namespace, labelSelector })
                    const podNames = new Set(podsResp.items.map((p: any) => p.metadata?.name))

                    return context.clusterMetrics.slice(-count).map((reading: any) => {
                        let totalCpuNanoCores = 0
                        let totalMemoryBytes = 0
                        let podCount = 0
                        for (const node of reading.nodes) {
                            for (const pod of (node.summary?.pods ?? [])) {
                                if (pod.podRef?.namespace === namespace && podNames.has(pod.podRef?.name)) {
                                    totalCpuNanoCores += pod.cpu?.usageNanoCores ?? 0
                                    totalMemoryBytes += pod.memory?.workingSetBytes ?? 0
                                    podCount++
                                }
                            }
                        }
                        return {
                            deployment: name,
                            namespace,
                            podCount,
                            cpuMillicores: Math.round(totalCpuNanoCores / 1_000_000),
                            memoryMB: Math.round(totalMemoryBytes / 1024 / 1024),
                            timestamp: reading.nodes[0]?.timestamp
                        }
                    })
                }
                catch (err: any) {
                    return { error: err.message ?? String(err) }
                }
            }
        }),

        get_prev_space_data: tool({
            description: 'Returns historical aggregated CPU and memory usage for all pods in a namespace over the last N metrics readings.',
            inputSchema: z.object({
                namespace: z.string().describe('Namespace name'),
                count: z.number().optional().describe('Number of historical readings (default: 5)')
            }),
            execute: async ({ namespace, count = 5 }) => {
                context.trace('get_prev_space_data', { namespace, count })
                if (context.clusterMetrics.length === 0) return { error: 'No metrics available yet' }
                return context.clusterMetrics.slice(-count).map((reading: any) => {
                    let totalCpuNanoCores = 0
                    let totalMemoryBytes = 0
                    let podCount = 0
                    for (const node of reading.nodes) {
                        for (const pod of (node.summary?.pods ?? [])) {
                            if (pod.podRef?.namespace === namespace) {
                                totalCpuNanoCores += pod.cpu?.usageNanoCores ?? 0
                                totalMemoryBytes += pod.memory?.workingSetBytes ?? 0
                                podCount++
                            }
                        }
                    }
                    return {
                        namespace,
                        podCount,
                        cpuMillicores: Math.round(totalCpuNanoCores / 1_000_000),
                        memoryMB: Math.round(totalMemoryBytes / 1024 / 1024),
                        timestamp: reading.nodes[0]?.timestamp
                    }
                })
            }
        }),

        // ── CLUSTER ACTIONS ──────────────────────────────────────────────────

        add_node: tool({
            description: 'Adds a new agent node to the cluster. For k3d uses `k3d node create <suffix> --cluster <name> --role agent`. For cloud providers (AKS/EKS/GKE) not yet implemented.',
            inputSchema: z.object({
                nodeName: z.string().optional().describe('Suffix for the new node name. For k3d the Kubernetes node will be named k3d-<cluster>-<nodeName>-0. Auto-generated if omitted.'),
                nodePoolName: z.string().optional().describe('Node pool name (cloud provider specific, ignored for k3d)')
            }),
            execute: async ({ nodeName, nodePoolName }) => {
                context.trace('add_node', { nodeName: nodeName ?? 'auto', nodePoolName: nodePoolName ?? 'default' })
                if (context.clusterInfo.flavour === 'k3d') {
                    const suffix = nodeName ?? `agent-${Date.now()}`
                    const clusterName = context.clusterInfo.name.replace(/^k3d-/, '')
                    try {
                        const { stdout, stderr } = await execAsync(`k3d node create ${suffix} --cluster ${clusterName} --role agent`, { timeout: 120000 })
                        return { success: true, message: `New agent node '${suffix}' added to cluster '${clusterName}'`, stdout, stderr }
                    }
                    catch (err: any) {
                        return { success: false, error: err.message ?? String(err) }
                    }
                }
                return { success: false, message: `add_node not yet implemented for flavour '${context.clusterInfo.flavour}'` }
            }
        }),

        remove_node: tool({
            description: 'Removes a node from the cluster. Cordons it first, then deletes it. For k3d uses `k3d node delete`. For cloud providers (AKS/EKS/GKE) not yet implemented.',
            inputSchema: z.object({
                nodeName: z.string().describe('Name of the Kubernetes node to remove (e.g. k3d-mycluster-agent-0)'),
                nodePoolName: z.string().optional().describe('Node pool name (cloud provider specific, ignored for k3d)')
            }),
            execute: async ({ nodeName, nodePoolName }) => {
                context.trace('remove_node', { nodeName, nodePoolName: nodePoolName ?? 'default' })
                try {
                    await context.clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: true }] })
                }
                catch (_) {}
                if (context.clusterInfo.flavour === 'k3d') {
                    try {
                        const { stdout, stderr } = await execAsync(`k3d node delete ${nodeName}`, { timeout: 60000 })
                        return { success: true, message: `Node '${nodeName}' removed from cluster`, stdout, stderr }
                    }
                    catch (err: any) {
                        return { success: false, error: err.message ?? String(err) }
                    }
                }
                return { success: false, message: `remove_node not yet implemented for flavour '${context.clusterInfo.flavour}'` }
            }
        }),

        stop_node: tool({
            description: 'Stops a running cluster node: cordons it in Kubernetes (marks it unschedulable) then stops the underlying container. For k3d uses `k3d node stop`. For other flavours only the cordon is applied.',
            inputSchema: z.object({
                nodeName: z.string().describe('Name of the Kubernetes node to stop (e.g. k3d-mycluster-agent-0)')
            }),
            execute: async ({ nodeName }) => {
                context.trace('stop_node', { nodeName })
                try {
                    await context.clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: true }] })
                }
                catch (err: any) {
                    return { success: false, error: `Failed to cordon node: ${err.message ?? String(err)}` }
                }
                if (context.clusterInfo.flavour !== 'k3d') {
                    return { success: false, message: `Node '${nodeName}' cordoned but container stop is only implemented for k3d (flavour is '${context.clusterInfo.flavour}')` }
                }
                try {
                    const { stdout, stderr } = await execAsync(`k3d node stop ${nodeName}`, { timeout: 30000 })
                    return { success: true, message: `Node '${nodeName}' cordoned and stopped`, stdout, stderr }
                }
                catch (err: any) {
                    return { success: false, error: `Node cordoned but container stop failed: ${err.message ?? String(err)}` }
                }
            }
        }),

        start_node: tool({
            description: 'Starts a previously stopped cluster node and uncordons it. For k3d uses `k3d node start`. For other flavours only the uncordon is applied.',
            inputSchema: z.object({
                nodeName: z.string().describe('Name of the Kubernetes node to start (e.g. k3d-mycluster-agent-0)')
            }),
            execute: async ({ nodeName }) => {
                context.trace('start_node', { nodeName })
                if (context.clusterInfo.flavour === 'k3d') {
                    try {
                        const { stdout, stderr } = await execAsync(`k3d node start ${nodeName}`, { timeout: 30000 })
                        try {
                            await context.clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: false }] })
                        }
                        catch (_) {}
                        return { success: true, message: `Node '${nodeName}' started and uncordoned`, stdout, stderr }
                    }
                    catch (err: any) {
                        return { success: false, error: err.message ?? String(err) }
                    }
                }
                try {
                    await context.clusterInfo.coreApi.patchNode({ name: nodeName, body: [{ op: 'add', path: '/spec/unschedulable', value: false }] })
                    return { success: false, message: `Node '${nodeName}' uncordoned but container start is only implemented for k3d (flavour is '${context.clusterInfo.flavour}')` }
                }
                catch (err: any) {
                    return { success: false, error: `Container start not implemented for this flavour and uncordon failed: ${err.message ?? String(err)}` }
                }
            }
        }),

        add_replica: tool({
            description: 'Scales up a deployment by adding one replica.',
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the deployment'),
                name: z.string().describe('Name of the deployment')
            }),
            execute: async ({ namespace, name }) => {
                context.trace('add_replica', { namespace, name })
                try {
                    const deployResp = await context.clusterInfo.appsApi.readNamespacedDeployment({ name, namespace })
                    const currentReplicas = deployResp.spec?.replicas ?? 1
                    const newReplicas = currentReplicas + 1
                    const patch = [{ op: 'replace', path: '/spec/replicas', value: newReplicas }]
                    await context.clusterInfo.appsApi.patchNamespacedDeployment({ name, namespace, body: patch })
                    return { success: true, message: `Deployment ${namespace}/${name} scaled from ${currentReplicas} to ${newReplicas} replicas` }
                }
                catch (err: any) {
                    return { success: false, error: err.message ?? String(err) }
                }
            }
        }),

        remove_replica: tool({
            description: 'Scales down a deployment by removing one replica. Minimum of 1 replica is enforced.',
            inputSchema: z.object({
                namespace: z.string().describe('Namespace of the deployment'),
                name: z.string().describe('Name of the deployment')
            }),
            execute: async ({ namespace, name }) => {
                context.trace('remove_replica', { namespace, name })
                try {
                    const deployResp = await context.clusterInfo.appsApi.readNamespacedDeployment({ name, namespace })
                    const currentReplicas = deployResp.spec?.replicas ?? 1
                    if (currentReplicas <= 1) return { success: false, message: `Deployment ${namespace}/${name} already at minimum (${currentReplicas} replica)` }
                    const newReplicas = currentReplicas - 1
                    const patch = [{ op: 'replace', path: '/spec/replicas', value: newReplicas }]
                    await context.clusterInfo.appsApi.patchNamespacedDeployment({ name, namespace, body: patch })
                    return { success: true, message: `Deployment ${namespace}/${name} scaled from ${currentReplicas} to ${newReplicas} replicas` }
                }
                catch (err: any) {
                    return { success: false, error: err.message ?? String(err) }
                }
            }
        }),

        // ── MISC ─────────────────────────────────────────────────────────────

        times_two: tool({
            description: 'Multiplies a number by two',
            inputSchema: z.object({
                data: z.number()
            }),
            execute: async ({ data }) => {
                context.trace('times_two', { data })
                return data * 2
            }
        }),

        father_of: tool({
            description: 'Returns the name of the father of a person',
            inputSchema: z.object({
                data: z.string().describe('The name of the person whose father you want to discover')
            }),
            execute: async ({ data }) => {
                context.trace('father_of', { data })
                return 'Julio'
            }
        })

    } as const
}

export const getToolByName = (name: string, context: IToolContext) => {
    const tools = createTools(context)
    return tools[name as keyof typeof tools]
}

export const toolInfoList: { name: string, description: string }[] = [
    { name: 'get_node_data',             description: 'Returns configuration info about all Kubernetes nodes (name, IP). Configuration only — not workload or usage data.' },
    { name: 'get_cluster_data',          description: 'Returns general cluster info: name, flavour (AKS/EKS/GKE/k3s/k3d), total vCPUs, total memory, node count and readiness status.' },
    { name: 'get_workload_data',         description: 'Returns all workloads in the cluster: deployments, statefulsets, daemonsets, pods and services. Optionally filter by namespace.' },
    { name: 'get_space_data',            description: 'Returns all resources in a specific Kubernetes namespace: pods (with restart count), deployments, services, configmap names.' },
    { name: 'get_cluster_usage',         description: 'Returns current overall cluster resource usage: CPU%, memory%, network Mbps, total vCPUs and total memory GB.' },
    { name: 'get_node_usage',            description: 'Returns current CPU and memory usage for one node or all nodes from the latest metrics reading.' },
    { name: 'get_deployment_usage',      description: 'Returns current aggregated CPU and memory usage for all pods belonging to a specific deployment.' },
    { name: 'get_prev_cluster_usage',    description: 'Returns historical overall cluster usage over the last N metrics readings (CPU%, memory%, network Mbps).' },
    { name: 'get_prev_node_usage',       description: 'Returns historical CPU and memory usage for one or all nodes over the last N metrics readings.' },
    { name: 'get_prev_deployment_usage', description: 'Returns historical aggregated CPU and memory usage for a deployment over the last N metrics readings.' },
    { name: 'get_prev_space_data',       description: 'Returns historical aggregated CPU and memory usage for all pods in a namespace over the last N metrics readings.' },
    { name: 'add_node',                  description: 'Adds a new agent node to the cluster. For k3d uses `k3d node create`. Cloud providers not yet implemented.' },
    { name: 'remove_node',               description: 'Removes a node from the cluster (cordon + delete). For k3d uses `k3d node delete`. Cloud providers not yet implemented.' },
    { name: 'stop_node',                 description: 'Stops a running node: cordons it and stops the container. For k3d uses `k3d node stop`.' },
    { name: 'start_node',                description: 'Starts a stopped node and uncordons it. For k3d uses `k3d node start`.' },
    { name: 'add_replica',               description: 'Scales up a deployment by adding one replica.' },
    { name: 'remove_replica',            description: 'Scales down a deployment by removing one replica. Minimum of 1 replica is enforced.' },
    { name: 'times_two',                 description: 'Multiplies a number by two.' },
    { name: 'father_of',                 description: 'Returns the name of the father of a person.' },
]
