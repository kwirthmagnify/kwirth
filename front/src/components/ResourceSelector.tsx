import React, { useState } from 'react'
import { Box, Button, Checkbox, FormControl, InputLabel, ListSubheader, MenuItem, Select, SelectChangeEvent, Stack, SxProps, TextField, Tooltip, Typography } from '@mui/material'
import { clusterColor } from '../tools/clusterColor'
import { Cluster } from '../model/Cluster'
import { MsgBoxOkError } from '../tools/MsgBox'

import { addGetAuthorization } from '../tools/AuthorizationManagement'
import { BackChannelData, EChannelMode, EClusterType, EInstanceConfigView, EInstanceMessageChannel } from '@kwirthmagnify/kwirth-common'
import { ITabObject } from '../model/ITabObject'
import { getIconFromKind } from '../tools/Constants-React'
import { TChannelConstructor } from '../channels/IChannel'
import { resolveRemoteChannelHost } from '../tools/ChannelResolution'

// Indicador de canal remoto en el desplegable: 'R' en círculo. Verde = operativo (su Kwirth in-cluster
// está conectado y se puede delegar); gris = no operativo (no hay host conectado, el ADD solo avisará).
const RemoteBadge: React.FC<{ operative: boolean }> = ({ operative }) => (
    <Tooltip title={operative
        ? 'Remote channel — hosted by this cluster\'s in-cluster Kwirth (connected)'
        : 'Remote channel — its in-cluster Kwirth is not connected; connect it to use this channel'}>
        <Box component='span' sx={{ ml: 0.75, width: 16, height: 16, borderRadius: '50%',
            bgcolor: operative ? 'success.main' : 'grey.500', color: '#fff',
            fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>R</Box>
    </Tooltip>
)

/*
    Canal autonomo: no necesita nada del cluster, asi que la unica view en la que se puede arrancar es
    'none'. Se reconoce por tener las DOS banderas de invocacion en false — sin 'cluster' no se le
    puede llamar una vez con '*all', y sin 'resourced' no se le puede llamar por recurso, asi que esa
    combinacion no tenia ninguna via de arranque hasta que existio la view 'none'.
*/
const isAutonomous = (channel: BackChannelData | undefined): boolean =>
    channel !== undefined && !channel.cluster && !channel.resourced

/*
    Que canales tienen sentido con la view elegida:

      cluster                              -> los que soportan invocacion cluster-wide, MAS los
                                              autonomos: si un canal no necesita nada del cluster,
                                              tampoco le estorba que la view lo sea
      none                                 -> solo los autonomos
      namespace/controller/pod/container   -> solo los que soportan invocacion POR RECURSO

    Antes solo se filtraba en 'cluster' y en 'none', asi que con cualquier view de recurso se ofrecian
    TODOS los canales, incluido uno que no sabe arrancar por recurso. Y 'addable()' tampoco lo paraba:
    solo mira que haya recursos seleccionados, no si el canal los admite.
*/
const channelFitsView = (channel: BackChannelData, view: EInstanceConfigView | ''): boolean => {
    switch (view) {
        case '':
            return true
        case EInstanceConfigView.CLUSTER:
            return channel.cluster || isAutonomous(channel)
        case EInstanceConfigView.NONE:
            return isAutonomous(channel)
        default:
            return channel.resourced
    }
}

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
    frontChannels?: Map<string, TChannelConstructor>
    enabledChannels?: string[]
}

interface IController {
    // these names match with the ones returned in the "/config/groups" fetch.
    type:string,  // 'deployment','replicaset','replicationcontroller','daemonset','statefulset','job'
    name:string
}

const ResourceSelector: React.FC<IResourceSelectorProps> = (props:IResourceSelectorProps) => {
    const [cluster, setCluster] = useState<Cluster>(new Cluster())
    const [view, setView] = useState<EInstanceConfigView | ''>('')
    const [allNamespaces, setAllNamespaces] = useState<string[]>([])
    const [namespaces, setNamespaces] = useState<string[]>([])
    const [allControllers, setAllControllers] = useState<string[]>([])
    const [controllers, setControllers] = useState<string[]>([])
    const [allPods, setAllPods] = useState<string[]>([])
    const [pods, setPods] = useState<string[]>([])
    const [allContainers, setAllContainers] = useState<string[]>([])
    const [containers, setContainers] = useState<string[]>([])
    const [channel, setChannel] = useState(props.backChannels.length>0? props.backChannels[0].id : '')
    const [msgBox, setMsgBox] = useState(<></>)
    const [podsByController, setPodsByController] = useState<Map<string, string[]>>(new Map())
    const [podNamespaces, setPodNamespaces] = useState<Map<string, string>>(new Map())
    const [nsFilter, setNsFilter] = useState('')
    const [ctrlFilter, setCtrlFilter] = useState('')
    const [podFilter, setPodFilter] = useState('')
    const [containerFilter, setContainerFilter] = useState('')

    let isDocker = cluster.kwirthData?.clusterType === EClusterType.DOCKER

    // Views que no seleccionan recursos: con ellas los desplegables de namespace/controller/pod/
    // container no pintan nada que elegir.
    const noResourceView = view === EInstanceConfigView.CLUSTER || view === EInstanceConfigView.NONE

    const loadAllNamespaces = async (cluster:Cluster) => {
        if (cluster?.url) {
            try {
                let response = await fetch(`${cluster.url}/config/namespace`, addGetAuthorization(cluster.accessString))
                if (response.status!==200) {
                    setMsgBox(MsgBoxOkError('Resource Selector',`Error accessing cluster: ${JSON.stringify(response.status)}`, setMsgBox))
                }
                else {
                    let data = await response.json()
                    setAllNamespaces(data)
                }
            }
            catch {
                setMsgBox(MsgBoxOkError('Resource Selector', `Cannot reach cluster: ${cluster.url}`, setMsgBox))
            }
        }
    }

    const loadAllControllers = async (cluster:Cluster,namespace:string) => {
        const [groupsResponse, podsResponse] = await Promise.all([
            fetch(`${cluster!.url}/config/${namespace}/groups`, addGetAuthorization(cluster!.accessString)),
            fetch(`${cluster!.url}/config/${namespace}/groups/pods`, addGetAuthorization(cluster!.accessString))
        ])
        const data = await groupsResponse.json() as IController[]
        const podMap = await podsResponse.json() as Record<string, string[]>
        // ReplicaSets with no pods are absent from podMap, so they get dropped from the list
        const filtered = data.filter(d => d.type !== 'ReplicaSet' || podMap[d.type+'+'+d.name])
        setAllControllers((prev) => {
            const next = [...prev, ...filtered.map(d => d.type+'+'+d.name)]
            return next.filter((v, i) => next.indexOf(v) === i)
        })
        setPodsByController(prev => {
            const next = new Map(prev)
            for (const [key, pods] of Object.entries(podMap)) {
                next.set(key, [...new Set([...(next.get(key) ?? []), ...pods])])
            }
            return next
        })
        setPodNamespaces(prev => {
            const next = new Map(prev)
            for (const pods of Object.values(podMap)) {
                for (const pod of pods) next.set(pod, namespace)
            }
            return next
        })
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
            const pods = controllers.flatMap(group => podsByController.get(group) ?? [])
            setAllPods((prev) => [...new Set([...prev, ...pods])])
        }
    }

    const loadAllContainers = async (cluster: Cluster, namespace:string, pod:string) => {
        let response = await fetch(`${cluster.url}/config/${namespace}/${pod}/containers`, addGetAuthorization(cluster.accessString))
        let data = await response.json()
        setAllContainers((prev) => [...new Set([...prev, ...(data as string[]).map(c => pod+'+'+c)])])
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
            setPodsByController(new Map())
            setPodNamespaces(new Map())
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
            setPodsByController(new Map())
            setPodNamespaces(new Map())
            setControllers([])
            setPods([])
            setAllContainers([])
            setContainers([])
        }
        if (props.onChangeCluster !== undefined) props.onChangeCluster(value)
    }

    const onChangeView = (event: SelectChangeEvent) => {
        const view = event.target.value as EInstanceConfigView
        setView(view)

        /*
            La view 'none' es de canales que no necesitan el cluster, asi que aqui no se consulta
            nada: el resto de ramas llaman a loadAllNamespaces(), y eso ademas de ser una peticion
            inutil le saltaria un MsgBox de error a quien no tenga permiso para listar namespaces.
        */
        if (view === EInstanceConfigView.NONE) {
            setNamespaces([])
            setAllControllers([])
            setPodsByController(new Map())
            setPodNamespaces(new Map())
            setControllers([])
            setPods([])
            setAllContainers([])
            setContainers([])
            // Un canal no autonomo no puede arrancar con esta view: se deselecciona en vez de dejar
            // al usuario con un ADD que el back rechazaria sin explicar gran cosa.
            if (!isAutonomous(props.backChannels.find(c => c.id === channel))) setChannel('')
            return
        }

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
            setPodsByController(new Map())
            setPodNamespaces(new Map())
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
            if (view!==EInstanceConfigView.NAMESPACE) loadAllPods(['$docker'], ['$docker'])
        }
        else {
            setNamespaces(nss)
            setAllControllers([...( view===EInstanceConfigView.POD || view===EInstanceConfigView.CONTAINER? ['Pod+No controller']:[])])
            setPodsByController(new Map())
            setPodNamespaces(new Map())
            setControllers([])
            setPods([])
            setAllContainers([])
            setContainers([])
            if (view!==EInstanceConfigView.NAMESPACE) nss.map (ns => loadAllControllers(cluster, ns))
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
        if (view === EInstanceConfigView.CONTAINER) pods.forEach(pod => loadAllContainers(cluster, podNamespaces.get(pod) ?? namespaces[0], pod))
    }

    const onChangeContainer = (event: SelectChangeEvent<typeof containers>) => {
        let cs  = event.target.value as string[]
        setContainers(cs)
    }

    const onChangeChannel = (event: SelectChangeEvent) => {
        const channelId = event.target.value as EInstanceMessageChannel
        setChannel(channelId)

        // Un canal autonomo no arranca con una view de recurso, asi que se le pone 'none' y no se le
        // pide que adivine. Si ya estaba en 'cluster' se respeta: ahi tambien cabe.
        const elegido = props.backChannels.find(c => c.id === channelId)
        if (isAutonomous(elegido) && view !== EInstanceConfigView.CLUSTER) setView(EInstanceConfigView.NONE)
    }

    const onAdd = () => {
        let tabName = ''
        if (view===EInstanceConfigView.NONE)
            tabName = channel.toUpperCase()
        else if (view===EInstanceConfigView.CLUSTER)
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
        if (view===EInstanceConfigView.NONE) return true
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
        let v = props.resourceSelected!.view as EInstanceConfigView
        setView(v)

        // Restaurar una pestaña de canal autonomo no debe consultar el cluster: no hay recursos que
        // repoblar, y la peticion fallaria para quien no tenga permiso de listar namespaces.
        if (v === EInstanceConfigView.NONE) return

        let alln=await (await fetch(`${c.url}/config/namespace`, addGetAuthorization(c.accessString))).json()
        setAllNamespaces(alln)
        setNamespaces(props.resourceSelected!.namespaces)

        if (v===EInstanceConfigView.GROUP || v===EInstanceConfigView.POD || v===EInstanceConfigView.CONTAINER) {
            let allg: string[] = []
            const podMap = new Map<string, string[]>()
            const podNsMap = new Map<string, string>()
            for (let namespace of props.resourceSelected!.namespaces) {
                const [gs, pm] = await Promise.all([
                    (await fetch(`${c.url}/config/${namespace}/groups`, addGetAuthorization(c.accessString))).json(),
                    (await fetch(`${c.url}/config/${namespace}/groups/pods`, addGetAuthorization(c.accessString))).json() as Promise<Record<string, string[]>>
                ])
                for (const [key, pods] of Object.entries(pm)) {
                    podMap.set(key, [...new Set([...(podMap.get(key) ?? []), ...pods])])
                    for (const pod of pods) podNsMap.set(pod, namespace)
                }
                for (const g of gs as { type: string; name: string }[]) {
                    const key = g.type+'+'+g.name
                    if (g.type === 'ReplicaSet' && !pm[key]) continue
                    if (!allg.includes(key)) allg.push(key)
                }
            }
            setAllControllers(allg)
            setPodsByController(podMap)
            setPodNamespaces(podNsMap)
            setControllers(props.resourceSelected!.controllers)
            if (v===EInstanceConfigView.POD || v===EInstanceConfigView.CONTAINER) {
                const allp = [...new Set(props.resourceSelected!.controllers.flatMap(ctrl => podMap.get(ctrl) ?? []))]
                setAllPods(allp)
                setPods(props.resourceSelected!.pods)

                if (v===EInstanceConfigView.CONTAINER) {
                    let allc:string[]=[]
                    for (let pod of props.resourceSelected!.pods) {
                        let ns = podNsMap.get(pod) ?? props.resourceSelected!.namespaces[0]
                        let cs = await (await fetch(`${c.url}/config/${ns}/${pod}/containers`, addGetAuthorization(c.accessString))).json()
                        console.log(cs)
                        allc.push(...cs.map ((c: string) => pod+'+'+c))
                    }
                    console.log('allc', allc)
                    setAllContainers([...new Set(allc)])
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
                        <Stack direction='row' alignItems='center' spacing={1}>
                            <span style={{ lineHeight: 0 }}>{getIcon(cluster, 20)}</span>
                            <span>{cluster.name}</span>
                            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: clusterColor(cluster.name).dot, flexShrink: 0 }} />
                        </Stack>
                    </MenuItem>
                })}
                </Select>
            </FormControl>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }} disabled={cluster.name===''}>
                <InputLabel>View</InputLabel>
                <Select value={view} onChange={onChangeView} >
                    <MenuItem key={EInstanceConfigView.NONE} value={EInstanceConfigView.NONE}>none</MenuItem>
                    <MenuItem key={EInstanceConfigView.CLUSTER} value={EInstanceConfigView.CLUSTER}>cluster</MenuItem>
                    <MenuItem key={EInstanceConfigView.NAMESPACE} value={EInstanceConfigView.NAMESPACE} disabled={isDocker}>namespace</MenuItem>
                    <MenuItem key={EInstanceConfigView.GROUP} value={EInstanceConfigView.GROUP} disabled={isDocker}>controller</MenuItem>
                    <MenuItem key={EInstanceConfigView.POD} value={EInstanceConfigView.POD}>pod</MenuItem>
                    <MenuItem key={EInstanceConfigView.CONTAINER} value={EInstanceConfigView.CONTAINER}>container</MenuItem>
                </Select>
            </FormControl>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }} disabled={view==='' || isDocker || noResourceView}>
                <InputLabel>Namespace</InputLabel>
                { /* autoFocus:false en el menu NO es cosmetico: MenuList clona el item ACTIVO con
                     autoFocus y lo recalcula en cada render, asi que al teclear cambiaba la lista
                     filtrada, otro MenuItem montaba con foco y se lo robaba al campo de filtro a cada
                     letra. Apagarlo en el menu tambien apaga autoFocusItem (Menu lo deriva de el), y el
                     foco inicial lo pone el propio TextField. */ }
                <Select onChange={onChangeNamespaces} multiple value={namespaces} renderValue={(selected) => selected.join(', ')} onClose={() => setNsFilter('')} MenuProps={{ autoFocus: false }}>
                    <ListSubheader sx={{ p: 0 }}>
                        <TextField autoFocus size='small' fullWidth placeholder='Filter...' value={nsFilter} onChange={e => setNsFilter(e.target.value)} onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation() }} sx={{ px: 1, pt: 0.5 }} />
                    </ListSubheader>
                { allNamespaces && allNamespaces.filter(ns => ns.toLowerCase().includes(nsFilter.toLowerCase())).map( (namespace:string) => {
                    return (
                        <MenuItem key={namespace} value={namespace}>
                            <Checkbox checked={namespaces.includes(namespace)} />
                            <Typography>{namespace}</Typography>
                        </MenuItem>
                    )
                })}
                </Select>
            </FormControl>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }} disabled={namespaces.length===0 || view===EInstanceConfigView.NAMESPACE || isDocker || noResourceView}>
                <InputLabel>Controller</InputLabel>
                <Select onChange={onChangeController} value={controllers} multiple renderValue={(selected) => selected.map(v => v.split('+')[1]).join(', ')} onClose={() => setCtrlFilter('')} MenuProps={{ autoFocus: false }}>
                    <ListSubheader sx={{ p: 0 }}>
                        <TextField autoFocus size='small' fullWidth placeholder='Filter...' value={ctrlFilter} onChange={e => setCtrlFilter(e.target.value)} onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation() }} sx={{ px: 1, pt: 0.5 }} />
                    </ListSubheader>
                { allControllers && allControllers.filter(v => v.split('+')[1].toLowerCase().includes(ctrlFilter.toLowerCase())).map( (value) =>
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
                <Select value={pods} onChange={onChangePod} multiple renderValue={(selected) => selected.join(', ')} onClose={() => setPodFilter('')} MenuProps={{ autoFocus: false }}>
                    <ListSubheader sx={{ p: 0 }}>
                        <TextField autoFocus size='small' fullWidth placeholder='Filter...' value={podFilter} onChange={e => setPodFilter(e.target.value)} onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation() }} sx={{ px: 1, pt: 0.5 }} />
                    </ListSubheader>
                { allPods && allPods.filter(v => v.toLowerCase().includes(podFilter.toLowerCase())).map( (value:string) =>
                    <MenuItem key={value} value={value} sx={{alignContent:'center'}}>
                        <Checkbox checked={pods.includes (value)} />{value}
                    </MenuItem>
                )}
                </Select>
            </FormControl>

            <FormControl variant='standard' sx={{ m: 1, minWidth: 100, width:'14%' }} disabled={pods.length === 0 || view===EInstanceConfigView.NAMESPACE || view===EInstanceConfigView.GROUP || view===EInstanceConfigView.POD}>
                <InputLabel >Container</InputLabel>
                <Select value={containers} onChange={onChangeContainer} multiple renderValue={(selected) => selected.join(', ')} onClose={() => setContainerFilter('')} MenuProps={{ autoFocus: false }}>
                    <ListSubheader sx={{ p: 0 }}>
                        <TextField autoFocus size='small' fullWidth placeholder='Filter...' value={containerFilter} onChange={e => setContainerFilter(e.target.value)} onKeyDown={e => { if (e.key !== 'Escape') e.stopPropagation() }} sx={{ px: 1, pt: 0.5 }} />
                    </ListSubheader>
                { allContainers && allContainers.filter(v => v.split('+')[1].toLowerCase().includes(containerFilter.toLowerCase())).map( (value:string) =>
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
                <InputLabel>Channel</InputLabel>
                <Select
                    value={props.backChannels.length>0?channel:''}
                    onChange={onChangeChannel}
                    renderValue={(v) => {
                        if (!v) return undefined
                        const cls = props.frontChannels?.get(v as string)
                        const icon = cls ? React.cloneElement(new cls().getChannelIcon(), { sx: { fontSize: 14, verticalAlign: 'middle', mr: 0.5 } }) : null
                        const cd = props.backChannels.find(x => x.id === v)
                        return <>{icon}<span>{v as string}</span>{cd?.mode === EChannelMode.REMOTE && <RemoteBadge operative={!!resolveRemoteChannelHost(cd.id, cluster.clusterInfo?.id ?? '', props.clusters)} />}</>
                    }}
                >
                    { props.backChannels.filter(c => !props.enabledChannels?.length || props.enabledChannels.includes(c.id)).map(c => {
                        const cls = props.frontChannels?.get(c.id)
                        const icon = cls ? React.cloneElement(new cls().getChannelIcon(), { sx: { fontSize: 18, mr: 0.5 } }) : null
                        return (
                            <MenuItem key={c.id} value={c.id} disabled={!channelFitsView(c, view)}>
                                <Stack direction='row' alignItems='center'>
                                    {icon}
                                    <span>{c.id}</span>
                                    {c.mode === EChannelMode.REMOTE && <RemoteBadge operative={!!resolveRemoteChannelHost(c.id, cluster.clusterInfo?.id ?? '', props.clusters)} />}
                                </Stack>
                            </MenuItem>
                        )
                    })}
                </Select>
            </FormControl>

            <Button onClick={onAdd} sx={{ width:'4%'}} disabled={!addable()}>ADD</Button>
        </Stack>
        { msgBox }
    </>)
}

export type { IResourceSelected }
export { ResourceSelector }