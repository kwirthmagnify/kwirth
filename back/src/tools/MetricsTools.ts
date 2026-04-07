import { ClusterInfo, INodeInfo } from "../model/ClusterInfo"
import { EInstanceConfigView, InstanceConfigViewEnum } from "@kwirthmagnify/kwirth-common"
import { NodeMetrics } from "../model/INodeMetrics"

export interface AssetData {
    podNode: string
    podNamespace: string
    podGroup?: string
    podName: string 
    containerName: string
}

export interface MetricDefinition {
    help: string
    type: string
    eval: string
}

export class MetricsTools {
    private clusterInfo:ClusterInfo
    private metricsList: Map<string,MetricDefinition>
    private loadingClusterMetrics: boolean = false
    private isElectron: boolean = false
    private inCluster: boolean = true

    constructor (clusterInfo:ClusterInfo, isElectron:boolean, inCluster:boolean) {
        this.clusterInfo = clusterInfo
        this.metricsList = new Map()
        this.isElectron = isElectron
        this.inCluster = inCluster
    }

    /*
        URL's from cAdvisor
        
        /metrics/cadvisor
        /stats/summary

        /metrics
        /metrics/probes
        /metrics/resource
        /pods
        /healthz
        /configz

        METRICS FORMAT
        name
        ^(.*[^{]){1}{

        labels
        (?:\s*([^=^{]*)=\"([^\"]*)\",*)

        value + ts
        }\s*(\d+)\s*(\d+)$        

        container_fs_reads_bytes_total{container="customers",device="/dev/sda",id="/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod268dcd16_68d8_497e_a85c_3b6b5031518b.slice/cri-containerd-39eaedb2106a4794c6094a4a142971f948e02b5fa104422f76889a48eeeb9f1a.scope",image="cracrnopro.azurecr.io/customers-dev:latest",name="39eaedb2106a4794c6094a4a142971f948e02b5fa104422f76889a48eeeb9f1a",namespace="dev",pod="customers-5cc8cb444f-psrwp"} 36864 1728588770767
        container_fs_reads_total{container="customers",device="/dev/sda",id="/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod268dcd16_68d8_497e_a85c_3b6b5031518b.slice/cri-containerd-39eaedb2106a4794c6094a4a142971f948e02b5fa104422f76889a48eeeb9f1a.scope",image="cracrnopro.azurecr.io/customers-dev:latest",name="39eaedb2106a4794c6094a4a142971f948e02b5fa104422f76889a48eeeb9f1a",namespace="dev",pod="customers-5cc8cb444f-psrwp"} 5 1728588770767
        container_fs_writes_bytes_total{container="customers",device="/dev/sda",id="/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod268dcd16_68d8_497e_a85c_3b6b5031518b.slice/cri-containerd-39eaedb2106a4794c6094a4a142971f948e02b5fa104422f76889a48eeeb9f1a.scope",image="cracrnopro.azurecr.io/customers-dev:latest",name="39eaedb2106a4794c6094a4a142971f948e02b5fa104422f76889a48eeeb9f1a",namespace="dev",pod="customers-5cc8cb444f-psrwp"} 2.643968e+07 1728588770767
        container_fs_writes_total{container="customers",device="/dev/sda",id="/kubepods.slice/kubepods-besteffort.slice/kubepods-besteffort-pod268dcd16_68d8_497e_a85c_3b6b5031518b.slice/cri-containerd-39eaedb2106a4794c6094a4a142971f948e02b5fa104422f76889a48eeeb9f1a.scope",image="cracrnopro.azurecr.io/customers-dev:latest",name="39eaedb2106a4794c6094a4a142971f948e02b5fa104422f76889a48eeeb9f1a",namespace="dev",pod="customers-5cc8cb444f-psrwp"} 2929 1728588770767

    */

    // obteians the list of metrics available (its names, types and descriptions)
    public getMetricsList() {
        return Array.from(this.metricsList.keys()).map ( metricName => { return { metric:metricName, ...this.metricsList.get(metricName)} })
    }

    // adds properties to matrics map
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

    // creates a map containing all existing metrics in a cluster node (and their properties), but not values
    async loadNodeMetrics(node:INodeInfo): Promise <Map<string,MetricDefinition>> {
        var map:Map<string,MetricDefinition> = new Map()

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

    startMetrics = async () => {
        console.log('Metrics information for cluster is being loaded')
        let nodes = Array.from(this.clusterInfo.nodes.values())

        this.metricsList = new Map()
        for (var node of nodes) {
            var nodeMetricsMap = await this.loadNodeMetrics(node)
            for (var m of nodeMetricsMap.keys()) {
                if (!this.metricsList.has(m)) this.metricsList.set(m,nodeMetricsMap.get(m)!)
            }
        }

        this.clusterInfo.vcpus = 0
        this.clusterInfo.memory = 0
        for (let node of nodes.values()) {
            await this.readNodeMetrics(node)
            if (node.machineMetricValues.get('machine_cpu_cores')) this.clusterInfo.vcpus += node.machineMetricValues.get('machine_cpu_cores')!.value
            if (node.machineMetricValues.get('machine_memory_bytes')) this.clusterInfo.memory += node.machineMetricValues.get('machine_memory_bytes')!.value
        }
        this.clusterInfo.startMetricsInterval(this.clusterInfo.metricsInterval)
        console.log('Metrics gathering started...')
    }

    /*
    curl https://172.18.0.3:10250/metrics/cadvisor -k -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IkFVaEIzSjdNeTBmVmdfZTRtWlVoSnlwMVlTWk5fZ180SWtKcEdHMElfNmMifQ.eyJpc3MiOiJrdWJlcm5ldGVzL3NlcnZpY2VhY2NvdW50Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9uYW1lc3BhY2UiOiJkZWZhdWx0Iiwia3ViZXJuZXRlcy5pby9zZXJ2aWNlYWNjb3VudC9zZWNyZXQubmFtZSI6Imt3aXJ0aC1zYS1rd2lydGh0b2tlbiIsImt1YmVybmV0ZXMuaW8vc2VydmljZWFjY291bnQvc2VydmljZS1hY2NvdW50Lm5hbWUiOiJrd2lydGgtc2EiLCJrdWJlcm5ldGVzLmlvL3NlcnZpY2VhY2NvdW50L3NlcnZpY2UtYWNjb3VudC51aWQiOiIwMmE2N2Y3Ni0zNWNhLTQzYmMtYjQxNS03MzUwNTM1NGFjM2IiLCJzdWIiOiJzeXN0ZW06c2VydmljZWFjY291bnQ6ZGVmYXVsdDprd2lydGgtc2EifQ.mT7HDvn0e7I-iZmznMaqocOmH92Srrib_qdiXu1GDx4tmpRbmYVZN3aCBB2ZwUT-aFnKcvTZMWUlvm_bZUvNzbOq1CZ4SJXB1oij-6wrEf8_d7ZRNrOnvzi7hNs9wKR3V8uEck5avbxTZmRGAoOsuI42KQZ8ABQURf7WqWz0ZdvUh2_WrLZnOrqopbXnLhKuYmbq9pKphsZvWUKTrMmb7hxeTUYzrMKtAAjesLqYla-nNAKgrSktOrbZtvpNuOPdPKhntlHzs-Jj_vbMWH0rbbGSqR88IfmGSt4hqWiQtvTZC0IdVcVXuIc-0aD1GE4M_S0PoSed_Lwiq7e8MQhSqg"
    */

    // read metric raw values at a specific cluster node (invokes kubelet's cAdvisor)
    public readCAdvisorMetrics = async (node:INodeInfo): Promise<string> => {
        let text=''
        
        if (this.isElectron) {
            // electronaccess with kubeconfig credentials
            let cluster = this.clusterInfo.kubeConfig.getCurrentCluster()
            const url = `${cluster!.server}/api/v1/nodes/${node.kubernetesNode.metadata?.name}/proxy/metrics/cadvisor`
            const fetchOptions: any = { method: 'GET' }
            await this.clusterInfo.kubeConfig.applyToFetchOptions(fetchOptions)

            try {
                const response = await fetch(url, fetchOptions)
                if (response.ok)
                    text = await response.text()
                else
                    console.log(`Error reading inElectron metrics ${response.status}: ${response.statusText}`)
            }
            catch (error: any) {
                console.error(`Error reading cAdvisor metrics from inElectron on node ${node.kubernetesNode.metadata?.name}:`, error.message)
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
                console.log(`Error reading cAdvisor inCluster metrics at node ${node.ip}`, error.stack)
            }
        }
        else {
            // external access without kubeconfig
            try {
                let cluster = this.clusterInfo.kubeConfig.getCurrentCluster()
                const url = `${cluster!.server}/api/v1/nodes/${node.kubernetesNode.metadata?.name}/proxy/metrics/cadvisor`
                const fetchOptions: any = { method: 'GET', headers: { Authorization: 'Bearer ' + this.clusterInfo.token} }
                const response = await fetch(url, fetchOptions)
                if (response.ok) 
                    text = await response.text()
                else
                    console.log(`Cannot get kubelet metrics ${response.status}: ${response.statusText}`)
            }
            catch (err) {
                console.log(`Error obtaining kubelet metrics`, err)
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

    public readCAdvisorSummary = async (node:INodeInfo): Promise<any> => {
        if (this.isElectron || !this.inCluster) {
            let cluster = this.clusterInfo.kubeConfig.getCurrentCluster()
            const url = `${cluster!.server}/api/v1/nodes/${node.kubernetesNode.metadata?.name}/proxy/stats/summary`
            const fetchOptions: any = { method: 'GET' }

            // we add kubeconfig credentials
            try {
                await this.clusterInfo.kubeConfig.applyToFetchOptions(fetchOptions)
                const resp = await fetch(url, fetchOptions)
                return await resp.json()
            }
            catch {
                console.log('error reading cadvisor')
            }
        }
        else {
            try {
                let resp = await fetch (`https://${node.ip}:10250/stats/summary`, { headers: { Authorization: 'Bearer ' + this.clusterInfo.token} })
                return await resp.json()
            }
            catch (error:any) {
                console.log(`Error reading cAdvisor summary at node ${node.ip}`, error.stack)
            }
        }
        return {}
    }

    // reads node metrics and loads 'metricValues' with parsed and formated data
    public async readNodeMetrics(node:INodeInfo): Promise<void> {
        let rawSampledNodeMetrics = await this.readCAdvisorMetrics(node)
        const regex = /(?:\s*([^=^{]*)=\"([^"]*)",*)/gm;
        let lines=rawSampledNodeMetrics.split('\n')
        let newContainerMetricValues:Map<string, {value: number, timestamp:number}> = new Map()
        let newPodMetricValues:Map<string, {value: number, timestamp:number}> = new Map()
        let newMachineMetricValues:Map<string, {value: number, timestamp:number}> = new Map()

        for (var line of lines) {
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
            var labels:any={}
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
                var parts=line.split(' ')
                var machineMetricvalue = parts[parts.length-1]
                //node.machineMetricValues.set(sampledMetricName, +machineMetricvalue)
                newMachineMetricValues.set(sampledMetricName, { value: +machineMetricvalue, timestamp: Date.now()} )
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
                                console.log('Repeated container metrics (will add values):')
                                console.log('Line:')
                                console.log(line)
                                console.log('Original metric:', sampledMetricName, newContainerMetricValues.get(sampledMetricName))
                                console.log('Duplicated  metric:', sampledMetricName, newValue)
                                newContainerMetricValues.set(sampledMetricName, { value: newContainerMetricValues.get(sampledMetricName)!.value, timestamp: timestamp} )
                            }
                        }
                        else
                            newContainerMetricValues.set(sampledMetricName, { value: newValue, timestamp:timestamp} )
                    }
                    else {
                        console.log('No value nor ts for container metric: ', line)
                    }
                }
                else {
                    console.log('Invalid container metric format: ', line)
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
                            console.log('No value nor ts for pode metric: ', line)
                        }
                    }
                    else {
                        console.log('Invalid pod metric format: ', line)
                    }    
                }
                else {
                    // line is not a pod metric
                }
                
            }
        }
        node.prevContainerMetricValues = node.containerMetricValues
        node.containerMetricValues = newContainerMetricValues

        node.prevPodMetricValues = node.podMetricValues
        node.podMetricValues = newPodMetricValues

        node.prevMachineMetricValues = node.machineMetricValues
        node.machineMetricValues = newMachineMetricValues

        await this.loadNodeSummary(node)
        
        node.timestamp = Date.now()
    }

    loadNodeSummary = async (node: INodeInfo) => {
        node.prevSummary = node.summary
        node.summary = (await this.readCAdvisorSummary(node)).node as NodeMetrics
        if (node.summary && node.summary.network) {
            if (!node.summary.network.txBytes) node.summary.network.txBytes = node.summary.network.interfaces.reduce( (tot,iface) => tot+iface.txBytes, 0 )
            if (!node.summary.network.rxBytes) node.summary.network.rxBytes = node.summary.network.interfaces.reduce( (tot,iface) => tot+iface.rxBytes, 0 )
            if (!node.summary.network.txErrors) node.summary.network.txErrors = node.summary.network.interfaces.reduce( (tot,iface) => tot+iface.txErrors, 0 )
            if (!node.summary.network.rxErrors) node.summary.network.rxErrors = node.summary.network.interfaces.reduce( (tot,iface) => tot+iface.rxErrors, 0 )
        }
    }

    // read metrics and values for all nodes in the cluster
    public readClusterMetrics = async (clusterInfo: ClusterInfo): Promise<void> => {
        if (this.loadingClusterMetrics) {
            console.log(`Still loading cluster metrics ${new Date().toTimeString()}`)
            return
        }

        //if (global.gc) global.gc()
        this.loadingClusterMetrics = true

        try {
            console.log(`About to read cluster metrics ${new Date().toTimeString()}`)

            // we rebuild the list of nodes
            let newNodeSet = await clusterInfo.getNodes()
            // remove inxistent nodes
            for (let nodeName of Array.from(clusterInfo.nodes.keys())) {
                if (!newNodeSet.get(nodeName)) clusterInfo.nodes.delete(nodeName)
            }
            // add new nodes
            for (let nodeName of Array.from(newNodeSet.keys())) {
                if (!clusterInfo.nodes.get(nodeName)) clusterInfo.nodes.set(nodeName, newNodeSet.get(nodeName)!)
            }

            // we read the metrics of the nodeset
            for (let node of clusterInfo.nodes.values()) {
                await this.readNodeMetrics(node)
            }
        }
        catch (err) {
            console.log('Error reading cluster metrics')
            console.log(err)
        }
        this.loadingClusterMetrics = false
    }

    // get a spsecific value for a concrete metric
    public extractContainerMetrics = (clusterInfo:ClusterInfo, podMetricsSet:Map<string,{value: number, timestamp:number}>, containerMetricsSet:Map<string,{value: number, timestamp:number}>, requestedMetricName:string, view:EInstanceConfigView, node:INodeInfo, asset:AssetData): {value:number, timestamp:number|undefined }=> {
        if (view === EInstanceConfigView.CONTAINER) {
            var metricName = asset.podNamespace + '/' + asset.podName + '/' + asset.containerName + '/' + requestedMetricName
            var value = containerMetricsSet.get(metricName)?.value
            if (value !== undefined) {
                return  { value, timestamp: clusterInfo.nodes.get(node.name)?.timestamp }
            }
            else {
                return  { value: 0, timestamp: clusterInfo.nodes.get(node.name)?.timestamp }
            }    
        }
        else {
            // we extract all metrics in the metricsValue that have an impact in calculating requested metrics (for instance, several container metrics for calculating pod metric)
            // we get some metric values ignoring the container (just ckecking namespace, pod and metricname)
            var subset = Array.from(containerMetricsSet.keys()).filter (k => k.startsWith(asset.podNamespace + '/' + asset.podName+'/') && k.endsWith('/'+requestedMetricName))
            if (subset.length===0) {
                // if we cannot get metrics when extracting data from container metrics, we look for podMetrics
                var podValue = podMetricsSet.get(asset.podNamespace + '/' + asset.podName+'/'+requestedMetricName)?.value
                if (podValue)
                    return  { value: podValue, timestamp: clusterInfo.nodes.get(node.name)?.timestamp }
                else {
                    return  { value: 0, timestamp: clusterInfo.nodes.get(node.name)?.timestamp }
                }
            }
            else {
                var accum = 0
                for (var submetric of subset) { 
                    var v = containerMetricsSet.get(submetric)!.value
                    accum +=v
                }
                return  { value: accum, timestamp: clusterInfo.nodes.get(node.name)?.timestamp }
            }
        }
    }

    public getClusterUsage = () => {
        let cpuu=0, cpun=this.clusterInfo.vcpus
        let memu=0, memt=0
        let tx=0, rx=0
        let prevtx=0, prevrx=0
        if (this.clusterInfo.metrics) {
            try {
                for (let node of this.clusterInfo.nodes.values()) {
                    if (node.summary) {
                        memu+=node.summary.memory.usageBytes
                        memt+=node.summary.memory.usageBytes + node.summary.memory.availableBytes
                        cpuu+=node.summary.cpu.usageNanoCores
                        tx += node.summary.network.txBytes
                        rx += node.summary.network.rxBytes

                        if (node.prevSummary) {
                            prevtx += node.prevSummary.network.txBytes
                            prevrx += node.prevSummary.network.rxBytes
                        }
                    }
                }
                if (memt===0) memt=1
                if (cpun===0) cpun=1
                let tottx = tx-prevtx
                let totrx = rx-prevrx
                tottx = (tottx/1024/1024) / this.clusterInfo.metricsInterval
                totrx = (totrx/1024/1024) / this.clusterInfo.metricsInterval
                return {
                    cpu:(cpuu/(cpun*Math.pow(10,9)))*100,
                    memory:memu/memt*100,
                    txmbps:tottx,
                    rxmbps:totrx
                }
            }
            catch (err) {
                console.error('Error calculating node resources', err)
                return {
                    cpu:Math.random()*100,
                    memory:Math.random()*100,
                    txmbps:Math.random()*100,
                    rxmbps:Math.random()*100
                }
            }
        }
        else {
            return {
                cpu:0,
                memory:0,
                txmbps:0,
                rxmbps:0
            }
        }
    }

}