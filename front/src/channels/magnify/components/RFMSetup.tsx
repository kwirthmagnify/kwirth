import { Box, Button, Card, CardContent, CardHeader, Divider, Stack, Typography } from "@mui/material"
import { Theme } from "@mui/material/styles"
import { EMagnifyCommand, IMagnifyData, IMagnifyMessage } from "../MagnifyData"
import { ClusterMetrics } from "./ClusterMetrics"
import { Validations } from "./Validations"
import { IChannelObject } from "../../IChannel"
import { IFileObject, ISpace } from "@jfvilas/react-file-manager"
import { convertBytesToSize, convertSizeToBytes, getNextCronExecution } from "../Tools"
import { UserPreferences } from "./UserPreferences"
import { requestList } from "../MagnifyChannel"
import { objectSections, podsSection } from "./DetailsSections"
import { v4 as uuid } from 'uuid'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from "@kwirthmagnify/kwirth-common"

const setPropertyFunction = (space:ISpace, propName:string, invoke:(p:string) => void) => {
    if (!space.properties) return
    let prop = space.properties.find(p => p.name===propName)
    if (!prop) return
    prop.format = 'function'
    prop.source = invoke
}

const setLeftItem = (
        space:ISpace,
        name:string,
        onClick:(paths:string[], target?:any) => void,
        isVisible?:(name:string, currentFolder:IFileObject, selectedItems:IFileObject[]) => boolean,
        isEnabled?:(name:string, currentFolder:IFileObject, selectedItems:IFileObject[]) => boolean
    ) => {
    let x = space.leftItems?.find(li => li.name===name)
    if (x) {
        x.onClick = onClick
        if (isVisible) x.isVisible = isVisible
        if (isEnabled) x.isEnabled = isEnabled
    }
}

// +++const buildForward = (rootObj:any, portName:string, portProtocol:string, portNumber:string) => {
//     let url = '/kwirth/port-forward/pod/' + rootObj.metadata.namespace + '/' + rootObj.metadata.name + '/' + portNumber
//     return <Stack direction={'row'} alignItems={'center'}>
//         <Stack direction={'row'} alignItems={'center'} >
//             {portName && <Typography variant='body2'>{portName}:</Typography>}
//             <Typography variant='body2'>{portNumber.toString().toLowerCase().replace('https','443').replace('http','80')}/{portProtocol}&nbsp;&nbsp;</Typography>
//         </Stack>
//         <Box sx={{ flexGrow: 1 }} />
//         <Button onClick={() => window.open(url, '_blank')}>Forward</Button>
//     </Stack>
// }

type ContainerStateWaiting = {
  reason?: string;
  message?: string;
};

type ContainerStateRunning = {
  startedAt?: string;
};

type ContainerStateTerminated = {
  exitCode?: number;
  reason?: string;
};

type ContainerState = {
  waiting?: ContainerStateWaiting;
  running?: ContainerStateRunning;
  terminated?: ContainerStateTerminated;
};

type ContainerStatus = {
  name: string;
  ready: boolean;
  restartCount?: number;
  state?: ContainerState;
};

type Color = "green" | "gray" | "orange" | "red" | "blue";

export function getContainerColor(container: ContainerStatus): Color {
  const state = container.state ?? {};

  // 🟢 running
  if (container.ready) return "green"

  // ⚪ ended
  if (state.terminated) return "gray"

  // Waiting
  if (state.waiting) {
    const reason = state.waiting.reason ?? ""

    // 🟡 Starting
    const startingReasons = [ "ContainerCreating", "PodInitializing" ]

    if (startingReasons.includes(reason)) return "orange";

    // 🔴 Error
    return "red"
  }

  // 🔵 others
  return "blue"
}

const rfmSetup = (
        theme: Theme,
        magnifyData:IMagnifyData,
        channelObject:IChannelObject,
        spaces:Map<string, ISpace>,
        onLink:(kind:string, name:string, namespace:string) => void,
        onNavigate:(dest:string) => void,
        onObjectCreate: (kind:string) => void,
        onObjectDelete: (p:string[]) => void,
        onObjectDetails: (p:string[], currentTarget?:Element) => void,
        onObjectEdit: (p:string[]) => void,
        onObjectBrowse: (p:string[]) => void,
        onObjectSearch: (p:string[]) => void
    ) => {

    const setPathFunction = (path:string, invoke:(id?:any) => void) => {
        let x = magnifyData.files.find(f => f.path===path)
        if (x) x.children = invoke
    }

    const getMoreEvents = () => {
        let magnifyMessage:IMagnifyMessage = {
            msgtype: 'magnifymessage',
            accessKey: channelObject.accessString!,
            instance: channelObject.instanceId,
            id: uuid(),
            namespace: '',
            group: '',
            pod: '',
            container: '',
            command: EMagnifyCommand.EVENTS,
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            channel: channelObject.channelId,
            params: [ 'cluster', '', '', '', '500']
        }
        if (channelObject.webSocket) channelObject.webSocket.send(JSON.stringify( magnifyMessage ))

    }

    const showOverview = () => {
        if (!magnifyData.clusterInfo) return <></>
        
        return <Box sx={{bgcolor: 'background.default'}} width={'100%'} height={'100%'}>
            <Card sx={{m:2, display: 'flex', flexDirection: 'column', height: 'calc(100% - 55px)'}}>
                <CardContent sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', p: 2}}>
                    <Stack direction={'row'} justifyContent={'space-between'} width={'100%'} px={1}>
                        <Typography variant='body2'><b>Cluster:</b> {channelObject.clusterInfo?.name}</Typography>
                        <Typography variant='body2'><b>Version:</b> {magnifyData.clusterInfo.major}.{magnifyData.clusterInfo.minor}&nbsp;&nbsp;({magnifyData.clusterInfo.gitVersion})</Typography>
                        <Typography variant='body2'><b>Platform:</b> {magnifyData.clusterInfo.platform}</Typography>
                        <Typography variant='body2'><b>Nodes:</b> {magnifyData.files.filter(f => f.class==='Node').length}</Typography>
                    </Stack>

                    <Divider sx={{mt:1, mb:1}}/>

                    <Box sx={{ flex:1, overflowY: 'auto', ml:1, mr:1 }}>

                        <ClusterMetrics channelObject={channelObject}/>
                        
                        <Divider sx={{mt:1, mb:1}}/>

                        <Validations files={magnifyData.files} onLink={onLink} onNavigate={onNavigate} options={{ summary: true}} />

                        <Divider sx={{mt:1, mb:1}}/>

                        <Stack direction={'column'}>
                            {
                                magnifyData.clusterEvents?.map( (e,index) => {
                                    let severity= e.type? e.type[0]:''
                                    let color='--mui-palette-text-primary'
                                    if (severity==='W') color='orange'
                                    if (severity==='E') color='red'
                                    return <Stack key={index} direction={'row'}>
                                        <Typography variant='body2' sx={{width:'5%', color}}>{severity}</Typography>
                                        <Typography variant='body2' sx={{width:'25%', color}}>{e.eventTime||e.lastTimestamp||e.firstTimestamp}</Typography>
                                        <Typography variant='body2' sx={{width:'70%', color}}>{e.message}</Typography>
                                    </Stack>
                                })
                            }
                        </Stack>
                        <Stack direction={'row'}>
                            <Typography flexGrow={1}/>
                            <Button onClick={getMoreEvents}>More Events</Button>
                        </Stack>
                    </Box>
                </CardContent>
            </Card>
        </Box>
    }

    const showBackground = (f:IFileObject) => {
        let id = f.path.replaceAll('/','')
        const imagePath = require(`./images/${id}.png`);
        return <Box width={'100%'} height={'100%'} sx={{bgcolor: 'background.default'}} display={'flex'} justifyContent={'center'} alignItems={'center'}>
                <img src={imagePath}/>
        </Box>
    }
    
    const showClusterOverview = () => {
        return <Box width={'100%'} height={'100%'} display={'flex'} flexDirection={'column'} gap={2} p={2} sx={{bgcolor: 'background.default', borderBottomRightRadius:'8px', overflowY: 'auto'}}> 
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Status'/>
                <CardContent>
                    <Typography variant='body2'>Total CPU: {magnifyData.files.filter(f => f.class==='Node').reduce ((ac,v) => ac + +v.data.origin.status.capacity.cpu,0)}</Typography>
                    <Typography variant='body2'>Total Memory: {convertBytesToSize (magnifyData.files.filter(f => f.class==='Node').reduce ((ac,v) => ac + convertSizeToBytes(v.data.origin.status.capacity.memory),0))}</Typography>
                    <Typography mt={1}/>
                    <Typography variant='body2'>Actual pods: {magnifyData.files.filter(f => f.class==='Pod').length}</Typography>
                    <Typography variant='body2'>Max pods: {magnifyData.files.filter(f => f.class==='Node').reduce ((ac,v) => ac + +v.data.origin.status.capacity.pods,0)}</Typography>
                </CardContent>
            </Card>
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Validations'/>
                <CardContent>
                    <Validations files={magnifyData.files} onLink={onLink} onNavigate={onNavigate} options={{ node:true }}/>
                </CardContent>
            </Card>
        </Box>
    }

    const showWorkloadOverview = () => {
        return <Box width={'100%'} height={'100%'} display={'flex'} flexDirection={'column'} gap={2} p={2} sx={{bgcolor: 'background.default', borderBottomRightRadius:'8px', overflowY: 'auto'}}> 
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Status'/>
                <CardContent>
                    <Typography variant='body2'>Pods: {magnifyData.files.filter(f => f.class==='Pod').length}</Typography>
                    <Typography mt={1}/>
                    <Typography variant='body2'>Deployments: {magnifyData.files.filter(f => f.class==='Deployment').length}</Typography>
                    <Typography variant='body2'>Daemon sets: {magnifyData.files.filter(f => f.class==='DaemonSet').length}</Typography>
                    <Typography variant='body2'>Replica sets: {magnifyData.files.filter(f => f.class==='ReplicaSet').length}</Typography>
                    <Typography variant='body2'>Replication Controllers: {magnifyData.files.filter(f => f.class==='ReplicationController').length}</Typography>
                    <Typography variant='body2'>Stateful sets: {magnifyData.files.filter(f => f.class==='StatefulSet').length}</Typography>
                    <Typography mt={1}/>
                    <Typography variant='body2'>Jobs: {magnifyData.files.filter(f => f.class==='Job').length}</Typography>
                    <Typography variant='body2'>Cron jobs: {magnifyData.files.filter(f => f.class==='CronJob').length}</Typography>
                </CardContent>
            </Card>
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Validations'/>
                <CardContent>
                    <Validations files={magnifyData.files} onLink={onLink} onNavigate={onNavigate} options={{ replicaSet: true, daemonSet:true, deployment:true, statefulSet:true, job:true }}/>
                </CardContent>
            </Card>
        </Box>
    }

    const showNetworkOverview = () => {
        return <Box width={'100%'} height={'100%'} display={'flex'} flexDirection={'column'} gap={2} p={2} sx={{bgcolor: 'background.default', borderBottomRightRadius:'8px', overflowY: 'auto'}}> 
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Status'/>
                <CardContent>
                    <Typography variant='body2'>Services: {magnifyData.files.filter(f => f.class==='Service').length}</Typography>
                    <Typography variant='body2'>Ingresses: {magnifyData.files.filter(f => f.class==='Ingress').length}</Typography>
                    <Typography variant='body2'>Ingress classes: {magnifyData.files.filter(f => f.class==='IngressClass').length}</Typography>
                </CardContent>
            </Card>
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Validations'/>
                <CardContent>
                    <Validations files={magnifyData.files} onLink={onLink} onNavigate={onNavigate} options={{ingress:true, service:true}}/>
                </CardContent>
            </Card>
        </Box>
    }

    const showConfigOverview = () => {
        return <Box width={'100%'} height={'100%'} display={'flex'} flexDirection={'column'} gap={2} p={2} sx={{bgcolor: 'background.default', borderBottomRightRadius:'8px', overflowY: 'auto'}}> 
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Status'/>
                <CardContent>
                    <Typography variant='body2'>ConfigMap: {magnifyData.files.filter(f => f.class==='ConfigMap').length}</Typography>
                    <Typography variant='body2'>Secret: {magnifyData.files.filter(f => f.class==='Secret').length}</Typography>
                </CardContent>
            </Card>
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Validations'/>
                <CardContent>
                    <Validations files={magnifyData.files} onLink={onLink} onNavigate={onNavigate} options={{configMap:true, secret:true}}/>
                </CardContent>
            </Card>
        </Box>
    }

    const showAccessOverview = () => {
        return <Box width={'100%'} height={'100%'} display={'flex'} flexDirection={'column'} gap={2} p={2} sx={{bgcolor: 'background.default', borderBottomRightRadius:'8px', overflowY: 'auto'}}> 
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Status'/>
                <CardContent>
                    <Typography variant='body2'>Total SA's: {magnifyData.files.filter(f => f.class==='ServiceAccount').length}</Typography>
                    <Typography variant='body2'>Total Roles: {magnifyData.files.filter(f => f.class==='Role').length}</Typography>
                    <Typography variant='body2'>Total Cluster Roles: {magnifyData.files.filter(f => f.class==='ClusterRole').length}</Typography>
                </CardContent>
            </Card>
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Validations'/>
                <CardContent>
                    <Validations files={magnifyData.files} onLink={onLink} onNavigate={onNavigate} options={{ role: true, custerRole:true }}/>
                </CardContent>
            </Card>
        </Box>
    }

    const showStorageOverview = () => {
        return <Box width={'100%'} height={'100%'} display={'flex'} flexDirection={'column'} gap={2} p={2} sx={{bgcolor: 'background.default', borderBottomRightRadius:'8px', overflowY: 'auto'}}> 
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Status'/>
                <CardContent>
                    <Typography variant='body2'>Total PV's: {magnifyData.files.filter(f => f.class==='PersistentVolume').length}</Typography>
                    <Typography variant='body2'>Total PVC's: {magnifyData.files.filter(f => f.class==='PersistentVolumeClaim').length}</Typography>
                    <Typography variant='body2'>Total storage: {convertBytesToSize(magnifyData.files.filter(f => f.class==='PersistentVolumeClaim').reduce((ac, v) => ac+v.data.size, 0))}</Typography>
                </CardContent>
            </Card>
            <Card sx={{m:1, flexShrink: 0}}>
                <CardHeader title='Validations'/>
                <CardContent>
                    <Validations files={magnifyData.files} onLink={onLink} onNavigate={onNavigate} options={{ volumeAttachment: true }}/>
                </CardContent>
            </Card>
        </Box>
    }

    const showPreferences = () => {
        return <Box sx={{bgcolor: 'background.default'}} width={'100%'} height={'100%'} display={'flex'} flexDirection={'column'} gap={2} p={2}> 
            <UserPreferences preferences={magnifyData.userPreferences} files={magnifyData.files} onDataReload={onUserPreferencesReload} channelObject={channelObject}/>
        </Box>
    }
    
    const onUserPreferencesReload = () => {
        magnifyData.files = magnifyData.files.filter(f => f.isDirectory && f.path.split('/').length-1 <= 2)
        magnifyData.files = magnifyData.files.filter(f => f.class!=='crdGroup')
        magnifyData.currentPath='/overview'
        requestList(channelObject)
    }

    // first level menu
    setPathFunction('/overview', showOverview)
    setPathFunction('/cluster', showBackground)
    setPathFunction('/workload', showBackground)
    setPathFunction('/config', showBackground)
    setPathFunction('/network', showBackground)
    setPathFunction('/storage', showBackground)
    setPathFunction('/access', showBackground)
    setPathFunction('/custom', showBackground)

    // second level menu (overview sections)
    setPathFunction('/cluster/overview', showClusterOverview)
    setPathFunction('/workload/overview', showWorkloadOverview)
    setPathFunction('/network/overview', showNetworkOverview)
    setPathFunction('/config/overview', showConfigOverview)
    setPathFunction('/storage/overview', showStorageOverview)
    setPathFunction('/access/overview', showAccessOverview)
    setPathFunction('/preferences', showPreferences)

    //Overview ***************************************************************************
    let spcClassOverview = spaces.get('classOverview')!
    setLeftItem(spcClassOverview, 'create', () => onObjectCreate('Pod'))

    //Workload ***************************************************************************
        // Pod ***************************************************************************

            // common section for showing Pods information con ContentDetail
            let podsItem = podsSection.items.find(item => item.name === 'pods')
            if (podsItem) {
                podsItem.invoke = (rootObj, port) => { 
                    let controllerKind = rootObj.kind
                    let allPods = magnifyData.files.filter(f => f.class===('Pod'))
                    allPods = allPods.filter(f => {
                        let isOwner = false
                        if (controllerKind === 'Deployment') {
                            let rsOwners = f.data.origin.metadata.ownerReferences?.filter((o:any) => o.kind === 'ReplicaSet') || []
                            if (rsOwners && rsOwners.length>0) {
                                let rs = magnifyData.files.find(f => f.path===`/workload/ReplicaSet/${rsOwners[0].name}:${rootObj.metadata.namespace}`)
                                isOwner = rs && rs.data.origin.metadata.ownerReferences.some((or:any) => or.kind==='Deployment' && or.name===rootObj.metadata.name)
                            }
                        }
                        else {
                            isOwner = f.data.origin.metadata.ownerReferences?.some((o:any) => o.kind === controllerKind && o.name === rootObj.metadata.name) || false
                        }
                        if (isOwner) return f
                    })
                    return allPods.map(f => f.data.origin)
                }
            }

            const showListPodContainers = (p:any) => {
                let f = magnifyData.files.find(x => p===x.path)
                if (!f || !f.data.origin.status?.containerStatuses) return <></>
                let result:JSX.Element[]=[]

                const renderSet = (prefix:number, cStatuses:any) => {
                    cStatuses.map((c:any, index:number) => {
                        result.push(<Box key={prefix*1000+index} sx={{ width: '8px', height: '8px', backgroundColor: getContainerColor(c), margin: '1px', display: 'inline-block' }}/>)
                    })
                }
                if (f.data.origin.status.initContainerStatuses && f.data.origin.status.initContainerStatuses.length>0) renderSet(0, f.data.origin.status.initContainerStatuses)
                if (f.data.origin.status.containerStatuses && f.data.origin.status.containerStatuses.length>0) renderSet(1, f.data.origin.status.containerStatuses)
                return result
            }

            const showListPodStatus = (p:any) => {
                let f = magnifyData.files.find(x => p===x.path)
                if (!f || !f.data?.origin?.status) return <></>
                let status = f.data.origin?.metadata?.deletionTimestamp? 'Terminating' : f.data.origin?.status.phase
                return <Typography color={status==='Running'?'green':(status==='Terminating'?'blue':status==='Succeeded'?'gray':(status==='Pending'?'orange':'red'))} fontSize={12}>{status}</Typography>
            }

            let spcClassPod = spaces.get('classPod')!
            setLeftItem(spcClassPod, 'create', () => onObjectCreate('Pod'))
            let spcPod = spaces.get('Pod')!
            setLeftItem(spcPod,'details', onObjectDetails)
            setLeftItem(spcPod,'edit', onObjectEdit)
            setLeftItem(spcPod,'delete', onObjectDelete)
            setPropertyFunction(spcPod, 'container', showListPodContainers)
            setPropertyFunction(spcPod, 'status', showListPodStatus)
            // +++ let objPod = objectSections.get('Pod')
            // if (objPod) {
            //     let item = objPod.find(o => o.name==='containers')!.items.find(item => item.name === 'container')
            //     item = item!.items!.find (i => i.name==='ports')!.items!.find (i => i.name==='forward')
            //     if (item) {
            //         item.invoke = (rootObj, port) => { 
            //             return buildForward(rootObj, port.name, port.protocol, port.containerPort)
            //         }
            //     }
            // }

        // Controller ***************************************************************************
            const showJobConditions = (p:any) => {
                let f = magnifyData.files.find(x => p===x.path)
                if (!f) return
                if (!f.data?.origin?.status?.conditions) return <></>
                let result:JSX.Element[]=[]
                for (let cond of f.data.origin.status.conditions) {
                    if (cond.status==='True') result.push(<Typography key={cond.type} fontSize={12}>{cond.type}</Typography>)
                }
                return <Stack direction={'column'}>
                    {result}
                </Stack>

            }
            
            const showCronJobNextExecution = (p:string) => {
                let f = magnifyData.files.find(x => p===x.path)
                if (!f) return
                let x = getNextCronExecution(f.data.origin.spec.schedule)
                return [`${x?.timeLeft.days}d${x?.timeLeft.hours}h${x?.timeLeft.minutes}m${x?.timeLeft.seconds}s`]
            }

            const showCronJobActive = (p:string) => {
                let f = magnifyData.files.find(x => p===x.path)
                if (!f) return
                return [`${f.data.origin.status?.active?.length || 0}`]
            }

            let spcClassDeployment = spaces.get('classDeployment')!
            setLeftItem(spcClassDeployment, 'create', () => onObjectCreate('Deployment'))
            let spcDeployment = spaces.get('Deployment')!
            setLeftItem(spcDeployment,'details', onObjectDetails)
            setLeftItem(spcDeployment,'edit', onObjectEdit)
            setLeftItem(spcDeployment,'delete', onObjectDelete)

            let spcClassDaemonSet = spaces.get('classDaemonSet')!
            setLeftItem(spcClassDaemonSet, 'create', () => onObjectCreate('DaemonSet'))
            let spcDaemonSet = spaces.get('DaemonSet')!
            setLeftItem(spcDaemonSet,'details', onObjectDetails)
            setLeftItem(spcDaemonSet,'edit', onObjectEdit)
            setLeftItem(spcDaemonSet,'delete', onObjectDelete)

            let spcClassReplicaSet = spaces.get('classReplicaSet')!
            setLeftItem(spcClassReplicaSet, 'create', () => onObjectCreate('ReplicaSet'))
            let spcReplicaSet = spaces.get('ReplicaSet')!
            setLeftItem(spcReplicaSet,'details', onObjectDetails)
            setLeftItem(spcReplicaSet,'edit', onObjectEdit)
            setLeftItem(spcReplicaSet,'delete', onObjectDelete)

            let spcClassReplicationController = spaces.get('classReplicationController')!
            setLeftItem(spcClassReplicationController, 'create', () => onObjectCreate('ReplicationController'))
            let spcReplicationController = spaces.get('ReplicationController')!
            setLeftItem(spcReplicationController,'details', onObjectDetails)
            setLeftItem(spcReplicationController,'edit', onObjectEdit)
            setLeftItem(spcReplicationController,'delete', onObjectDelete)

            let spcClassStatefulSet = spaces.get('classStatefulSet')!
            setLeftItem(spcClassStatefulSet, 'create', () => onObjectCreate('StatefulSet'))
            let spcStatefulSet = spaces.get('StatefulSet')!
            setLeftItem(spcStatefulSet,'details', onObjectDetails)
            setLeftItem(spcStatefulSet,'edit', onObjectEdit)
            setLeftItem(spcStatefulSet,'delete', onObjectDelete)

            let spcClassJob = spaces.get('classJob')!
            setLeftItem(spcClassJob, 'create', () => onObjectCreate('Job'))
            let spcJob = spaces.get('Job')!
            setPropertyFunction(spcJob, 'conditions', showJobConditions)
            setLeftItem(spcJob,'details', onObjectDetails)
            setLeftItem(spcJob,'edit', onObjectEdit)
            setLeftItem(spcJob,'delete', onObjectDelete)

            let spcClassCronJob = spaces.get('classCronJob')!
            setLeftItem(spcClassCronJob, 'create', () => onObjectCreate('CronJob'))
            let spcCronJob = spaces.get('CronJob')!
            setPropertyFunction(spcCronJob, 'active', showCronJobActive)
            setPropertyFunction(spcCronJob, 'nextExecution', showCronJobNextExecution)
            setLeftItem(spcCronJob,'details', onObjectDetails)
            setLeftItem(spcCronJob,'edit', onObjectEdit)
            setLeftItem(spcCronJob,'delete', onObjectDelete)
            let objCronJob = objectSections.get('CronJob')
            if (objCronJob) {
                let item = objCronJob.find(s => s.name==='properties')!.items.find(item => item.name === 'nextExecution')
                if (item) {
                    item.invoke = (rootObj, obj) => {
                        let x = getNextCronExecution(obj.spec.schedule)
                        return [x?.isoString]
                    }
                }
                item = objCronJob.find(s => s.name==='properties')!.items.find(item => item.name === 'timeLeft')
                if (item) {
                    item.invoke = (rootObj, obj) => {
                        let x = getNextCronExecution(obj.spec.schedule)
                        return [`${x?.timeLeft.days}d${x?.timeLeft.hours}h${x?.timeLeft.minutes}m${x?.timeLeft.seconds}s`]
                    }
                }
                item = objCronJob.find(s => s.name==='history')!.items.find(item => item.name === 'jobs')
                if (item) {
                    item.invoke = (rootObj, obj) => {
                        let allJobs = magnifyData.files.filter(f => f.class==='Job')
                        allJobs = allJobs.filter(f => {
                            const owners = f.data.origin.metadata.ownerReferences || []
                            return owners.some((owner:any) => owner.name === obj.metadata.name && owner.kind === 'CronJob')
                        })
                        allJobs = allJobs.map(f => f.data.origin)
                        return allJobs
                    }
                }
            }

    //cluster ***************************************************************************
        // Node ***************************************************************************
            let spcNode = spaces.get('Node')!
            setLeftItem(spcNode,'details', onObjectDetails)
            setLeftItem(spcNode,'edit', onObjectEdit)
            setLeftItem(spcNode,'delete', onObjectDelete)

        // API REsource ***************************************************************************
            let spcAPIResource = spaces.get('V1APIResource')!
            setLeftItem(spcAPIResource,'details', onObjectDetails)
            setLeftItem(spcAPIResource,'browse', onObjectBrowse)

        // Image ***************************************************************************
            let spcImage = spaces.get('Image')!
            setLeftItem(spcImage,'details', onObjectDetails)

        // ClusterOverview ***************************************************************************

            let spcClassClusterOverview = spaces.get('classClusterOverview')!
            setLeftItem(spcClassClusterOverview,'search', onObjectSearch)

        // Namespace *****************************************************************
            let spcNamespace = spaces.get('Namespace')!
            setLeftItem(spcNamespace,'details', onObjectDetails)
            setLeftItem(spcNamespace,'edit', onObjectEdit)
            setLeftItem(spcNamespace,'delete', onObjectDelete)
            setLeftItem(spcNamespace,'search', onObjectSearch)
            let objNamespace = objectSections.get('Namespace')
            if (objNamespace) {
                let getElements = (namespace:string, kind:string, onLink:(kind:string, name:string, namespace:string) => void): JSX.Element => {
                    let text=kind
                    if (kind.includes('+')) [kind, text] = kind.split('+')
                    let elements = magnifyData.files.filter(f => f.data?.origin?.kind === kind && f.data?.origin?.metadata.namespace===namespace)?.map(f => f.data?.origin)
                    if (elements.length===0) return <></>

                    return (
                        <Stack flexDirection={'row'}>
                            <Typography width={'13%'} variant='body2'>{text}</Typography>
                            <Stack flexDirection={'column'}>
                                {
                                    elements.map( (el, index) => {
                                        return <Typography variant='body2'><a key={index} href={`#`} onClick={() => onLink(kind, el.metadata.name, el.metadata.namespace)}>{el.metadata.name}</a></Typography>
                                    })
                                }
                            </Stack>
                        </Stack>
                    )
                }
                let item = objNamespace?.find(s => s.name==='content')?.items.find(item => item.name === 'content')
                if (item) {
                    item.invoke = (rootObj, obj, onLink:(kind:string, name:string, namespace:string) => void) => {
                        return [
                            'Pod','Deployment','DaemonSet','ReplicaSet','ReplicationController+RepController','StatefulSet','Job','CronJob',
                            'PersistentVolumeClaim+PVC', 'PersistentVolume+PV',
                            'ConfigMap', 'Secret', 'Service', 'Endpoints', 'Ingress',
                            'ServiceAccount+SrvAccnt', 'Role', 'RoleBinding'
                        ].map (kind => getElements(obj.metadata.name, kind, onLink))
                    }
                }
            }
        // Component status ********************************************************
            //let spcClassComponentStatus = spaces.get('classComponentStatus')!
            let spcComponentStatus = spaces.get('ComponentStatus')!
            setLeftItem(spcComponentStatus,'details', onObjectDetails)
            setLeftItem(spcComponentStatus,'browse', onObjectBrowse)

    // Network *************************************************************
            // Service ************************************************
            const showServiceSelector = (p:any) => {
                let f = magnifyData.files.find(x => p===x.path)
                if (!f) return
                if (!f.data?.origin?.spec?.selector) return <></>
                return <Stack direction={'column'}>
                    {
                        Object.keys(f.data.origin.spec.selector).map( (key,index) =>
                            <Typography key={index}fontSize={12}>{key}={f?.data.origin.spec.selector[key]}</Typography>
                        )
                    }
                </Stack>

            }

            let spcClassService = spaces.get('classService')!
            setLeftItem(spcClassService, 'create', () => onObjectCreate('Service'))
            let spcService = spaces.get('Service')!
            setPropertyFunction(spcService, 'selector', showServiceSelector)
            setLeftItem(spcService,'details', onObjectDetails)
            setLeftItem(spcService,'edit', onObjectEdit)
            setLeftItem(spcService,'delete', onObjectDelete)
            // +++ let objService = objectSections.get('Service')
            // if (objService) {
            //     let item = objService.find(o => o.name==='connection')!.items.find(item => item.name === 'ports')!.items!.find(item => item.name === 'forward')
            //     if (item) {
            //         item.invoke = (rootObj, port) => {
            //             return buildForward(rootObj, port.name, port.protocol, port.targetPort)
            //         }
            //     }
            // }

        // Endpoints *************************************************
            let spcClassEndpoints = spaces.get('classEndpoints')!
            setLeftItem(spcClassEndpoints, 'create', () => onObjectCreate('Endpoints'))
            let spcEndpoints = spaces.get('Endpoints')!
            setLeftItem(spcEndpoints,'details', onObjectDetails)
            setLeftItem(spcEndpoints,'edit', onObjectEdit)
            setLeftItem(spcEndpoints,'delete', onObjectDelete)

        // Ingress ******************************************************
            const showIngressRules = (p:any) => {
                let f = magnifyData.files.find(x => p===x.path)
                if (!f) return
                if (!f.data?.origin?.spec?.rules) return <></>

                return <Stack direction={'column'}>
                    {
                        f.data.origin.spec.rules.map((rule:any,ruleIndex:number) =>
                            rule.http.paths.map ( (path:any, pathIndex:number) =>
                            <Typography key={ruleIndex+'-'+pathIndex} fontSize={12}>http://{rule.host}{path.path}&nbsp;&rarr;&nbsp;{path.backend.service.name}:{path.backend.service.port.number}</Typography>
                        ))
                    }
                </Stack>

            }

            let spcClassIngress = spaces.get('classIngress')!
            setLeftItem(spcClassIngress, 'create', () => onObjectCreate('Ingress'))
            let spcIngress = spaces.get('Ingress')!
            setPropertyFunction(spcIngress, 'rules', showIngressRules)
            setLeftItem(spcIngress,'details', onObjectDetails)
            setLeftItem(spcIngress,'edit', onObjectEdit)
            setLeftItem(spcIngress,'delete', onObjectDelete)

        // IngressClass ****************************************************************
            let spcClassIngressClass = spaces.get('classIngressClass')!
            setLeftItem(spcClassIngressClass, 'create', () => onObjectCreate('IngressClass'))
            let spcIngressClass = spaces.get('IngressClass')!
            setLeftItem(spcIngressClass,'details', onObjectDetails)
            setLeftItem(spcIngressClass,'edit', onObjectEdit)
            setLeftItem(spcIngressClass,'delete', onObjectDelete)
            let objIngressClass = objectSections.get('IngressClass')
            if (objIngressClass) {
                let item = objIngressClass?.find(s => s.name==='properties')?.items.find(item => item.name === 'ingresses')
                if (item) {
                    item.invoke = (rootObj, obj) => {
                        let allIngresses = magnifyData.files.filter(f => f.path.startsWith('/network/Ingress/'))
                        allIngresses = allIngresses.filter(f => f.data.origin.spec?.ingressClassName === rootObj.metadata?.name || f.data.origin.metadata?.annotations?.['kubernetes.io/ingress.class'] === rootObj.metadata?.name)
                        return allIngresses.map(pvc => { return  {name: pvc.data.origin.metadata.name, namespace: pvc.data.origin.metadata.namespace} })
                    }
                }
            }

        // NetworkPolicy ************************************************************
            let spcClassNetworkPolicy = spaces.get('classNetworkPolicy')!
            setLeftItem(spcClassNetworkPolicy, 'create', () => onObjectCreate('NetworkPolicy'))
            let spcNetworkPolicy = spaces.get('NetworkPolicy')!
            setLeftItem(spcNetworkPolicy,'details', onObjectDetails)
            setLeftItem(spcNetworkPolicy,'edit', onObjectEdit)
            setLeftItem(spcNetworkPolicy,'delete', onObjectDelete)

    // Config ******************************************************************
        // ConfigMap ************************************************
            let spcClassConfigMap = spaces.get('classConfigMap')!
            setLeftItem(spcClassConfigMap, 'create', () => onObjectCreate('ConfigMap'))
            let spcConfigMap = spaces.get('ConfigMap')!
            setLeftItem(spcConfigMap,'details', onObjectDetails)
            setLeftItem(spcConfigMap,'edit', onObjectEdit)
            setLeftItem(spcConfigMap,'delete', onObjectDelete)

            // Secret
            let spcClassSecret = spaces.get('classSecret')!
            setLeftItem(spcClassSecret, 'create', () => onObjectCreate('Secret'))
            let spcSecret = spaces.get('Secret')!
            setLeftItem(spcSecret,'details', onObjectDetails)
            setLeftItem(spcSecret,'edit', onObjectEdit)
            setLeftItem(spcSecret,'delete', onObjectDelete)

            // ResourceQuota
            let spcClassResourceQuota = spaces.get('classResourceQuota')!
            setLeftItem(spcClassResourceQuota, 'create', () => onObjectCreate('ResourceQuota'))
            let spcResourceQuota = spaces.get('ResourceQuota')!
            setLeftItem(spcResourceQuota,'details', onObjectDetails)
            setLeftItem(spcResourceQuota,'edit', onObjectEdit)
            setLeftItem(spcResourceQuota,'delete', onObjectDelete)

            // Limir Range
            let spcClassLimitRange = spaces.get('classLimitRange')!
            setLeftItem(spcClassLimitRange, 'create', () => onObjectCreate('LimitRange'))
            let spcLimitRange = spaces.get('LimitRange')!
            setLeftItem(spcLimitRange,'details', onObjectDetails)
            setLeftItem(spcLimitRange,'edit', onObjectEdit)
            setLeftItem(spcLimitRange,'delete', onObjectDelete)

            // HorizontalPodAutoscaler
            let spcClassHorizontalPodAutoscaler = spaces.get('classHorizontalPodAutoscaler')!
            setLeftItem(spcClassHorizontalPodAutoscaler, 'create', () => onObjectCreate('HorizontalPodAutoscaler'))
            let spcHorizontalPodAutoscaler = spaces.get('HorizontalPodAutoscaler')!
            setLeftItem(spcHorizontalPodAutoscaler,'details', onObjectDetails)
            setLeftItem(spcHorizontalPodAutoscaler,'edit', onObjectEdit)
            setLeftItem(spcHorizontalPodAutoscaler,'delete', onObjectDelete)

            // PodDisruptionBudget
            let spcClassPodDisruptionBudget = spaces.get('classPodDisruptionBudget')!
            setLeftItem(spcClassPodDisruptionBudget, 'create', () => onObjectCreate('PodDisruptionBudget'))
            let spcPodDisruptionBudget = spaces.get('PodDisruptionBudget')!
            setLeftItem(spcPodDisruptionBudget,'details', onObjectDetails)
            setLeftItem(spcPodDisruptionBudget,'edit', onObjectEdit)
            setLeftItem(spcPodDisruptionBudget,'delete', onObjectDelete)

            // PriorityClass
            let spcClassPriorityClass = spaces.get('classPriorityClass')!
            setLeftItem(spcClassPriorityClass, 'create', () => onObjectCreate('PriorityClass'))
            let spcPriorityClass = spaces.get('PriorityClass')!
            setLeftItem(spcPriorityClass,'details', onObjectDetails)
            setLeftItem(spcPriorityClass,'edit', onObjectEdit)
            setLeftItem(spcPriorityClass,'delete', onObjectDelete)

            // RuntimeClass
            let spcClassRuntimeClass = spaces.get('classRuntimeClass')!
            setLeftItem(spcClassRuntimeClass, 'create', () => onObjectCreate('RuntimeClass'))
            let spcRuntimeClass = spaces.get('RuntimeClass')!
            setLeftItem(spcRuntimeClass,'details', onObjectDetails)
            setLeftItem(spcRuntimeClass,'edit', onObjectEdit)
            setLeftItem(spcRuntimeClass,'delete', onObjectDelete)

            // Lease
            let spcClassLease = spaces.get('classLease')!
            setLeftItem(spcClassLease, 'create', () => onObjectCreate('Lease'))
            let spcLease = spaces.get('Lease')!
            setLeftItem(spcLease,'details', onObjectDetails)
            setLeftItem(spcLease,'edit', onObjectEdit)
            setLeftItem(spcLease,'delete', onObjectDelete)

            // ValidatingWebhookConfiguration
            let spcClassValidatingWebhookConfiguration = spaces.get('classValidatingWebhookConfiguration')!
            setLeftItem(spcClassValidatingWebhookConfiguration, 'create', () => onObjectCreate('ValidatingWebhookConfiguration'))
            let spcValidatingWebhookConfiguration = spaces.get('ValidatingWebhookConfiguration')!
            setLeftItem(spcValidatingWebhookConfiguration,'details', onObjectDetails)
            setLeftItem(spcValidatingWebhookConfiguration,'edit', onObjectEdit)
            setLeftItem(spcValidatingWebhookConfiguration,'delete', onObjectDelete)

            // MutatingWebhookConfiguration
            let spcClassMutatingWebhookConfiguration = spaces.get('classMutatingWebhookConfiguration')!
            setLeftItem(spcClassMutatingWebhookConfiguration, 'create', () => onObjectCreate('MutatingWebhookConfiguration'))
            let spcMutatingWebhookConfiguration = spaces.get('MutatingWebhookConfiguration')!
            setLeftItem(spcMutatingWebhookConfiguration,'details', onObjectDetails)
            setLeftItem(spcMutatingWebhookConfiguration,'edit', onObjectEdit)
            setLeftItem(spcMutatingWebhookConfiguration,'delete', onObjectDelete)


        // Storage ***********************************************************
            // PersistentVolumeClaim *****************************************************
            let spcClassPersistentVolumeClaim = spaces.get('classPersistentVolumeClaim')!
            setLeftItem(spcClassPersistentVolumeClaim, 'create', () => onObjectCreate('PersistentVolumeClaim'))
            let spcPersistentVolumeClaim = spaces.get('PersistentVolumeClaim')!
            setLeftItem(spcPersistentVolumeClaim,'details', onObjectDetails)
            setLeftItem(spcPersistentVolumeClaim,'edit', onObjectEdit)
            setLeftItem(spcPersistentVolumeClaim,'delete', onObjectDelete)
            let objPersistentVolumeClaim = objectSections.get('PersistentVolumeClaim')
            if (objPersistentVolumeClaim) {
                let item = objPersistentVolumeClaim.find(i => i.name==='properties')!.items.find(item => item.name === 'pods')
                if (item) {
                    item.invoke = (rootObj, obj) => {
                        let allPods = magnifyData.files.filter(f => f.class==='Pod')
                        let pods = allPods.filter(f => f.data.origin.spec?.volumes?.some( (vol:any) => vol.persistentVolumeClaim?.claimName === obj.metadata.name))
                        let allPodNames = pods.map(f => f.data.origin.metadata.name)
                        return allPodNames
                    }
                }
            }

            // PersistentVolume ****************************************************
            let spcClassPersistentVolume = spaces.get('classPersistentVolume')!
            setLeftItem(spcClassPersistentVolume, 'create', () => onObjectCreate('PersistentVolume'))
            let spcPersistentVolume = spaces.get('PersistentVolume')!
            setLeftItem(spcPersistentVolume,'details', onObjectDetails)
            setLeftItem(spcPersistentVolume,'edit', onObjectEdit)
            setLeftItem(spcPersistentVolume,'delete', onObjectDelete)

            // StorageClass ***********************************************
            let spcClassStorageClass = spaces.get('classStorageClass')!
            setLeftItem(spcClassStorageClass, 'create', () => onObjectCreate('StorageClass'))
            let spcStorageClass = spaces.get('StorageClass')!
            setLeftItem(spcStorageClass,'details', onObjectDetails)
            setLeftItem(spcStorageClass,'edit', onObjectEdit)
            setLeftItem(spcStorageClass,'delete', onObjectDelete)
            let objStorageClass = objectSections.get('StorageClass')
            if (objStorageClass) {
                let item = objStorageClass.find(i => i.name==='properties')!.items.find(item => item.name === 'pvs')
                if (item) {
                    item.invoke = (rootObj, obj) => {
                        let allPvs = magnifyData.files.filter(f => f.path.startsWith('/storage/PersistentVolume/'))
                        allPvs = allPvs.filter(f => f.data.origin.spec?.storageClassName === rootObj.metadata.name)
                        return allPvs.map(pv => pv.data.origin.metadata.name)
                    }
                }
                item = objStorageClass.find(i => i.name==='properties')!.items.find(item => item.name === 'pvcs')
                if (item) {
                    item.invoke = (rootObj, obj) => {
                        let allPvcs = magnifyData.files.filter(f => f.path.startsWith('/storage/PersistentVolumeClaim/'))
                        allPvcs = allPvcs.filter(f => f.data.origin.spec?.storageClassName === rootObj.metadata.name)
                        return allPvcs.map(pvc => { return  {name: pvc.data.origin.metadata.name, namespace: pvc.data.origin.metadata.namespace} })
                    }
                }
            }

            // Volume attachment *********************************************
            let spcVolumeAttachment = spaces.get('VolumeAttachment')!
            setLeftItem(spcVolumeAttachment,'details', onObjectDetails)
            setLeftItem(spcVolumeAttachment,'browse', onObjectBrowse)

            // CSI Driver ***************************************************
            let spcCSIDriver = spaces.get('CSIDriver')!
            setLeftItem(spcCSIDriver,'details', onObjectDetails)
            setLeftItem(spcCSIDriver,'browse', onObjectBrowse)
            let objCSIDriver = objectSections.get('CSIDriver')
            if (objCSIDriver) {
                let item = objCSIDriver?.find(s => s.name==='properties')?.items.find(item => item.name === 'storageClasses')
                if (item) {
                    item.invoke = (rootObj, obj, onLink:(kind:string, name:string, namespace:string) => void) => {
                        let stgClasses = magnifyData.files.filter(f => f.path.startsWith('/storage/StorageClass/'))
                        return [
                            <Stack flexDirection={'row'}>
                                <Typography width={'13%'}>StgClass</Typography>
                                <Stack flexDirection={'column'}>
                                    {
                                        stgClasses.map( (i, index) => {
                                            if (i.data.origin.provisioner === rootObj.metadata?.name)
                                                return <a key={index} href={`#`} onClick={() => onLink('StorageClass', i.data.origin.metadata.name, '')}>{i.data.origin.metadata.name}</a>
                                        })
                                    }
                                </Stack>
                            </Stack>
                        ]
                    }
                }
            }

            // CSI Node **************************************************
            let spcCSINode = spaces.get('CSINode')!
            setLeftItem(spcCSINode,'details', onObjectDetails)
            setLeftItem(spcCSINode,'browse', onObjectBrowse)

            // CSI Stg CApacity **********************************************
            let spcCSIStorageCapacity = spaces.get('CSIStorageCapacity')!
            setLeftItem(spcCSIStorageCapacity,'details', onObjectDetails)
            setLeftItem(spcCSIStorageCapacity,'browse', onObjectBrowse)

        // Access ***********************************************************

            // ServiceAccount ****************************************************
            let spcClassServiceAccount = spaces.get('classServiceAccount')!
            setLeftItem(spcClassServiceAccount, 'create', () => onObjectCreate('ServiceAccount'))
            let spcServiceAccount = spaces.get('ServiceAccount')!
            setLeftItem(spcServiceAccount,'details', onObjectDetails)
            setLeftItem(spcServiceAccount,'edit', onObjectEdit)
            setLeftItem(spcServiceAccount,'delete', onObjectDelete)
            let objServiceAccount = objectSections.get('ServiceAccount')
            if (objServiceAccount) {
                let item = objServiceAccount.find(s => s.name==='properties')!.items.find(item => item.name === 'tokens')
                if (item) {
                    item.invoke = (rootObj, obj) => {
                        let x = magnifyData.files.filter(f => f.data?.origin?.metadata?.annotations && f.data?.origin?.metadata?.namespace && f.data?.origin?.metadata?.annotations['kubernetes.io/service-account.name'] === "kwirth-sa" && f.data?.origin?.metadata?.namespace === obj.metadata.namespace)
                        return x.map(o => { return  { name:o.data.origin.metadata.name, namespace:o.data.origin.metadata.namespace}})
                    }
                }
            }


            // ClusterRole ****************************************************
            let spcClassClusterRole = spaces.get('classClusterRole')!
            setLeftItem(spcClassClusterRole, 'create', () => onObjectCreate('ClusterRole'))
            let spcClusterRole = spaces.get('ClusterRole')!
            setLeftItem(spcClusterRole,'details', onObjectDetails)
            setLeftItem(spcClusterRole,'edit', onObjectEdit)
            setLeftItem(spcClusterRole,'delete', onObjectDelete)

            // Role ****************************************************
            let spcClassRole = spaces.get('classRole')!
            setLeftItem(spcClassRole, 'create', () => onObjectCreate('Role'))
            let spcRole = spaces.get('Role')!
            setLeftItem(spcRole,'details', onObjectDetails)
            setLeftItem(spcRole,'edit', onObjectEdit)
            setLeftItem(spcRole,'delete', onObjectDelete)

            // ClusterRoleBinding ****************************************************
            let spcClassClusterRoleBinding = spaces.get('classClusterRoleBinding')!
            setLeftItem(spcClassClusterRoleBinding, 'create', () => onObjectCreate('ClusterRoleBinding'))
            let spcClusterRoleBinding = spaces.get('ClusterRoleBinding')!
            setLeftItem(spcClusterRoleBinding,'details', onObjectDetails)
            setLeftItem(spcClusterRoleBinding,'edit', onObjectEdit)
            setLeftItem(spcClusterRoleBinding,'delete', onObjectDelete)

            // RoleBinding ****************************************************
            let spcClassRoleBinding = spaces.get('classRoleBinding')!
            setLeftItem(spcClassRoleBinding, 'create', () => onObjectCreate('RoleBinding'))
            let spcRoleBinding = spaces.get('RoleBinding')!
            setLeftItem(spcRoleBinding,'details', onObjectDetails)
            setLeftItem(spcRoleBinding,'edit', onObjectEdit)
            setLeftItem(spcRoleBinding,'delete', onObjectDelete)

        // Custom ****************************************************

            // CustomResourceDefinition ****************************************************
            let spcClassCustomResourceDefinition = spaces.get('classCustomResourceDefinition')!
            setLeftItem(spcClassCustomResourceDefinition, 'create', () => onObjectCreate('CustomResourceDefinition'))
            let spcCustomResourceDefinition = spaces.get('CustomResourceDefinition')!
            setLeftItem(spcCustomResourceDefinition,'details', onObjectDetails)
            setLeftItem(spcCustomResourceDefinition,'edit', onObjectEdit)
            setLeftItem(spcCustomResourceDefinition,'delete', onObjectDelete)

            // crd instance ****************************************************
            let spcCrdInstance = spaces.get('crdInstance')!
            setLeftItem(spcCrdInstance, 'details', onObjectDetails)
            setLeftItem(spcCrdInstance, 'edit', onObjectEdit)
            setLeftItem(spcCrdInstance, 'delete', onObjectDelete)

            let spcCrdNamespacedInstance = spaces.get('crdNamespacedInstance')!
            setLeftItem(spcCrdNamespacedInstance, 'details', onObjectDetails)
            setLeftItem(spcCrdNamespacedInstance, 'edit', onObjectEdit)
            setLeftItem(spcCrdNamespacedInstance, 'delete', onObjectDelete)

}

export { rfmSetup, setLeftItem, setPropertyFunction }

