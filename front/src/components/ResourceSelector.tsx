import React, { useState } from 'react'
import { Button, Checkbox, FormControl, InputLabel, MenuItem, Select, SelectChangeEvent, Stack, SxProps, Typography } from '@mui/material'
import { Cluster } from '../model/Cluster'
import { MsgBoxOkError } from '../tools/MsgBox'

import { addGetAuthorization } from '../tools/AuthorizationManagement'
import { BackChannelData, EClusterType, EInstanceConfigView, EInstanceMessageChannel } from '@kwirthmagnify/kwirth-common'
import { ITabObject } from '../model/ITabObject'
import { getIconFromKind } from '../tools/Constants-React'

interface IResourceSelected {
    channelId: string
    clusterName: string
    view: string
    namespaces: string[]
    controllers: string[]
    pods: string[]
    containers: string[]
    name: string
}

interface IResourceSelectorProps {
    onAdd: (resource:IResourceSelected, tab?:ITabObject) => void
    onChangeCluster: (clusterName:string) => void
    resourceSelected: IResourceSelected|undefined
    clusters: Cluster[]
    backChannels: BackChannelData[]
    tabs: ITabObject[]
    sx: SxProps
}

interface IController {
    // these names match with the ones returned in the "/config/groups" fetch.
    type:string,  // 'deployment','replicaset','replicationcontroller','daemonset','statefulset','job'
    name:string
}

const ResourceSelector: React.FC<IResourceSelectorProps> = (props:IResourceSelectorProps) => {
    const [cluster, setCluster] = useState<Cluster>(new Cluster())
    const [view, setView] = useState('')
    const [allNamespaces, setAllNamespaces] = useState<string[]>([])
    const [namespaces, setNamespaces] = useState<string[]>([])
    const [allControllers, setAllControllers] = useState<string[]>([])
    const [controllers, setControllers] = useState<string[]>([])
    const [allPods, setAllPods] = useState<string[]>([])
    const [pods, setPods] = useState<string[]>([])
    const [allContainers, setAllContainers] = useState<string[]>([])
    const [containers, setContainers] = useState<string[]>([])
    const [channel, setChannel] = useState(props.backChannels.length>0? props.backChannels[0].id : 'log')
    const [msgBox, setMsgBox] = useState(<></>)

    let isDocker = cluster.kwirthData?.clusterType === EClusterType.DOCKER

    const loadAllNamespaces = async (cluster:Cluster) => {
        if (cluster) {
            let response = await fetch(`${cluster.url}/config/namespace`, addGetAuthorization(cluster.accessString))
            if (response.status!==200) {
                setMsgBox(MsgBoxOkError('Resource Selector',`Error accessing cluster: ${JSON.stringify(response.status)}`, setMsgBox))
            }
            else {
                let data = await response.json()
                setAllNamespaces(data)
            }
        }
    }

    const loadAllControllers = async (cluster:Cluster,namespace:string) => {
        let response = await fetch(`${cluster!.url}/config/${namespace}/groups`, addGetAuthorization(cluster!.accessString))
        let data = await response.json() as IController[]
        setAllControllers((prev) => [...prev, ...data.map(d => d.type+'+'+d.name)])
        setControllers([])
    }

    const loadAllPods = async (namespaces:string[], controllers:string[]) => {
        if (isDocker) {
            let [gtype,gname] = controllers[0].split('+')
            let response = await fetch(`${cluster!.url}/config/${namespaces[0]}/${gname}/pods?type=${gtype}`, addGetAuthorization(cluster!.accessString))
            let data = await response.json()
            setAllPods((prev) => [...prev, ...data])
        }
        else {
            let list:string[] = []
            for (let namespace of namespaces) {
                for (let group of controllers) {
                    let [gtype,gname] = group.split('+')
                    let response = await fetch(`${cluster!.url}/config/${namespace}/${gname}/pods?type=${gtype}`, addGetAuthorization(cluster!.accessString))
                    let data = await response.json()
                    list.push (...(data as string[]))
                }
            }
            setAllPods((prev) => [...prev, ...new Set(list)])
        }
    }

    const loadAllContainers = async (cluster: Cluster, namespace:string, pod:string) => {
        let response = await fetch(`${cluster.url}/config/${namespace}/${pod}/containers`, addGetAuthorization(cluster.accessString))
        let data = await response.json()
        setAllContainers((prev) => [...prev, ...(data as string[]).map(c => pod+'+'+c)])
    }

    const onChangeCluster = (event: SelectChangeEvent) => {
        let value=event.target.value
        let cluster = props.clusters?.find(c => c.name===value)!
        if (cluster.kwirthData?.clusterType === EClusterType.DOCKER) {
            setCluster(cluster)
            setView('')
            setAllNamespaces([])
            setNamespaces([])
            setAllControllers([])
            setControllers([])
            setPods([])
            setAllContainers([])
            setContainers([])
        }
        else {
            setCluster(cluster)
            setView('')
            setAllNamespaces([])
            setNamespaces([])
            setAllControllers([])
            setControllers([])
            setPods([])
            setAllContainers([])
            setContainers([])
        }
        if (props.onChangeCluster !== undefined) props.onChangeCluster(value)
    }

    const onChangeView = (event: SelectChangeEvent) => {
        let view=event.target.value
        setView(view)

        if (isDocker) {
            setNamespaces(['$docker'])
            setControllers(['$docker'])
            setAllPods([])
            setPods([])
            setContainers([])
            loadAllPods(['$docker'], ['$docker'])
        }
        else {
            setNamespaces([])
            setAllControllers([])
            setControllers([])
            setPods([])
            setAllContainers([])
            setContainers([])
            loadAllNamespaces(props.clusters?.find(c => c.name===cluster.name)!)
            setChannel('')
        }
    }

    const onChangeNamespaces = (event: SelectChangeEvent<typeof namespaces>) => {
        let nss  = event.target.value as string[]
        if (isDocker){
            setNamespaces(['$docker'])
            setAllPods([])
            setPods([])
            if (view!=='namespace') loadAllPods(['$docker'], ['$docker'])
        }
        else {
            setNamespaces(nss)
            setAllControllers([...( view==='pod' || view==='container'? ['Pod+Not Applicable']:[])])
            setControllers([])
            setPods([])
            setAllContainers([])
            setContainers([])
            if (view!=='namespace') nss.map (ns => loadAllControllers(cluster, ns))
        }
    }

    const onChangeController = (event: SelectChangeEvent<typeof controllers>) => {
        let controllers  = event.target.value as string[]
        setControllers(controllers)
        setAllPods([])
        setPods([])
        setAllContainers([])
        setContainers([])
        if (view!==EInstanceConfigView.GROUP) loadAllPods(namespaces,controllers)
    }

    const onChangePod= (event: SelectChangeEvent<typeof pods>) => {
        let pods  = event.target.value as string[]
        setPods(pods)
        setAllContainers([])
        setContainers([])
        if (view === 'container') namespaces.map(ns => pods.map (pod => loadAllContainers(cluster, ns, pod)))
    }

    const onChangeContainer = (event: SelectChangeEvent<typeof containers>) => {
        let cs  = event.target.value as string[]
        setContainers(cs)
    }

    const onChangeChannel = (event: SelectChangeEvent) => {
        setChannel(event.target.value as EInstanceMessageChannel)
    }

    const onAdd = () => {
        let tabName = ''
        if (view===EInstanceConfigView.CLUSTER)
            tabName = 'CLUSTER'
        if (view===EInstanceConfigView.NAMESPACE)
            tabName=namespaces.join('+')
        else if (view===EInstanceConfigView.GROUP)
            tabName=namespaces.join('+')+'-'+controllers.join('+')
        else if (view===EInstanceConfigView.POD)
            tabName=namespaces.join('+')+'-'+pods.join('+')
        else if (view===EInstanceConfigView.CONTAINER)
            tabName=namespaces.join('+')+'-'+pods.join('+')+'-'+containers.join(',')

        let index = -1
        while (props.tabs.find (t => t.name === tabName + index.toString())) index -= 1
        tabName = tabName+index.toString()
        
        let selection:IResourceSelected = {
            channelId: channel,
            clusterName: cluster?.name,
            view,
            namespaces,
            controllers: controllers,
            pods,
            containers,
            name: tabName
        }
        props.onAdd(selection)
    }

    const addable = () => {
        if (cluster === undefined) return false
        if (channel === EInstanceMessageChannel.NONE || channel ==='') return false
        if (view===EInstanceConfigView.CLUSTER) return true
        if (view==='') return false
        if (namespaces.length === 0) return false
        if (view===EInstanceConfigView.NAMESPACE) return true
        if (controllers.length === 0) return false
        if (view===EInstanceConfigView.GROUP) return true
        if (pods.length === 0) return false
        if (view===EInstanceConfigView.POD) return true
        if (containers.length === 0) return false
        return true
    }

    const getIcon = (cluster:Cluster, size:number)  => {
        if (!cluster.kwirthData || !cluster.kwirthData.clusterType) return getIconFromKind('IconK8sUnknown', size)
        if (cluster.kwirthData.clusterType[0] === 'd') return getIconFromKind('IconDocker', size)
        if (cluster.kwirthData.clusterType[0] === 'k') {
            if (cluster.kwirthData.inCluster) 
                return getIconFromKind('IconK8s', size)
            else {
                if (cluster.name === 'inElectron')
                    return getIconFromKind('IconK8sElectron', size)
                else
                    return getIconFromKind('', size)
            }
        }
    }

    const updateResource = async () => {
        if (!props.resourceSelected) return
        let c = props.clusters.find(c => c.name === props.resourceSelected!.clusterName)
        if (!c) return

        props.onChangeCluster(c.name)
        setCluster(c)
        setChannel(props.resourceSelected!.channelId)
        let v = props.resourceSelected!.view
        setView(v)
        let alln=await (await fetch(`${c.url}/config/namespace`, addGetAuthorization(c.accessString))).json()
        setAllNamespaces(alln)
        setNamespaces(props.resourceSelected!.namespaces)

        if (v===EInstanceConfigView.GROUP || v===EInstanceConfigView.POD || v===EInstanceConfigView.CONTAINER) {
            let allg=[]
            for (let namespace of props.resourceSelected!.namespaces) {
                let gs = await (await fetch(`${c.url}/config/${namespace}/groups`, addGetAuthorization(c.accessString))).json()

                allg.push(...gs.map((g: { type: string; name: string }) => g.type+'+'+g.name))
            }
            setAllControllers(allg)
            setControllers(props.resourceSelected!.controllers)
            if (v===EInstanceConfigView.POD || v===EInstanceConfigView.CONTAINER) {
                let allp:string[] = []
                for (let namespace of props.resourceSelected!.namespaces) {
                    for (let controller of props.resourceSelected!.controllers) {
                        let [gtype,gname] = controller.split('+')
                        let ps = await (await fetch(`${c.url}/config/${namespace}/${gname}/pods?type=${gtype}`, addGetAuthorization(c.accessString))).json()
                        allp.push (...ps)
                    }
                }
                setAllPods(allp)
                setPods(props.resourceSelected!.pods)

                if (v===EInstanceConfigView.CONTAINER) {
                    let allc:string[]=[]
                    for (let namespace of props.resourceSelected!.namespaces) {
                        for (let pod of props.resourceSelected!.pods) {
                            let cs = await (await fetch(`${c.url}/config/${namespace}/${pod}/containers`, addGetAuthorization(c.accessString))).json()
                            console.log(cs)
                            allc.push(...cs.map ((c: string) => pod+'+'+c))
                        }
                    }
                    console.log('allc', allc)
                    setAllContainers(allc)
                    setContainers(props.resourceSelected!.containers)
                }
            }
        }
    }
    
    if (props.resourceSelected && props.resourceSelected.channelId!=='') {
        updateResource()
        props.resourceSelected!.channelId=''
    }

    return (<>
        <Stack direction='row' spacing={1} sx={{...props.sx}} alignItems='baseline'>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }}>
                <InputLabel>Cluster</InputLabel>
                <Select value={cluster?.name} onChange={onChangeCluster}>
                { props.clusters?.map( (cluster) => {
                    return <MenuItem key={cluster.name} value={cluster.name} disabled={!cluster.enabled}>
                        <Stack direction={'row'} alignItems={'baseline'}>
                            {getIcon(cluster, 20)} &nbsp; {cluster.name}
                        </Stack>
                    </MenuItem>
                })}
                </Select>
            </FormControl>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }} disabled={cluster.name===''}>
                <InputLabel>View</InputLabel>
                <Select value={view} onChange={onChangeView} >
                    <MenuItem key={EInstanceConfigView.CLUSTER} value={EInstanceConfigView.CLUSTER}>cluster</MenuItem>
                    <MenuItem key={EInstanceConfigView.NAMESPACE} value={EInstanceConfigView.NAMESPACE} disabled={isDocker}>namespace</MenuItem>
                    <MenuItem key={EInstanceConfigView.GROUP} value={EInstanceConfigView.GROUP} disabled={isDocker}>controller</MenuItem>
                    <MenuItem key={EInstanceConfigView.POD} value={EInstanceConfigView.POD}>pod</MenuItem>
                    <MenuItem key={EInstanceConfigView.CONTAINER} value={EInstanceConfigView.CONTAINER}>container</MenuItem>
                </Select>
            </FormControl>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }} disabled={view==='' || isDocker || view===EInstanceConfigView.CLUSTER}>
                <InputLabel>Namespace</InputLabel>
                <Select onChange={onChangeNamespaces} multiple value={namespaces} renderValue={(selected) => selected.join(', ')}>
                { allNamespaces && allNamespaces.map( (namespace:string) => {
                    return (
                        <MenuItem key={namespace} value={namespace}>
                            <Checkbox checked={namespaces.includes(namespace)} />
                            <Typography>{namespace}</Typography>
                        </MenuItem>
                    )
                })}
                </Select>
            </FormControl>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }} disabled={namespaces.length===0 || view==='namespace' || isDocker  || view===EInstanceConfigView.CLUSTER}>
                <InputLabel>Controller</InputLabel>
                <Select onChange={onChangeController} value={controllers} multiple renderValue={(selected) => selected.map(v => v.split('+')[1]).join(', ')}>
                { allControllers && allControllers.map( (value) => 
                    <MenuItem key={value} value={value} sx={{alignContent:'baseline'}}>
                        <Stack direction={'row'} alignItems={'center'}>
                            <Checkbox checked={controllers.includes (value)} />
                            <Stack direction={'row'} alignItems={'baseline'}>
                                {value.startsWith('ReplicaSet')? getIconFromKind('ReplicaSet', 24): value.startsWith('DaemonSet')? getIconFromKind('DaemonSet', 24): value.startsWith('Deployment')? getIconFromKind('Deployment', 24):value.startsWith('StatefulSet')? getIconFromKind('StatefulSet', 24):value.startsWith('ReplicationController')?getIconFromKind('ReplicationController', 24):value.startsWith('ReplicationController')?getIconFromKind('Job', 24):getIconFromKind('', 24)}
                                <Typography>&nbsp;{value.split('+')[1]}</Typography>
                            </Stack>
                        </Stack>
                    </MenuItem>
                )}
                </Select>
            </FormControl>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }} disabled={(!isDocker && (controllers.length === 0 || view===EInstanceConfigView.NAMESPACE || view===EInstanceConfigView.GROUP)) || (isDocker && (view ==='namespace' || namespaces.length === 0))}>
                <InputLabel >Pod</InputLabel>
                <Select value={pods} onChange={onChangePod} multiple renderValue={(selected) => selected.join(', ')}>
                { allPods && allPods.map( (value:string) =>
                    <MenuItem key={value} value={value} sx={{alignContent:'center'}}>
                        <Checkbox checked={pods.includes (value)} />{value}
                    </MenuItem>

                )}
                </Select>
            </FormControl>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }} disabled={pods.length === 0 || view===EInstanceConfigView.NAMESPACE || view===EInstanceConfigView.GROUP || view===EInstanceConfigView.POD}>
                <InputLabel >Container</InputLabel>
                <Select value={containers} onChange={onChangeContainer} multiple renderValue={(selected) => selected.join(', ')}>
                { allContainers && allContainers.map( (value:string) => 
                    <MenuItem key={value} value={value} sx={{alignContent:'center'}}>
                        <Checkbox checked={containers.includes(value)} />
                        <Stack direction={'column'}>
                            {value.split('+')[1]}
                            <Typography color={'darkgray'} fontSize={12}>{value.split('+')[0]}</Typography>
                        </Stack>
                    </MenuItem>
                )}
                </Select>
            </FormControl>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }} disabled={cluster.name === ''}>
                <InputLabel >Channel</InputLabel>
                <Select value={props.backChannels.length>0?channel:''} onChange={onChangeChannel}> 
                    { props.backChannels.map(c => 
                        <MenuItem key={c.id} value={c.id} disabled={(!c.cluster && view===EInstanceConfigView.CLUSTER) || (c.cluster && view!==EInstanceConfigView.CLUSTER)}>{c.id}</MenuItem>)
                    }
                </Select>
            </FormControl>

            <Button onClick={onAdd} sx={{ width:'4%'}} disabled={!addable()}>ADD</Button>
        </Stack>
        { msgBox }
    </>)
}

export type { IResourceSelected }
export { ResourceSelector }