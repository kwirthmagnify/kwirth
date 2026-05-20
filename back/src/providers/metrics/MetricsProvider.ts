import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { IMetricsCluster, IMetricsClusterUsage, IMetricsNode, IMetricsNodeSummary } from './IMetricsModel'
import { IProvider } from '../IProvider'
import { ClusterInfo, INodeInfo } from '../../model/ClusterInfo'
import { IChannel } from '../../channels/IChannel'
import { ELogComponent, logError, logInfo, logWarning } from '../../tools/Logging'
import express, { Request, Response} from 'express'
import { AuthorizationManagement } from '../../tools/AuthorizationManagement'
import { ApiKeyApi } from '../../api/ApiKeyApi'

export interface IMetricsSubscriberConfig {
}

export interface MetricDefinition {
    help: string
    type: string
    eval: string
}

export class MetricsProvider implements IProvider {
    public readonly id = 'metrics'
    public readonly providesRouter = true
    public router = express.Router()
    public routerAlias = 'metrics'
    readonly requiresApiKeyApi: boolean = true
    public apiKeyApi: ApiKeyApi|undefined

    private clusterInfo: ClusterInfo
    private kwirthData: KwirthData
    private subscribers: Map<IChannel, IMetricsSubscriberConfig> = new Map()

    private metricsList: Map<string,MetricDefinition> = new Map()
    public metricsInterval: number = 15
    public metricsIntervalRef: number|NodeJS.Timeout|undefined = undefined
    private loadingClusterMetrics: boolean = false
    private lastRead:IMetricsCluster|undefined
    private prevRead:IMetricsCluster|undefined
    // private vcpus = 0
    // private memory = 0

    constructor(clusterInfo: ClusterInfo, kwirthData: KwirthData) {
        this.clusterInfo = clusterInfo
        this.kwirthData = kwirthData

        this.router.route('/')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, this.apiKeyApi!))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    if (this.metricsList) {
                        res.status(200).json(this.getMetricsList())
                    }
                    else {
                        res.status(200).json([])
                    }
                }
                catch (err) {
                    res.status(400).send()
                    console.log('Error obtaining available metrics list')
                    console.log(err)
                }
            })
        this.router.route('/usage/*')
            .all( async (req:Request,res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, this.apiKeyApi!))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    switch (req.url) {
                        case '/usage/cluster':
                            //this.sendUsageCluster(req,res)
                            res.status(200).send(this.getClusterUsage())
                        break
                        // case '/usage/poddetail':
                        //     this.sendUsagePodDetail(req,res)
                        // break
                    }
                }
                catch (err) {
                    res.status(400).send()
                    console.log('Error obtaining usage metrics')
                    console.log(err)
                }
            })
            this.router.route('/config')
                .all( async (req:Request,res:Response, next) => {
                    if (! (await AuthorizationManagement.validKey(req, res, this.apiKeyApi!))) return
                    next()
                })
                .get( async (req:Request, res:Response) => {
                    try {
                        res.status(200).json({ metricsInterval: this.metricsInterval })
                    }
                    catch (err) {
                        res.status(400).send()
                        logError(ELogComponent.CORE, 'Error sending metrics settings')
                        logError(ELogComponent.CORE, err)
                    }
                })
                .post( async (req:Request, res:Response) => {
                    try {
                        let data:any = req.body
                        if (data.metricsInterval) {
                            this.metricsInterval = data.metricsInterval
                            this.stopMetricsInterval()
                            this.startMetricsInterval(+data.metricsInterval) 
                            logWarning(ELogComponent.CORE, `New metrics cluster interval set to ${data.metricsInterval}`)
                        }
                        res.status(200).json()
                    }
                    catch (err) {
                        res.status(400).send()
                        console.log('Error updating metrics settings')
                        console.log(err)
                    }
                })
    }

    startMetricsInterval = (seconds: number) => {
        this.metricsInterval = seconds
        this.metricsIntervalRef = setInterval(
            this.tick,
            this.metricsInterval * 1000, 
            this.clusterInfo
        )
    }

    stopMetricsInterval = () => clearInterval(this.metricsIntervalRef)

    public getMetricsList() {
        return Array.from(this.metricsList.keys()).map ( metricName => { return { metric:metricName, ...this.metricsList.get(metricName)} })
    }

    public getClusterUsage = () : IMetricsClusterUsage=> {
        //let cpuUsed=0, cpuNumber=this.vcpus
        let cpuUsed=0, cpuNumber=this.clusterInfo.vcpus
        let memUsed=0, memTotal=0
        let tx=0, rx=0
        let prevtx=0, prevrx=0
        if (this.metricsList && this.lastRead) {
            try {
                
                for (let lastNodeRead of this.lastRead.nodes) {
                    if (lastNodeRead.summary) {
                        memUsed += lastNodeRead.summary.memory.usageBytes
                        memTotal += lastNodeRead.summary.memory.usageBytes + lastNodeRead.summary.memory.availableBytes
                        cpuUsed+=lastNodeRead.summary.cpu.usageNanoCores
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
                if (memTotal===0) memTotal=1
                if (cpuNumber===0) cpuNumber=1
                let tottx = tx-prevtx
                let totrx = rx-prevrx
                tottx = (tottx/1024/1024) / this.metricsInterval
                totrx = (totrx/1024/1024) / this.metricsInterval
                return {
                    // vcpus: this.vcpus,
                    vcpus: this.clusterInfo.vcpus,
                    // memory: this.memory,
                    memory: this.clusterInfo.memory,
                    cpuUsage: (cpuUsed/(cpuNumber*Math.pow(10,9)))*100,
                    memoryUsage: memUsed/memTotal*100,
                    txmbps: tottx,
                    rxmbps: totrx
                }
            }
            catch (err) {
                logError(ELogComponent.CHANNEL, 'Error calculating node resources')
                logError(ELogComponent.CHANNEL, err)
            }
        }
        return {
            // vcpus: this.vcpus,
            // memory: this.memory,
            vcpus: this.clusterInfo.vcpus,
            memory: this.clusterInfo.memory,
            cpuUsage: 0,
            memoryUsage: 0,
            txmbps: 0,
            rxmbps: 0
        }
    }

    addSubscriber = async (channel: IChannel, data: { container:boolean, pod:boolean, machine:boolean }) => {
        try {
            let subscriber: IMetricsSubscriberConfig = {
                ...data,
            }
            this.subscribers.set(channel, subscriber)
        }
        catch(err) {
            logError(ELogComponent.PROVIDER, `Errors occurred while adding subscriber ${channel.getChannelData().id} to provider ${this.id}`)
        }
    }

    removeSubscriber = async (c: IChannel) => {
        if (this.subscribers.has(c)) this.subscribers.delete(c)
    }

    addRecordType (map:Map<string,MetricDefinition>, metricName:string, recordType:string, value:string): void {
        if (!map.has(metricName)) map.set(metricName,{help: '', type: '', eval: ''})
        switch(recordType) {
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

    configCall = async (node:INodeInfo, path:string) : Promise<{url:string, options:any}> => {
        // path: /metrics/cadvisor
        let url, options
        if (this.kwirthData.inCluster) {
            // inside URL plus token
            url = `https://${node.ip}:10250${path}`
            options = { headers: { Authorization: 'Bearer ' + this.clusterInfo.token} }
        }
        else {
            if (this.kwirthData.isElectron) {
                // outside URL plus kubeconfig creds
                let cluster = this.clusterInfo.kubeConfig.getCurrentCluster()
                //url = `${cluster!.server}/api/v1/nodes/${node.kubernetesNode.metadata?.name}/proxy${path}`
                url = `${cluster!.server}/api/v1/nodes/${node.name}/proxy${path}`
                options = { method: 'GET' }
                await this.clusterInfo.kubeConfig.applyToFetchOptions(options)
            }
            else {
                // outside URL plus token
                let cluster = this.clusterInfo.kubeConfig.getCurrentCluster()
                //url = `${cluster!.server}/api/v1/nodes/${node.kubernetesNode.metadata?.name}/proxy${path}`
                url = `${cluster!.server}/api/v1/nodes/${node.name}/proxy${path}`
                options = { headers: { Authorization: 'Bearer ' + this.clusterInfo.token} }
            }
        }
        return { url, options}
    }

    public readCAdvisorMetrics = async (node:INodeInfo): Promise<string> => {
        let text=''
        
        let { url, options } = await this.configCall(node, '/metrics/cadvisor')
        const response = await fetch(url, options)
        if (response.ok)
            text = await response.text()
        else
            logError(ELogComponent.PROVIDER, `Error reading metrics from '${url}' ${response.status}: ${response.statusText}`)

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

    async loadNodeMetrics(node:INodeInfo): Promise <Map<string,MetricDefinition>> {
        var map:Map<string,MetricDefinition> = new Map()

        var allMetrics = await this.readCAdvisorMetrics(node)
        if (!allMetrics) return new Map()

        var lines = allMetrics.split('\n').filter(l => l.startsWith('#'))
        for (var line of lines) {
            var recordType=line.substring(0,6).trim()
            line = line.substring(6).trim()
            var i = line.indexOf(' ')
            var mname = line.substring(0,i).trim()
            var value = line.substring(i).trim()

            if ('machine_scrape_error container_scrape_error'.includes(mname)) {
                // we ignore scraping metrics
                continue
            }

            // create specific new metrics for subtyped metrics: we create a new metric for each specific metric, and we don't add the orignal metrics
            if (mname==='container_memory_failures_total') {
                for (var sub of ['pgfault', 'pgmajfault']) {
                    var submetric = mname + '_' + sub
                    this.addRecordType(map, submetric, recordType, value)
                }
            }
            if (mname==='container_blkio_device_usage_total') {
                for (var sub of ['read', 'write']) {
                    var submetric = mname + '_' + sub
                    this.addRecordType(map, submetric, recordType, value)
                }
            }
            else if (mname==='container_tasks_state') {
                for (var sub of ['iowaiting', 'running', 'sleeping', 'stopped', 'uninterruptible']) {
                    var submetric = mname + '_' + sub
                    this.addRecordType(map, submetric, recordType, value)
                }
            }
            else {
                this.addRecordType(map, mname, recordType, value)
            }
        }
        return map
    }

    // reads node metrics and loads 'metricValues' with parsed and formated data
    async readNodeMetrics(srcNode:INodeInfo): Promise<IMetricsNode> {
        const regex = /(?:\s*([^=^{]*)=\"([^"]*)",*)/gm;
        let rawSampledNodeMetrics = await this.readCAdvisorMetrics(srcNode)
        let lines = rawSampledNodeMetrics.split('\n')
        let newContainerMetricValues: Map<string, {value: number, timestamp:number}> = new Map()
        let newPodMetricValues: Map<string, {value: number, timestamp:number}> = new Map()
        let newMachineMetricValues: Map<string, {value: number, timestamp:number}> = new Map()

        for (let line of lines) {
            if (line==='' || line.startsWith('#')) continue
            
            let i = line.indexOf('{')
            if (i<0) i=line.indexOf(' ')
            let sampledMetricName=line.substring(0,i)
            let sourceMetricName = sampledMetricName

            // now we obtain labels (we obtain data in a while-loop)
            // and we create a labels object containing all labels and its values
            // for this line: container_fs_writes_total{container="customers",device="/dev/sda",id="/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod268dcd16_68d8_497e_a85c_3b6b5031518b.slice/cri-containerd-39eaedb2106a4794c6094a4a142971f948e02b5fa104422f76889a48eeeb9f1a.scope",image="cracrnopro.azurecr.io/customers-dev:latest",name="39eaedb2106a4794c6094a4a142971f948e02b5fa104422f76889a48eeeb9f1a",namespace="dev",pod="customers-5cc8cb444f-psrwp"} 2929 1728588770767
            // we obtain:
            // {
            //    container:"costumers",
            //    device:"/dev/sda",
            //    id:...
            // }
            let m
            let labels:any={}
            while ((m = regex.exec(line)) !== null) {
                if (m.index === regex.lastIndex) regex.lastIndex++
                labels[m[1]]=m[2]
            }

            if (sampledMetricName.startsWith('machine_')) {
                /*
                    machine metrics have no timestamp, and they are no linked to containers nor pods, so we process them in a special way

                    machine_cpu_cores{boot_id="ce1e483e-b238-42b2-9deb-a3665e3f8ff3",machine_id="dc3393257d514881b88878df01c28d2a",system_uuid="3c99405a-660c-4cb5-a2ba-421add685332"} 8
                    machine_cpu_physical_cores{boot_id="ce1e483e-b238-42b2-9deb-a3665e3f8ff3",machine_id="dc3393257d514881b88878df01c28d2a",system_uuid="3c99405a-660c-4cb5-a2ba-421add685332"} 4
                    machine_cpu_sockets{boot_id="ce1e483e-b238-42b2-9deb-a3665e3f8ff3",machine_id="dc3393257d514881b88878df01c28d2a",system_uuid="3c99405a-660c-4cb5-a2ba-421add685332"} 1
                    machine_memory_bytes{boot_id="ce1e483e-b238-42b2-9deb-a3665e3f8ff3",machine_id="dc3393257d514881b88878df01c28d2a",system_uuid="3c99405a-660c-4cb5-a2ba-421add685332"} 3.3651703808e+10
                    machine_nvm_avg_power_budget_watts{boot_id="ce1e483e-b238-42b2-9deb-a3665e3f8ff3",machine_id="dc3393257d514881b88878df01c28d2a",system_uuid="3c99405a-660c-4cb5-a2ba-421add685332"} 0
                    machine_nvm_capacity{boot_id="ce1e483e-b238-42b2-9deb-a3665e3f8ff3",machine_id="dc3393257d514881b88878df01c28d2a",mode="app_direct_mode",system_uuid="3c99405a-660c-4cb5-a2ba-421add685332"} 0
                    machine_nvm_capacity{boot_id="ce1e483e-b238-42b2-9deb-a3665e3f8ff3",machine_id="dc3393257d514881b88878df01c28d2a",mode="memory_mode",system_uuid="3c99405a-660c-4cb5-a2ba-421add685332"} 0
                    machine_scrape_error 0
                */
                let parts=line.split(' ')
                let machineMetricValue = parts[parts.length-1]
                newMachineMetricValues.set(sampledMetricName, { value: +machineMetricValue, timestamp: Date.now()} )
                continue
            }

            if (!labels.pod) continue

            // we rebuild the metric name for subtyped metrics (we create synthetic metrics and we ignore the subtype)
            if (sampledMetricName==='container_memory_failures_total') sampledMetricName += '_' + labels.failure_type
            if (sampledMetricName==='container_tasks_state') sampledMetricName += '_' + labels.state
            if (sampledMetricName==='container_blkio_device_usage_total') sampledMetricName += '_' + labels.operation.toLowerCase()
    
            if (labels.container!=='' && (labels.scope==='container' || labels.scope===undefined)) {

                i = line.indexOf('}')
                if (i>=0) {
                    // THIS IS THE METRIC NAME WE STORE IN THE MAP
                    sampledMetricName= labels.namespace + '/' + labels.pod + '/' + labels.container + '/' + sampledMetricName

                    var valueAndTimestamp=line.substring(i+1).trim()
                    if (valueAndTimestamp!==undefined) {
                        let newValue = 0
                        let timestamp = 0
                        if (valueAndTimestamp.includes(' ')) {
                            newValue = +valueAndTimestamp.split(' ')[0].trim()
                            timestamp = +valueAndTimestamp.split(' ')[1].trim()
                        }
                        else {
                            newValue = +valueAndTimestamp.trim()
                        }

                        if (newContainerMetricValues.has(sampledMetricName)) {
                            if ('container_blkio_device_usage_total container_fs_writes_total container_fs_reads_bytes_total container_fs_reads_total container_fs_writes_bytes_total'.includes(sourceMetricName)) {
                                // it is a synthetic metrics (read & write are labels promoted to metric name)
                                // device usage contains data for different volumes (/dev/sda, /dev/sdb...)
                                // we just sum app all operations ignoring the device
                                newContainerMetricValues.set(sampledMetricName, { value: newValue + newContainerMetricValues.get(sampledMetricName)!.value, timestamp:timestamp } )                                    
                            }
                            else {
                                logInfo(ELogComponent.PROVIDER, 'Repeated container metrics (will add values):')
                                logInfo(ELogComponent.PROVIDER, 'Line:')
                                logInfo(ELogComponent.PROVIDER, line)
                                logInfo(ELogComponent.PROVIDER, 'Original metric:')
                                logInfo(ELogComponent.PROVIDER, sampledMetricName)
                                logInfo(ELogComponent.PROVIDER, newContainerMetricValues.get(sampledMetricName))
                                logInfo(ELogComponent.PROVIDER, 'Duplicated  metric:')
                                logInfo(ELogComponent.PROVIDER, sampledMetricName)
                                logInfo(ELogComponent.PROVIDER, newValue)
                                newContainerMetricValues.set(sampledMetricName, { value: newContainerMetricValues.get(sampledMetricName)!.value, timestamp: timestamp} )
                            }
                        }
                        else
                            newContainerMetricValues.set(sampledMetricName, { value: newValue, timestamp:timestamp} )
                    }
                    else {
                        logWarning(ELogComponent.PROVIDER, 'No value nor ts for container metric: ')
                        logWarning(ELogComponent.PROVIDER, line)
                    }
                }
                else {
                    logWarning(ELogComponent.PROVIDER, 'Invalid container metric format:')
                    logWarning(ELogComponent.PROVIDER, line)
                }
            }
            else {
                if (labels.container==='' && labels.pod!=='' && labels.namespace!=='' && labels.image!=='' && (labels.scope==='hierarchy' || labels.scope===undefined)) {
                    // pod metrics
                    i = line.indexOf('}')
                    if (i>=0) {
                        // this is the metric key we store in the map (NO CONTAINER NAME IN THE METRIC NAME)
                        sampledMetricName= labels.namespace + '/' + labels.pod + '/' + sampledMetricName
    
                        var valueAndTimestamp=line.substring(i+1).trim()
                        if (valueAndTimestamp!==undefined) {
                            let newValue = 0
                            let timestamp = 0
                            if (valueAndTimestamp.includes(' ')) {
                                newValue = +valueAndTimestamp.split(' ')[0].trim()
                                timestamp = +valueAndTimestamp.split(' ')[1].trim()
                            }
                            else
                                newValue = +valueAndTimestamp.trim()
    
                            if (newPodMetricValues.has(sampledMetricName)) {
                                if ('container_network_transmit_packets_dropped_total container_network_transmit_errors_total container_network_transmit_bytes_total container_network_transmit_packets_total container_network_transmit_packets_total container_network_receive_packets_total container_network_receive_bytes_total container_network_receive_errors_total container_network_receive_packets_dropped_total'.includes(sourceMetricName)) {
                                    // duplicated metrics because of different network interfaces exist
                                    // so we just sum up all metrics (we don't care about the exact network interface)
                                    newPodMetricValues.set(sampledMetricName, { value: newValue + newPodMetricValues.get(sampledMetricName)!.value, timestamp:timestamp } )
                                }
                                else {
                                    // this situation occurs when receiveng metrics for more than one container in the same pod
                                    // so we just sum aup values
                                    // console.log('Repeated pod metrics (will add values):')
                                    // console.log('Line:')
                                    // console.log(line)
                                    // console.log('Original metric:   ', sampledMetricName, newPodMetricValues.get(sampledMetricName))
                                    // console.log('Duplicated  metric:', sampledMetricName, newValue)
                                    newPodMetricValues.set(sampledMetricName, { value: newValue + newPodMetricValues.get(sampledMetricName)!.value, timestamp:timestamp } )
                                }
                            }
                            else
                                newPodMetricValues.set(sampledMetricName, { value: newValue, timestamp:timestamp })
                        }
                        else {
                            logWarning(ELogComponent.PROVIDER, 'No value nor ts for pode metric: ')
                            logWarning(ELogComponent.PROVIDER, line)
                        }
                    }
                    else {
                        logWarning(ELogComponent.PROVIDER, 'Invalid pod metric format: ')
                        logWarning(ELogComponent.PROVIDER, line)
                    }    
                }
                else {
                    // line is not a pod metric
                }
                
            }
        }

        let newSummary = (await this.readCAdvisorSummary(srcNode)).node as IMetricsNodeSummary
        if (newSummary && newSummary.network) {
            if (!newSummary.network.txBytes) newSummary.network.txBytes = newSummary.network.interfaces.reduce( (tot,iface) => tot+iface.txBytes, 0 )
            if (!newSummary.network.rxBytes) newSummary.network.rxBytes = newSummary.network.interfaces.reduce( (tot,iface) => tot+iface.rxBytes, 0 )
            if (!newSummary.network.txErrors) newSummary.network.txErrors = newSummary.network.interfaces.reduce( (tot,iface) => tot+iface.txErrors, 0 )
            if (!newSummary.network.rxErrors) newSummary.network.rxErrors = newSummary.network.interfaces.reduce( (tot,iface) => tot+iface.rxErrors, 0 )
        }
        
        return  {
            name: srcNode.name,
            timestamp:Date.now(),
            summary: newSummary,
            containerMetricValues: newContainerMetricValues,
            podMetricValues: newPodMetricValues,
            machineMetricValues: newMachineMetricValues
        }
    }

    public readCAdvisorSummary = async (node:INodeInfo): Promise<any> => {
        let { url, options } = await this.configCall(node, '/stats/summary')
        const resp = await fetch(url, options)
        return await resp.json()
    }

    readClusterMetrics = async (clusterInfo: ClusterInfo): Promise<IMetricsCluster|undefined> => {
        if (this.loadingClusterMetrics) {
            logInfo(ELogComponent.PROVIDER, `Still loading cluster metrics ${new Date().toTimeString()}`)
            return undefined
        }

        this.loadingClusterMetrics = true
        try {
            logInfo(ELogComponent.PROVIDER, `About to read cluster metrics for provider ${new Date().toTimeString()}`)

            // we rebuild the list of nodes
            let newNodeSet = await clusterInfo.getNodes()
            // remove inexistent nodes
            for (let nodeName of Array.from(clusterInfo.nodes.keys())) {
                if (!newNodeSet.get(nodeName)) clusterInfo.nodes.delete(nodeName)
            }
            // add new nodes
            for (let nodeName of Array.from(newNodeSet.keys())) {
                if (!clusterInfo.nodes.get(nodeName)) clusterInfo.nodes.set(nodeName, newNodeSet.get(nodeName)!)
            }

            // we read the metrics of the nodeset
            let nodes:IMetricsNode[] = []
            for (let node of clusterInfo.nodes.values()) {
                nodes.push(await this.readNodeMetrics(node))
            }
            const clusterMetricValues = this.enrichWithSyntheticMetrics(nodes)
            let usage = this.getClusterUsage()
            this.loadingClusterMetrics = false
            return { metricsInterval: this.metricsInterval, cluster:usage, nodes, clusterMetricValues }
        }
        catch (err) {
            logError(ELogComponent.PROVIDER, 'Error reading cluster metrics')
            logError(ELogComponent.PROVIDER, err)
        }
        this.loadingClusterMetrics = false
        return undefined
    }

    private tick = async (clusterInfo: ClusterInfo): Promise<void> => {
        this.prevRead = this.lastRead
        this.lastRead = await this.readClusterMetrics(clusterInfo)
        if (this.lastRead) {
            for (let [channel, _config] of this.subscribers) {
                channel.processProviderEvent(this.id, this.lastRead)
            }
            this.getClusterUsage()
        }
    }

    startProvider = async () => {
        logInfo(ELogComponent.PROVIDER, 'Metrics provider started...')

        let nodes = Array.from(this.clusterInfo.nodes.values())
        this.metricsList = new Map()

        try {
            for (let node of nodes) {
                let nodeMetricsMap = await this.loadNodeMetrics(node)
                for (let m of nodeMetricsMap.keys()) {
                    if (!this.metricsList.has(m)) this.metricsList.set(m,nodeMetricsMap.get(m)!)
                }
            }
            logInfo(ELogComponent.CORE, `Metric list read: ${this.metricsList.size}`)
            let vcpus = 0
            let memory = 0
            for (let node of nodes.values()) {
                let metricsNode = await this.readNodeMetrics(node)
                if (metricsNode.machineMetricValues.get('machine_cpu_cores')) vcpus += metricsNode.machineMetricValues.get('machine_cpu_cores')!.value
                if (metricsNode.machineMetricValues.get('machine_memory_bytes')) memory += metricsNode.machineMetricValues.get('machine_memory_bytes')!.value
            }

            this.clusterInfo.vcpus = vcpus
            this.clusterInfo.memory = memory
            // this.vcpus = vcpus
            // this.memory = memory

            this.startMetricsInterval(this.metricsInterval)
            logInfo(ELogComponent.PROVIDER, 'Metrics gathering started...')
        }
        catch (err) {
            logError(ELogComponent.CORE, 'Error starting metrics provider')
            logError(ELogComponent.CORE, JSON.stringify(err))
        }
    }

    private enrichWithSyntheticMetrics(nodes: IMetricsNode[]): Map<string, {value: number, timestamp: number}> {
        const totalMemory = this.clusterInfo.memory
        const totalVcpus = this.clusterInfo.vcpus
        const interval = this.metricsInterval

        for (const node of nodes) {
            const prevNode = this.prevRead?.nodes.find(n => n.name === node.name)

            const containerEntries = Array.from(node.containerMetricValues.entries())
            for (const [key, entry] of containerEntries) {
                const lastSlash = key.lastIndexOf('/')
                const prefix = key.substring(0, lastSlash + 1)
                const metricName = key.substring(lastSlash + 1)

                switch (metricName) {
                    case 'container_memory_working_set_bytes': {
                        const pct = totalMemory > 0 ? (entry.value / totalMemory) * 100 : 0
                        node.containerMetricValues.set(`${prefix}kwirth_container_memory_percentage`, { value: pct, timestamp: entry.timestamp })
                        break
                    }
                    case 'container_cpu_usage_seconds_total': {
                        const prevEntry = prevNode?.containerMetricValues.get(key)
                        const delta = prevEntry !== undefined ? entry.value - prevEntry.value : 0
                        const pct = totalVcpus > 0 && interval > 0 ? (delta / interval) / totalVcpus * 100 : 0
                        node.containerMetricValues.set(`${prefix}kwirth_container_cpu_percentage`, { value: pct, timestamp: entry.timestamp })
                        break
                    }
                    case 'container_fs_writes_bytes_total': {
                        const prevEntry = prevNode?.containerMetricValues.get(key)
                        const delta = prevEntry !== undefined ? entry.value - prevEntry.value : 0
                        node.containerMetricValues.set(`${prefix}kwirth_container_write_mbps`, { value: interval > 0 ? delta / interval / 1_000_000 : 0, timestamp: entry.timestamp })
                        break
                    }
                    case 'container_fs_reads_bytes_total': {
                        const prevEntry = prevNode?.containerMetricValues.get(key)
                        const delta = prevEntry !== undefined ? entry.value - prevEntry.value : 0
                        node.containerMetricValues.set(`${prefix}kwirth_container_read_mbps`, { value: interval > 0 ? delta / interval / 1_000_000 : 0, timestamp: entry.timestamp })
                        break
                    }
                }
            }

            const podEntries = Array.from(node.podMetricValues.entries())
            for (const [key, entry] of podEntries) {
                const lastSlash = key.lastIndexOf('/')
                const prefix = key.substring(0, lastSlash + 1)
                const metricName = key.substring(lastSlash + 1)

                switch (metricName) {
                    case 'container_network_transmit_bytes_total': {
                        const prevEntry = prevNode?.podMetricValues.get(key)
                        const delta = prevEntry !== undefined ? entry.value - prevEntry.value : 0
                        node.podMetricValues.set(`${prefix}kwirth_container_transmit_mbps`, { value: interval > 0 ? delta / interval / 1_000_000 : 0, timestamp: entry.timestamp })
                        break
                    }
                    case 'container_network_receive_bytes_total': {
                        const prevEntry = prevNode?.podMetricValues.get(key)
                        const delta = prevEntry !== undefined ? entry.value - prevEntry.value : 0
                        node.podMetricValues.set(`${prefix}kwirth_container_receive_mbps`, { value: interval > 0 ? delta / interval / 1_000_000 : 0, timestamp: entry.timestamp })
                        break
                    }
                }
            }
        }

        // cluster-level synthetic metrics
        const clusterMetricValues: Map<string, {value: number, timestamp: number}> = new Map()
        const now = Date.now()

        // total pods: count distinct namespace/pod prefixes across all nodes
        const podKeys = new Set<string>()
        for (const node of nodes) {
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
        for (const node of nodes) {
            if (node.summary?.memory) {
                memUsed += node.summary.memory.usageBytes
                memTotal += node.summary.memory.usageBytes + node.summary.memory.availableBytes
            }
            if (node.summary?.cpu) {
                cpuUsedNano += node.summary.cpu.usageNanoCores
            }
        }
        const memPct = memTotal > 0 ? (memUsed / memTotal) * 100 : 0
        const cpuPct = this.clusterInfo.vcpus > 0 ? (cpuUsedNano / (this.clusterInfo.vcpus * 1e9)) * 100 : 0
        clusterMetricValues.set('kwirth_cluster_memory_percentage', { value: memPct, timestamp: now })
        clusterMetricValues.set('kwirth_cluster_cpu_percentage', { value: cpuPct, timestamp: now })

        return clusterMetricValues
    }

    stopProvider = async () => {
        this.stopMetricsInterval()
    }

}