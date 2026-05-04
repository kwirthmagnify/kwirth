import { KwirthData } from '@kwirthmagnify/kwirth-common'
import { INewMetricsCluster, INewMetricsNode, INewMetricsNodeSummary } from './INewMetricsModel'
import { IProvider } from '../IProvider'
import { ClusterInfo, INodeInfo } from '../../model/ClusterInfo'
import { IChannel } from '../../channels/IChannel'
import { ELogComponent, logError, logInfo, logWarning } from '../../tools/Logging'

export interface INewMetricsSubscriberConfig {
}

export interface NewMetricDefinition {
    help: string
    type: string
    eval: string
}

export class NewMetricsProvider implements IProvider {
    public readonly id = 'newmetrics'
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined

    private clusterInfo: ClusterInfo
    private subscribers: Map<IChannel, INewMetricsSubscriberConfig>

    private metricsList: Map<string,NewMetricDefinition>
    private inCluster: boolean
    public metricsInterval: number = 15
    public metricsIntervalRef: number|NodeJS.Timeout|undefined = undefined
    private loadingClusterMetrics: boolean = false

    constructor(clusterInfo: ClusterInfo, kwirthData: KwirthData) {
        this.clusterInfo = clusterInfo
        this.subscribers = new Map()
        this.metricsList = new Map()
        this.inCluster = kwirthData.inCluster
    }

    addSubscriber = async (channel: IChannel, data: { container:boolean, pod:boolean, machine:boolean }) => {
        try {
            let subscriber: INewMetricsSubscriberConfig = {
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

    addRecordType (map:Map<string,NewMetricDefinition>, metricName:string, recordType:string, value:string): void {
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

    public readCAdvisorMetrics = async (node:INodeInfo): Promise<string> => {
        let text=''
        
        if (!this.inCluster) {
            // electron access with kubeconfig credentials
            let cluster = this.clusterInfo.kubeConfig.getCurrentCluster()
            const url = `${cluster!.server}/api/v1/nodes/${node.kubernetesNode.metadata?.name}/proxy/metrics/cadvisor`
            const fetchOptions: any = { method: 'GET' }
            await this.clusterInfo.kubeConfig.applyToFetchOptions(fetchOptions)

            try {
                const response = await fetch(url, fetchOptions)
                if (response.ok)
                    text = await response.text()
                else
                    logError(ELogComponent.PROVIDER, `Error reading outCluster metrics ${response.status}: ${response.statusText}`)
            }
            catch (error: any) {
                logError(ELogComponent.PROVIDER, `Error reading cAdvisor metrics from inElectron on node ${node.kubernetesNode.metadata?.name}:` + error.message)
            }
        }
        else if (this.inCluster) {
            // internal access without kubeconfig
            try {
                const response = await fetch (`https://${node.ip}:10250/metrics/cadvisor`, { headers: { Authorization: 'Bearer ' + this.clusterInfo.token} })
                if (!response.ok) throw new Error(`Error getting kubelet metrics ${response.status}: ${response.statusText}`)
                text = await response.text()
            }
            catch (error:any) {
                logError(ELogComponent.PROVIDER, `Error reading cAdvisor inCluster metrics at node ${node.ip}` + error.stack)
            }
        }
        else {  //+++ what about this else???
            // external access without kubeconfig
            try {
                let cluster = this.clusterInfo.kubeConfig.getCurrentCluster()
                const url = `${cluster!.server}/api/v1/nodes/${node.kubernetesNode.metadata?.name}/proxy/metrics/cadvisor`
                const fetchOptions: any = { method: 'GET', headers: { Authorization: 'Bearer ' + this.clusterInfo.token} }
                const response = await fetch(url, fetchOptions)
                if (response.ok) 
                    text = await response.text()
                else
                    logWarning(ELogComponent.PROVIDER, `Cannot get kubelet metrics ${response.status}: ${response.statusText}`)
            }
            catch (err) {
                logError(ELogComponent.PROVIDER, `Error obtaining kubelet metrics`)
                logError(ELogComponent.PROVIDER, err)
            }
        }

        // add kwirth container metrics
        text += '# HELP kwirth_container_memory_percentage Percentage of memory used by object from the whole cluster\n'
        text += '# TYPE kwirth_container_memory_percentage gauge\n'
        text += 'kwirth_container_memory_percentage{container="xxx",id="kwirth",image="doker.io/kwirth",name="kwirth",namespace="default",pod="kwirth-5b9ddf4fd4-tl25h",scope="container"} 0 1733656438512\n'

        text += '# HELP kwirth_container_cpu_percentage Percentage of cpu used from the whole cluster\n'
        text += '# TYPE kwirth_container_cpu_percentage gauge\n'
        text += 'kwirth_container_cpu_percentage{container="xxx",id="kwirth",image="doker.io/kwirth",name="kwirth",namespace="default",pod="kwirth-5b9ddf4fd4-tl25h",scope="container"} 0 1733656438512\n'

        text += '# HELP kwirth_container_random_counter Accumulated container random values\n'
        text += '# TYPE kwirth_container_random_counter counter\n'
        text += `kwirth_container_random_counter{container="",id="kwirth",image="doker.io/kwirth",name="kwirth",namespace="default",pod="kwirth-5b9ddf4fd4-tl25h",scope="container"} 0 1733656438512\n`

        text += '# HELP kwirth_container_random_gauge Instant container random values\n'
        text += '# TYPE kwirth_container_random_gauge gauge\n'
        text += `kwirth_container_random_gauge{container="",id="kwirth",image="doker.io/kwirth",name="kwirth",namespace="default",pod="kwirth-5b9ddf4fd4-tl25h",scope="container"} 0 1733656438512\n`

        text += '# HELP kwirth_container_transmit_percentage Percentage of data sent in relation to the whole cluster\n'
        text += '# TYPE kwirth_container_transmit_percentage gauge\n'
        text += 'kwirth_container_transmit_percentage{container="",id="kwirth",image="doker.io/kwirth",name="kwirth",namespace="default",pod="kwirth-5b9ddf4fd4-tl25h"} 0 1733656438512\n'

        text += '# HELP kwirth_container_receive_percentage Percentage of data received in relation to the whole cluster\n'
        text += '# TYPE kwirth_container_receive_percentage gauge\n'
        text += 'kwirth_container_receive_percentage{container="",id="kwirth",image="doker.io/kwirth",name="kwirth",namespace="default",pod="kwirth-5b9ddf4fd4-tl25h"} 0 1733656438512\n'

        text += '# HELP kwirth_container_transmit_mbps Mbps of data sent over the last period\n'
        text += '# TYPE kwirth_container_transmit_mbps gauge\n'
        text += 'kwirth_container_transmit_mbps{container="",id="kwirth",image="doker.io/kwirth",name="kwirth",namespace="default",pod="kwirth-5b9ddf4fd4-tl25h"} 0 1733656438512\n'

        text += '# HELP kwirth_container_receive_mbps Mbps of data received over the last period\n'
        text += '# TYPE kwirth_container_receive_mbps gauge\n'
        text += 'kwirth_container_receive_mbps{container="",id="kwirth",image="doker.io/kwirth",name="kwirth",namespace="default",pod="kwirth-5b9ddf4fd4-tl25h"} 0 1733656438512\n'

        text += '# HELP kwirth_container_write_mbps Mbps of data written to storage the last period\n'
        text += '# TYPE kwirth_container_write_mbps gauge\n'
        text += 'kwirth_container_write_mbps{container="",id="kwirth",image="doker.io/kwirth",name="kwirth",namespace="default",pod="kwirth-5b9ddf4fd4-tl25h"} 0 1733656438512\n'

        text += '# HELP kwirth_container_read_mbps Mbps of data read from storage over the last period\n'
        text += '# TYPE kwirth_container_read_mbps gauge\n'
        text += 'kwirth_container_read_mbps{container="",id="kwirth",image="doker.io/kwirth",name="kwirth",namespace="default",pod="kwirth-5b9ddf4fd4-tl25h"} 0 1733656438512\n'

        return text
    }

    async loadNodeMetrics(node:INodeInfo): Promise <Map<string,NewMetricDefinition>> {
        var map:Map<string,NewMetricDefinition> = new Map()

        var allMetrics = await this.readCAdvisorMetrics(node)
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
    async readNodeMetrics(srcNode:INodeInfo): Promise<INewMetricsNode> {
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

        let newSummary = (await this.readCAdvisorSummary(srcNode)).node as INewMetricsNodeSummary
        if (newSummary && newSummary.network) {
            if (!newSummary.network.txBytes) newSummary.network.txBytes = newSummary.network.interfaces.reduce( (tot,iface) => tot+iface.txBytes, 0 )
            if (!newSummary.network.rxBytes) newSummary.network.rxBytes = newSummary.network.interfaces.reduce( (tot,iface) => tot+iface.rxBytes, 0 )
            if (!newSummary.network.txErrors) newSummary.network.txErrors = newSummary.network.interfaces.reduce( (tot,iface) => tot+iface.txErrors, 0 )
            if (!newSummary.network.rxErrors) newSummary.network.rxErrors = newSummary.network.interfaces.reduce( (tot,iface) => tot+iface.rxErrors, 0 )
        }
        
        return  {
            timestamp:Date.now(),
            summary: newSummary,
            containerMetricValues: newContainerMetricValues,
            podMetricValues: newPodMetricValues,
            machineMetricValues: newMachineMetricValues
        }
    }

    readCAdvisorSummary = async (srcNode:INodeInfo): Promise<any> => {
        if (!this.inCluster) {
            let cluster = this.clusterInfo.kubeConfig.getCurrentCluster()
            const url = `${cluster!.server}/api/v1/nodes/${srcNode.kubernetesNode.metadata?.name}/proxy/stats/summary`
            const fetchOptions: any = { method: 'GET' }

            // we add kubeconfig credentials
            try {
                await this.clusterInfo.kubeConfig.applyToFetchOptions(fetchOptions)
                const resp = await fetch(url, fetchOptions)
                return await resp.json()
            }
            catch {
                logError(ELogComponent.PROVIDER, 'Error reading cadvisor')
            }
        }
        else {
            try {
                let resp = await fetch (`https://${srcNode.ip}:10250/stats/summary`, { headers: { Authorization: 'Bearer ' + this.clusterInfo.token} })
                return await resp.json()
            }
            catch (error:any) {
                logError(ELogComponent.PROVIDER, `Error reading cAdvisor summary at node ${srcNode.ip} ` + error.stack)
            }
        }
        return {}
    }

    readClusterMetrics = async (clusterInfo: ClusterInfo): Promise<INewMetricsCluster|undefined> => {
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
            let nodes:INewMetricsNode[] = []
            for (let node of clusterInfo.nodes.values()) {
                nodes.push(await this.readNodeMetrics(node))
            }
            this.loadingClusterMetrics = false
            return { nodes }
        }
        catch (err) {
            logError(ELogComponent.PROVIDER, 'Error reading cluster metrics')
            logError(ELogComponent.PROVIDER, err)
        }
        this.loadingClusterMetrics = false
        return undefined
    }

    private tick = async (clusterInfo: ClusterInfo): Promise<void> => {
        let clusterMetrics = await this.readClusterMetrics(clusterInfo)
        if (clusterMetrics) {
            for (let [channel, _config] of this.subscribers) {
                channel.processProviderEvent(this.id, clusterMetrics)
            }
        }
    }

    startProvider = async () => {
        logInfo(ELogComponent.PROVIDER, 'NewMetrics provider started...')

        let nodes = Array.from(this.clusterInfo.nodes.values())
        this.metricsList = new Map()

        for (var node of nodes) {
            var nodeMetricsMap = await this.loadNodeMetrics(node)
            for (var m of nodeMetricsMap.keys()) {
                if (!this.metricsList.has(m)) this.metricsList.set(m,nodeMetricsMap.get(m)!)
            }
        }

        let vcpus = 0
        let memory = 0
        for (let node of nodes.values()) {
            await this.readNodeMetrics(node)
            if (node.machineMetricValues.get('machine_cpu_cores')) vcpus += node.machineMetricValues.get('machine_cpu_cores')!.value
            if (node.machineMetricValues.get('machine_memory_bytes')) memory += node.machineMetricValues.get('machine_memory_bytes')!.value
        }

        //+++ move this out
        this.clusterInfo.vcpus = vcpus
        this.clusterInfo.memory = memory

        this.metricsIntervalRef = setInterval(
            this.tick,
            this.metricsInterval * 1000, 
            this.clusterInfo
        )
        logInfo(ELogComponent.PROVIDER, 'NewMetrics gathering started...')
    }

    stopProvider = async () => {
        clearInterval(this.metricsIntervalRef)
    }

}