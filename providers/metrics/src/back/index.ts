import { IExtensionLogger, IProvider, IProviderStorage, IProviderSubscriber, IProviderSubscriptionHelp, KwirthData } from '@kwirthmagnify/kwirth-common-back'
import express, { Request, Response } from 'express'
import { IMetricDefinition, IMetricsCluster, IMetricsClusterUsage, IMetricsNode, IMetricsNodeSummary, IMetricsSubscriberConfig } from '../common/MetricsTypes'

export * from '../common/MetricsTypes'

const PROVIDER_ID = 'metrics'
const DEFAULT_INTERVAL = 15

// A node as the core describes it (ClusterInfo's INodeInfo)
interface INodeInfo {
    name: string
    ip: string
    maxPods: number
}

/*
    The slice of the core's ClusterInfo this provider reads. Structural, because an extension cannot import
    the core. 'token' is a getter over the projected ServiceAccount token, re-read so it never goes stale.
    'nodes' is the core's node map, which this provider keeps up to date on every tick (as it did inside
    the core): nodes that join or leave the cluster show up there.
*/
interface IKubeConfigSlice {
    getCurrentCluster(): { server: string } | null
    applyToFetchOptions(opts: Record<string, unknown>): Promise<RequestInit>
}
interface IMetricsClusterInfo {
    readonly token: string | undefined
    kubeConfig: IKubeConfigSlice
    nodes: Map<string, INodeInfo>
    getNodes(): Promise<Map<string, INodeInfo>>
}

/*
    Unfolds what a failed fetch is really complaining about.

    undici throws a bare 'TypeError: fetch failed' and puts the actual reason in 'cause': ECONNREFUSED,
    ETIMEDOUT, a certificate that does not validate, a name that does not resolve. Logging the error
    alone spends a line of the log to say nothing, and the four cases above look identical from outside
    while being fixed in four different ways.
*/
const describeFetchError = (err: unknown): string => {
    if (!(err instanceof Error)) return String(err)
    const parts = [`${err.name}: ${err.message}`]
    let cause: unknown = (err as { cause?: unknown }).cause
    while (cause instanceof Error) {
        const code = (cause as { code?: string }).code
        parts.push(`${code ? code + ' ' : ''}${cause.message}`)
        cause = (cause as { cause?: unknown }).cause
    }
    if (cause !== undefined && !(cause instanceof Error)) parts.push(String(cause))
    return parts.join(' ← ')
}

type TMetricValues = Map<string, { value: number, timestamp: number }>
// The labels of a cAdvisor line, by name
type TLabels = Record<string, string>

export class MetricsProvider implements IProvider {
    public readonly id = PROVIDER_ID
    /*
        No public router. What used to hang from '/provider/metrics' (the metrics list and the cluster
        usage) is in the configRouter, which the core mounts BEHIND the accessKey at
        '/core/providerconfig/metrics'. An extension cannot use the core's key validation, and the
        configRouter is exactly the place where the core does it for us.
    */
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined
    public configRouter = express.Router()

    private clusterInfo: IMetricsClusterInfo
    private kwirthData: KwirthData
    private subscribers: Map<IProviderSubscriber, IMetricsSubscriberConfig> = new Map()
    /*
        Deliveries since startup: one per subscriber and reading. This provider does not filter —every
        tick goes to everybody— so the number grows with the subscribers, which is exactly the work it does.
    */
    private deliveries = 0

    private metricsList: Map<string, IMetricDefinition> = new Map()
    public metricsInterval: number = DEFAULT_INTERVAL
    public metricsIntervalRef: NodeJS.Timeout | undefined = undefined
    private loadingClusterMetrics: boolean = false
    private lastRead: IMetricsCluster | undefined
    private prevRead: IMetricsCluster | undefined
    private nodeDataBuffer: Map<string, { slots: [IMetricsNode, IMetricsNode], activeSlot: 0 | 1 }> = new Map()
    // The cluster's capacity as the kubelets report it (machine_cpu_cores, machine_memory_bytes)
    private vcpus = 0
    private memory = 0

    /*
        The log. The core replaces it through setLogger() right after constructing this provider, and
        what it hands over already knows who we are: '[prov] [INFO] [metrics] ...'. What is here meanwhile
        is a fallback for an older core that never calls setLogger.
    */
    private log: IExtensionLogger = {
        info: (message: unknown) => console.log(`[${PROVIDER_ID}] ${message}`),
        trace: (message: unknown) => console.log(`[${PROVIDER_ID}] ${message}`),
        warning: (message: unknown) => console.warn(`[${PROVIDER_ID}] ${message}`),
        error: (message: unknown) => console.error(`[${PROVIDER_ID}] ${message}`)
    }

    setLogger = (logger: IExtensionLogger): void => { this.log = logger }

    constructor(clusterInfo: unknown, kwirthData: KwirthData, _storage?: IProviderStorage) {
        this.clusterInfo = clusterInfo as IMetricsClusterInfo
        this.kwirthData = kwirthData

        this.configRouter.get('/', (_req: Request, res: Response) => {
            res.status(200).json(this.getMetricsList())
        })
        this.configRouter.get('/usage/cluster', (_req: Request, res: Response) => {
            res.status(200).json(this.getClusterUsage())
        })
    }

    /*
        The interval lives in Kwirth's settings, which belong to the core: on saving them, the core writes
        the new value into kwirthData.metricsInterval, the very object this provider was handed. Reading it
        here, on every tick, is how a new interval takes effect without restarting anything and without a
        contract between the core and this extension.
    */
    private configuredInterval = (): number => {
        const value = Number(this.kwirthData?.metricsInterval)
        return value > 0 ? value : DEFAULT_INTERVAL
    }

    startMetricsInterval = (seconds: number): void => {
        this.metricsInterval = seconds
        this.metricsIntervalRef = setInterval(() => { void this.tick() }, this.metricsInterval * 1000)
    }

    stopMetricsInterval = (): void => {
        if (this.metricsIntervalRef) clearInterval(this.metricsIntervalRef)
        this.metricsIntervalRef = undefined
    }

    private getOrAllocNodeSlots = (nodeName: string): { current: IMetricsNode, prevNode: IMetricsNode | undefined } => {
        if (!this.nodeDataBuffer.has(nodeName)) {
            const makeEmpty = (): IMetricsNode => ({
                name: nodeName,
                timestamp: 0,
                summary: undefined as unknown as IMetricsNodeSummary,
                containerMetricValues: new Map(),
                podMetricValues: new Map(),
                machineMetricValues: new Map()
            })
            this.nodeDataBuffer.set(nodeName, { slots: [makeEmpty(), makeEmpty()], activeSlot: 0 })
        }
        const buf = this.nodeDataBuffer.get(nodeName)!
        const current = buf.slots[buf.activeSlot]
        const prev = buf.slots[buf.activeSlot ^ 1]
        buf.activeSlot = (buf.activeSlot ^ 1) as 0 | 1
        return { current, prevNode: prev.timestamp > 0 ? prev : undefined }
    }

    public getMetricsList = () => {
        return Array.from(this.metricsList.keys()).map(metricName => ({ metric: metricName, ...this.metricsList.get(metricName) }))
    }

    public getClusterUsage = (): IMetricsClusterUsage => {
        let cpuUsed = 0, cpuNumber = this.vcpus
        let memUsed = 0, memTotal = 0
        let tx = 0, rx = 0
        let prevtx = 0, prevrx = 0
        if (this.metricsList && this.lastRead) {
            try {
                for (let lastNodeRead of this.lastRead.nodes) {
                    if (lastNodeRead.summary) {
                        memUsed += lastNodeRead.summary.memory.usageBytes
                        memTotal += lastNodeRead.summary.memory.usageBytes + lastNodeRead.summary.memory.availableBytes
                        cpuUsed += lastNodeRead.summary.cpu.usageNanoCores
                        tx += lastNodeRead.summary.network.txBytes
                        rx += lastNodeRead.summary.network.rxBytes

                        if (this.prevRead) {
                            let prevNodeRead = this.prevRead.nodes.find(n => n.name === lastNodeRead.name)
                            if (prevNodeRead) {
                                prevtx += prevNodeRead.summary.network.txBytes
                                prevrx += prevNodeRead.summary.network.rxBytes
                            }
                        }
                    }
                }
                if (memTotal === 0) memTotal = 1
                if (cpuNumber === 0) cpuNumber = 1
                let tottx = tx - prevtx
                let totrx = rx - prevrx
                tottx = (tottx / 1024 / 1024) / this.metricsInterval
                totrx = (totrx / 1024 / 1024) / this.metricsInterval
                const pods = this.lastRead.nodes.reduce((sum, n) => sum + (n.summary?.pods?.length ?? 0), 0)
                const maxPods = Array.from(this.clusterInfo.nodes.values()).reduce((sum, n) => sum + n.maxPods, 0)
                return {
                    vcpus: this.vcpus,
                    memory: this.memory,
                    cpuUsage: (cpuUsed / (cpuNumber * Math.pow(10, 9))) * 100,
                    memoryUsage: memUsed / memTotal * 100,
                    txmbps: tottx,
                    rxmbps: totrx,
                    pods,
                    maxPods
                }
            }
            catch (err) {
                this.log.error(`Error calculating node resources: ${err}`)
            }
        }
        return { vcpus: this.vcpus, memory: this.memory, cpuUsage: 0, memoryUsage: 0, txmbps: 0, rxmbps: 0, pods: 0, maxPods: 0 }
    }

    getSubscriptionHelp = (): IProviderSubscriptionHelp => ({
        usage: [
            'Pushes on its own clock: every metricsInterval seconds (15 by default, set in Kwirth settings) the',
            'whole cluster read is delivered to every subscriber. No payload is needed and nothing has to happen',
            'in the cluster for events to arrive, which makes it the quickest way to check that a subscription',
            'works end to end.',
            '',
            'The payload is currently ignored: the tick does not filter per subscriber. The flags in the example',
            'are kept because consumers still send them, but today they change nothing.',
            '',
            'Each delivered event is the full read: { metricsInterval, cluster, nodes, clusterMetricValues }.'
        ].join('\n'),
        example: { pod: true, container: true, machine: true }
    })

    addSubscriber = async (subscriber: IProviderSubscriber, data?: IMetricsSubscriberConfig): Promise<void> => {
        this.subscribers.set(subscriber, { ...data })
    }

    removeSubscriber = async (subscriber: IProviderSubscriber): Promise<void> => {
        this.subscribers.delete(subscriber)
    }

    /*
        What this provider knows about itself. The contract asks for it to be CHEAP —what is already at
        hand is returned, nothing is computed— and this is what tells whether metrics is being consumed or
        emitting for nobody.
    */
    getStats = () => ({ subscribers: this.subscribers.size, events: this.deliveries })

    addRecordType(map: Map<string, IMetricDefinition>, metricName: string, recordType: string, value: string): void {
        if (!map.has(metricName)) map.set(metricName, { help: '', type: '', eval: '' })
        switch (recordType) {
            case '# HELP':
                map.get(metricName)!.help = value
                break
            case '# TYPE':
                map.get(metricName)!.type = value
                break
            case '# EVAL':
                map.get(metricName)!.eval = value
                break
        }
    }

    configCall = async (node: INodeInfo, path: string): Promise<{ url: string, options: RequestInit }> => {
        // path: /metrics/cadvisor
        if (this.kwirthData.inCluster) {
            // inside URL plus token
            return { url: `https://${node.ip}:10250${path}`, options: { headers: { Authorization: 'Bearer ' + this.clusterInfo.token } } }
        }
        const cluster = this.clusterInfo.kubeConfig.getCurrentCluster()
        const url = `${cluster!.server}/api/v1/nodes/${node.name}/proxy${path}`
        if (this.kwirthData.isDesktop) {
            /*
                Outside URL plus the kubeconfig's credentials. applyToFetchOptions RETURNS the options to use
                (@kubernetes/client-node 1.x); the core used to call it and drop the result, so the request
                went out with no credentials at all.
            */
            const options = await this.clusterInfo.kubeConfig.applyToFetchOptions({ method: 'GET' })
            return { url, options }
        }
        // outside URL plus token
        return { url, options: { headers: { Authorization: 'Bearer ' + this.clusterInfo.token } } }
    }

    public readCAdvisorMetrics = async (node: INodeInfo): Promise<string> => {
        let text = ''

        let { url, options } = await this.configCall(node, '/metrics/cadvisor')
        const response = await fetch(url, options)
        if (response.ok)
            text = await response.text()
        else
            this.log.error(`Error reading metrics from '${url}' ${response.status}: ${response.statusText}`)

        // add kwirth container metrics
        text += '# HELP kwirth_container_memory_percentage Percentage of memory used by object from the whole cluster\n'
        text += '# TYPE kwirth_container_memory_percentage gauge\n'

        text += '# HELP kwirth_container_cpu_percentage Percentage of cpu used from the whole cluster\n'
        text += '# TYPE kwirth_container_cpu_percentage gauge\n'

        text += '# HELP kwirth_container_random_counter Accumulated container random values\n'
        text += '# TYPE kwirth_container_random_counter counter\n'

        text += '# HELP kwirth_container_random_gauge Instant container random values\n'
        text += '# TYPE kwirth_container_random_gauge gauge\n'

        text += '# HELP kwirth_container_transmit_percentage Percentage of data sent in relation to the whole cluster\n'
        text += '# TYPE kwirth_container_transmit_percentage gauge\n'

        text += '# HELP kwirth_container_receive_percentage Percentage of data received in relation to the whole cluster\n'
        text += '# TYPE kwirth_container_receive_percentage gauge\n'

        text += '# HELP kwirth_container_transmit_mbps Mbps of data sent over the last period\n'
        text += '# TYPE kwirth_container_transmit_mbps gauge\n'

        text += '# HELP kwirth_container_receive_mbps Mbps of data received over the last period\n'
        text += '# TYPE kwirth_container_receive_mbps gauge\n'

        text += '# HELP kwirth_container_write_mbps Mbps of data written to storage the last period\n'
        text += '# TYPE kwirth_container_write_mbps gauge\n'

        text += '# HELP kwirth_container_read_mbps Mbps of data read from storage over the last period\n'
        text += '# TYPE kwirth_container_read_mbps gauge\n'

        text += '# HELP kwirth_cluster_total_pods Total number of running pods in the cluster\n'
        text += '# TYPE kwirth_cluster_total_pods gauge\n'

        text += '# HELP kwirth_cluster_pods_percentage Percentage of cluster pod capacity in use\n'
        text += '# TYPE kwirth_cluster_pods_percentage gauge\n'

        text += '# HELP kwirth_cluster_memory_percentage Percentage of total cluster memory in use\n'
        text += '# TYPE kwirth_cluster_memory_percentage gauge\n'

        text += '# HELP kwirth_cluster_cpu_percentage Percentage of total cluster CPU in use\n'
        text += '# TYPE kwirth_cluster_cpu_percentage gauge\n'

        return text
    }

    async loadNodeMetrics(node: INodeInfo): Promise<Map<string, IMetricDefinition>> {
        const map: Map<string, IMetricDefinition> = new Map()

        const allMetrics = await this.readCAdvisorMetrics(node)
        if (!allMetrics) return new Map()

        const lines = allMetrics.split('\n').filter(l => l.startsWith('#'))
        for (let line of lines) {
            const recordType = line.substring(0, 6).trim()
            line = line.substring(6).trim()
            const i = line.indexOf(' ')
            const mname = line.substring(0, i).trim()
            const value = line.substring(i).trim()

            if ('machine_scrape_error container_scrape_error'.includes(mname)) {
                // we ignore scraping metrics
                continue
            }

            // create specific new metrics for subtyped metrics: we create a new metric for each specific metric, and we don't add the orignal metrics
            if (mname === 'container_memory_failures_total') {
                for (const sub of ['pgfault', 'pgmajfault']) this.addRecordType(map, mname + '_' + sub, recordType, value)
            }
            if (mname === 'container_blkio_device_usage_total') {
                for (const sub of ['read', 'write']) this.addRecordType(map, mname + '_' + sub, recordType, value)
            }
            else if (mname === 'container_tasks_state') {
                for (const sub of ['iowaiting', 'running', 'sleeping', 'stopped', 'uninterruptible']) this.addRecordType(map, mname + '_' + sub, recordType, value)
            }
            else {
                this.addRecordType(map, mname, recordType, value)
            }
        }
        return map
    }

    // reads node metrics and loads 'metricValues' with parsed and formated data
    async readNodeMetrics(srcNode: INodeInfo): Promise<{ node: IMetricsNode, prevNode: IMetricsNode | undefined }> {
        const regex = /(?:\s*([^=^{]*)=\"([^"]*)",*)/gm
        const rawSampledNodeMetrics = await this.readCAdvisorMetrics(srcNode)
        const lines = rawSampledNodeMetrics.split('\n')
        const { current, prevNode } = this.getOrAllocNodeSlots(srcNode.name)
        current.containerMetricValues.clear()
        current.podMetricValues.clear()
        current.machineMetricValues.clear()
        const newContainerMetricValues = current.containerMetricValues
        const newPodMetricValues = current.podMetricValues
        const newMachineMetricValues = current.machineMetricValues

        for (const line of lines) {
            if (line === '' || line.startsWith('#')) continue

            let i = line.indexOf('{')
            if (i < 0) i = line.indexOf(' ')
            let sampledMetricName = line.substring(0, i)
            const sourceMetricName = sampledMetricName

            // the line's labels, e.g. for container_fs_writes_total{container="customers",device="/dev/sda",namespace="dev",pod="customers-5cc8cb444f-psrwp",...} 2929 1728588770767
            // we obtain { container:"customers", device:"/dev/sda", namespace:"dev", pod:"customers-5cc8cb444f-psrwp", ... }
            let m
            const labels: TLabels = {}
            while ((m = regex.exec(line)) !== null) {
                if (m.index === regex.lastIndex) regex.lastIndex++
                labels[m[1]] = m[2]
            }

            if (sampledMetricName.startsWith('machine_')) {
                // machine metrics have no timestamp, and they are not linked to containers nor pods, so we process them in a special way
                const parts = line.split(' ')
                const machineMetricValue = parts[parts.length - 1]
                newMachineMetricValues.set(sampledMetricName, { value: +machineMetricValue, timestamp: Date.now() })
                continue
            }

            if (!labels.pod) continue

            // we rebuild the metric name for subtyped metrics (we create synthetic metrics and we ignore the subtype)
            if (sampledMetricName === 'container_memory_failures_total') sampledMetricName += '_' + labels.failure_type
            if (sampledMetricName === 'container_tasks_state') sampledMetricName += '_' + labels.state
            if (sampledMetricName === 'container_blkio_device_usage_total') sampledMetricName += '_' + labels.operation.toLowerCase()

            if (labels.container !== '' && (labels.scope === 'container' || labels.scope === undefined)) {
                i = line.indexOf('}')
                if (i >= 0) {
                    // THIS IS THE METRIC NAME WE STORE IN THE MAP
                    sampledMetricName = labels.namespace + '/' + labels.pod + '/' + labels.container + '/' + sampledMetricName
                    const { value: newValue, timestamp } = this.parseValue(line.substring(i + 1).trim())

                    if (newContainerMetricValues.has(sampledMetricName)) {
                        if ('container_blkio_device_usage_total container_fs_writes_total container_fs_reads_bytes_total container_fs_reads_total container_fs_writes_bytes_total'.includes(sourceMetricName)) {
                            // it is a synthetic metric (read & write are labels promoted to metric name); device usage
                            // contains data for different volumes (/dev/sda, /dev/sdb...), so we sum all operations ignoring the device
                            newContainerMetricValues.set(sampledMetricName, { value: newValue + newContainerMetricValues.get(sampledMetricName)!.value, timestamp })
                        }
                        else {
                            /*
                                cAdvisor returned TWO series for the same namespace/pod/container in a single read,
                                and the key does not carry the cgroup, so they collide. It happens, for instance,
                                with a recreated container whose old cgroup the kubelet has not stopped publishing
                                yet. One line per collision, stating the value that SURVIVES, which is the only
                                thing that helps when a chart looks odd later on.
                            */
                            const previous = newContainerMetricValues.get(sampledMetricName)!
                            this.log.warning(`Duplicated container metric '${sampledMetricName}': keeping ${previous.value} (ts ${timestamp}), discarding ${newValue}`)
                            newContainerMetricValues.set(sampledMetricName, { value: previous.value, timestamp })
                        }
                    }
                    else {
                        newContainerMetricValues.set(sampledMetricName, { value: newValue, timestamp })
                    }
                }
                else {
                    this.log.warning(`Invalid container metric format: ${line}`)
                }
            }
            else if (labels.container === '' && labels.pod !== '' && labels.namespace !== '' && labels.image !== '' && (labels.scope === 'hierarchy' || labels.scope === undefined)) {
                // pod metrics
                i = line.indexOf('}')
                if (i >= 0) {
                    // this is the metric key we store in the map (NO CONTAINER NAME IN THE METRIC NAME)
                    sampledMetricName = labels.namespace + '/' + labels.pod + '/' + sampledMetricName
                    const { value: newValue, timestamp } = this.parseValue(line.substring(i + 1).trim())
                    // a pod metric seen twice comes from several network interfaces or several containers: they add up
                    const previous = newPodMetricValues.get(sampledMetricName)?.value ?? 0
                    newPodMetricValues.set(sampledMetricName, { value: newValue + previous, timestamp })
                }
                else {
                    this.log.warning(`Invalid pod metric format: ${line}`)
                }
            }
        }

        const rawSummary = await this.readCAdvisorSummary(srcNode)
        const newSummary = rawSummary.node as IMetricsNodeSummary
        if (newSummary && rawSummary.pods) newSummary.pods = rawSummary.pods as IMetricsNodeSummary['pods']
        if (newSummary && newSummary.network) {
            if (!newSummary.network.txBytes) newSummary.network.txBytes = newSummary.network.interfaces.reduce((tot, iface) => tot + iface.txBytes, 0)
            if (!newSummary.network.rxBytes) newSummary.network.rxBytes = newSummary.network.interfaces.reduce((tot, iface) => tot + iface.rxBytes, 0)
            if (!newSummary.network.txErrors) newSummary.network.txErrors = newSummary.network.interfaces.reduce((tot, iface) => tot + iface.txErrors, 0)
            if (!newSummary.network.rxErrors) newSummary.network.rxErrors = newSummary.network.interfaces.reduce((tot, iface) => tot + iface.rxErrors, 0)
        }
        current.name = srcNode.name
        current.timestamp = Date.now()
        current.summary = newSummary
        return { node: current, prevNode }
    }

    // "<value> <timestamp>" or just "<value>"
    private parseValue = (valueAndTimestamp: string): { value: number, timestamp: number } => {
        if (valueAndTimestamp.includes(' ')) {
            const [value, timestamp] = valueAndTimestamp.split(' ')
            return { value: +value.trim(), timestamp: +timestamp.trim() }
        }
        return { value: +valueAndTimestamp, timestamp: 0 }
    }

    public readCAdvisorSummary = async (node: INodeInfo): Promise<{ node?: unknown, pods?: unknown }> => {
        const { url, options } = await this.configCall(node, '/stats/summary')
        const resp = await fetch(url, options)
        // The status is checked before parsing: a 404 or a 500 from the kubelet would otherwise surface as an
        // opaque JSON parse error that names neither the status nor the url.
        if (!resp.ok) throw new Error(`Error reading summary from '${url}' ${resp.status}: ${resp.statusText}`)
        return await resp.json() as { node?: unknown, pods?: unknown }
    }

    readClusterMetrics = async (): Promise<IMetricsCluster | undefined> => {
        if (this.loadingClusterMetrics) {
            this.log.warning(`Still loading cluster metrics ${new Date().toTimeString()}`)
            return undefined
        }

        this.loadingClusterMetrics = true
        try {
            this.log.trace(`About to read cluster metrics ${new Date().toTimeString()}`)

            // we rebuild the list of nodes, in the core's map, so nodes that join or leave show up there too
            const newNodeSet = await this.clusterInfo.getNodes()
            for (const nodeName of Array.from(this.clusterInfo.nodes.keys())) {
                if (!newNodeSet.get(nodeName)) this.clusterInfo.nodes.delete(nodeName)
            }
            for (const nodeName of Array.from(newNodeSet.keys())) {
                if (!this.clusterInfo.nodes.get(nodeName)) this.clusterInfo.nodes.set(nodeName, newNodeSet.get(nodeName)!)
            }

            /*
                One node at a time, and a failing node only costs ITS OWN metrics. Without this guard the
                first unreachable kubelet threw, broke the loop, and the whole cluster got no metrics even
                though every other node was answering perfectly.
            */
            const nodeDataList: Array<{ node: IMetricsNode, prevNode: IMetricsNode | undefined }> = []
            for (const node of this.clusterInfo.nodes.values()) {
                try {
                    nodeDataList.push(await this.readNodeMetrics(node))
                }
                catch (err) {
                    this.log.error(`Error reading metrics of node '${node.name}' (${node.ip}): ${describeFetchError(err)}`)
                }
            }
            if (nodeDataList.length === 0) {
                this.log.error('No node answered: there are no cluster metrics for this interval')
                this.loadingClusterMetrics = false
                return undefined
            }
            const nodes = nodeDataList.map(d => d.node)
            const clusterMetricValues = this.enrichWithSyntheticMetrics(nodeDataList)
            const usage = this.getClusterUsage()
            this.loadingClusterMetrics = false
            return { metricsInterval: this.metricsInterval, cluster: usage, nodes, clusterMetricValues }
        }
        catch (err) {
            this.log.error(`Error reading cluster metrics: ${describeFetchError(err)}`)
        }
        this.loadingClusterMetrics = false
        return undefined
    }

    tick = async (): Promise<void> => {
        // a new interval saved in Kwirth settings takes effect here (see configuredInterval)
        const interval = this.configuredInterval()
        if (interval !== this.metricsInterval && this.metricsIntervalRef) {
            this.log.info(`Metrics interval changed from ${this.metricsInterval} to ${interval} seconds`)
            this.stopMetricsInterval()
            this.startMetricsInterval(interval)
        }

        this.prevRead = this.lastRead
        this.lastRead = await this.readClusterMetrics()
        if (this.lastRead) {
            /*
                The usage is recomputed HERE, and not where readClusterMetrics builds it: network throughput is
                a difference between two reads, and from inside readClusterMetrics 'lastRead' has not been
                reassigned yet while 'prevRead' already points at that same object, so subscribers got zero
                traffic, always.
            */
            this.lastRead.cluster = this.getClusterUsage()

            for (const subscriber of this.subscribers.keys()) {
                this.deliveries++
                try {
                    subscriber.processProviderEvent(this.id, this.lastRead)
                }
                catch (err) {
                    // a subscriber that blows up must not bring down the broadcast to the rest
                    this.log.error(`A subscriber threw while processing a metrics read: ${err}`)
                }
            }
        }
    }

    startProvider = async (): Promise<void> => {
        /*
            Without a Kubernetes API behind Kwirth (ECS, ACI, a container with no kubeconfig, Helm mode
            'zero') there are no nodes to read. The core used to unregister this provider there; as an
            extension it notices by itself, says it once and does not start the clock.
        */
        // compared as a string: the provider does not load kwirth-common just for EClusterType.KUBERNETES
        if (String(this.kwirthData?.clusterType) !== 'kubernetes' || !this.clusterInfo?.nodes) {
            this.log.warning('There is no Kubernetes cluster behind this Kwirth: there are no kubelets to read, so the metrics clock is not started')
            return
        }
        /*
            On the desktop the kubelet is reached with the kubeconfig credentials; everywhere else with the
            ServiceAccount token, and without one every single scrape is a 401. Starting the clock then buys
            nothing and costs one error line per node per tick, for ever. A deployment with no permission to
            mint a token is a legitimate setup, not a fault, so this is a warning said once.
        */
        if (!this.kwirthData.isDesktop && !this.clusterInfo.token) {
            this.log.warning('No ServiceAccount token, so no kubelet can be scraped: metrics will not be gathered and the metrics clock is not started')
            return
        }

        this.log.info('Metrics provider started...')
        const nodes = Array.from(this.clusterInfo.nodes.values())
        this.metricsList = new Map()

        try {
            for (const node of nodes) {
                const nodeMetricsMap = await this.loadNodeMetrics(node)
                for (const m of nodeMetricsMap.keys()) {
                    if (!this.metricsList.has(m)) this.metricsList.set(m, nodeMetricsMap.get(m)!)
                }
            }
            this.log.info(`Metric list read: ${this.metricsList.size}`)
            let vcpus = 0
            let memory = 0
            for (const node of nodes) {
                const { node: metricsNode } = await this.readNodeMetrics(node)
                vcpus += metricsNode.machineMetricValues.get('machine_cpu_cores')?.value ?? 0
                memory += metricsNode.machineMetricValues.get('machine_memory_bytes')?.value ?? 0
            }
            this.vcpus = vcpus
            this.memory = memory

            this.startMetricsInterval(this.configuredInterval())
            this.log.info('Metrics gathering started...')
        }
        catch (err) {
            this.log.error(`Error starting metrics provider: ${describeFetchError(err)}`)
        }
    }

    stopProvider = async (): Promise<void> => {
        this.stopMetricsInterval()
        this.subscribers.clear()
    }

    private enrichWithSyntheticMetrics(nodeData: Array<{ node: IMetricsNode, prevNode: IMetricsNode | undefined }>): TMetricValues {
        const totalMemory = this.memory
        const totalVcpus = this.vcpus
        const interval = this.metricsInterval

        for (const { node, prevNode } of nodeData) {
            const containerSynthetics: Array<[string, { value: number, timestamp: number }]> = []
            for (const [key, entry] of node.containerMetricValues) {
                const lastSlash = key.lastIndexOf('/')
                const prefix = key.substring(0, lastSlash + 1)
                const metricName = key.substring(lastSlash + 1)

                switch (metricName) {
                    case 'container_memory_working_set_bytes': {
                        const pct = totalMemory > 0 ? (entry.value / totalMemory) * 100 : 0
                        containerSynthetics.push([`${prefix}kwirth_container_memory_percentage`, { value: pct, timestamp: entry.timestamp }])
                        break
                    }
                    case 'container_cpu_usage_seconds_total': {
                        const prevEntry = prevNode?.containerMetricValues.get(key)
                        const delta = prevEntry !== undefined ? entry.value - prevEntry.value : 0
                        const pct = totalVcpus > 0 && interval > 0 ? (delta / interval) / totalVcpus * 100 : 0
                        containerSynthetics.push([`${prefix}kwirth_container_cpu_percentage`, { value: pct, timestamp: entry.timestamp }])
                        break
                    }
                    case 'container_fs_writes_bytes_total': {
                        const prevEntry = prevNode?.containerMetricValues.get(key)
                        const delta = prevEntry !== undefined ? entry.value - prevEntry.value : 0
                        containerSynthetics.push([`${prefix}kwirth_container_write_mbps`, { value: interval > 0 ? delta / interval / 1_000_000 : 0, timestamp: entry.timestamp }])
                        break
                    }
                    case 'container_fs_reads_bytes_total': {
                        const prevEntry = prevNode?.containerMetricValues.get(key)
                        const delta = prevEntry !== undefined ? entry.value - prevEntry.value : 0
                        containerSynthetics.push([`${prefix}kwirth_container_read_mbps`, { value: interval > 0 ? delta / interval / 1_000_000 : 0, timestamp: entry.timestamp }])
                        break
                    }
                }
            }
            for (const [k, v] of containerSynthetics) node.containerMetricValues.set(k, v)

            const podSynthetics: Array<[string, { value: number, timestamp: number }]> = []
            for (const [key, entry] of node.podMetricValues) {
                const lastSlash = key.lastIndexOf('/')
                const prefix = key.substring(0, lastSlash + 1)
                const metricName = key.substring(lastSlash + 1)

                switch (metricName) {
                    case 'container_network_transmit_bytes_total': {
                        const prevEntry = prevNode?.podMetricValues.get(key)
                        const delta = prevEntry !== undefined ? entry.value - prevEntry.value : 0
                        podSynthetics.push([`${prefix}kwirth_container_transmit_mbps`, { value: interval > 0 ? delta / interval / 1_000_000 : 0, timestamp: entry.timestamp }])
                        break
                    }
                    case 'container_network_receive_bytes_total': {
                        const prevEntry = prevNode?.podMetricValues.get(key)
                        const delta = prevEntry !== undefined ? entry.value - prevEntry.value : 0
                        podSynthetics.push([`${prefix}kwirth_container_receive_mbps`, { value: interval > 0 ? delta / interval / 1_000_000 : 0, timestamp: entry.timestamp }])
                        break
                    }
                }
            }
            for (const [k, v] of podSynthetics) node.podMetricValues.set(k, v)
        }

        return this.clusterSyntheticMetrics(nodeData)
    }

    // cluster-level synthetic metrics
    private clusterSyntheticMetrics = (nodeData: Array<{ node: IMetricsNode, prevNode: IMetricsNode | undefined }>): TMetricValues => {
        const clusterMetricValues: TMetricValues = new Map()
        const now = Date.now()

        // total pods: count distinct namespace/pod prefixes across all nodes
        const podKeys = new Set<string>()
        for (const { node } of nodeData) {
            for (const key of node.podMetricValues.keys()) {
                const parts = key.split('/')
                if (parts.length >= 2) podKeys.add(`${parts[0]}/${parts[1]}`)
            }
        }
        clusterMetricValues.set('kwirth_cluster_total_pods', { value: podKeys.size, timestamp: now })
        const maxPods = Array.from(this.clusterInfo.nodes.values()).reduce((sum, n) => sum + n.maxPods, 0)
        const podsPct = maxPods > 0 ? (podKeys.size / maxPods) * 100 : 0
        clusterMetricValues.set('kwirth_cluster_pods_percentage', { value: podsPct, timestamp: now })

        // cluster memory and cpu from node summaries
        let memUsed = 0, memTotal = 0, cpuUsedNano = 0
        for (const { node } of nodeData) {
            if (node.summary?.memory) {
                memUsed += node.summary.memory.usageBytes
                memTotal += node.summary.memory.usageBytes + node.summary.memory.availableBytes
            }
            if (node.summary?.cpu) {
                cpuUsedNano += node.summary.cpu.usageNanoCores
            }
        }
        const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0
        const cpuPct = this.vcpus > 0 ? (cpuUsedNano / (this.vcpus * 1e9)) * 100 : 0
        clusterMetricValues.set('kwirth_cluster_memory_percentage', { value: memPct, timestamp: now })
        clusterMetricValues.set('kwirth_cluster_cpu_percentage', { value: cpuPct, timestamp: now })

        return clusterMetricValues
    }
}

export default MetricsProvider
