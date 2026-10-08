import React, { useEffect, useState } from 'react'
import { Box, Card, CardContent, CardHeader, Collapse, Divider, Fade, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { IWorkspaceSummary } from '../../model/IWorkspace'
import { ITabSummary } from '../../model/ITabObject'
import { Delete, ExpandLess, ExpandMore, FactCheck, HelpOutline, Launch } from '@kwirthmagnify/kwirth-common-front/icons'
import { Star } from '../../icons'

import { IHomepageProps } from '@kwirthmagnify/kwirth-common-front'
import { EClusterType } from '@kwirthmagnify/kwirth-common'
import { Cluster } from '../../model/Cluster'
import { addGetAuthorization } from '../../tools/AuthorizationManagement'
import { getIconFromKind } from '../../tools/Constants-React'
import { clusterColor } from '../../tools/clusterColor'
import { Area, AreaChart } from 'recharts'
import { EClusterFlavour, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { getChannelIconSafe } from '../../tools/ChannelTools'
import { MiniGauge } from '@kwirthmagnify/kwirth-common-front'

// svg optimizer: https://jakearchibald.github.io/svgomg/ (optmizes size and removes namespaces)
// Open source icons: https://iconbuddy.com/
// transform svg to JSX https://svg2jsx.com/
// remove background https://www.iloveimg.com/remove-background

enum EListType {
    FAV='fav',
    LAST='last'
}


const Homepage: React.FC<IHomepageProps> = (props:IHomepageProps) => {
    const [cpu, setCpu] = useState(0)
    const [memory, setMemory] = useState(0)
    const [txmbps, setTxmbps] = useState(0)
    const [rxmbps, setRxmbps] = useState(0)
    const [cardExpanded, setCardExpanded] = useState(false)
    const [dataCpu, setDataCpu]  = useState<any[]>(props.dataCpu||[])
    const [dataMemory, setDataMemory]  = useState<any[]>(props.dataMemory||[])
    const [dataNetwork, setDataNetwork]  = useState<any[]>(props.dataNetwork||[])

    let homeCluster = props.cluster? props.clusters.find(c => c.name===props.cluster!.name)!.name : 'n/a'
    let clusterUrl = props.cluster? props.clusters.find(c => c.name===props.cluster!.name)!.url : 'n/a'
    let homeChannels = props.cluster? props.clusters.find(c => c.name===props.cluster!.name)!.kwirthData?.channels.map((c: any) => c.id).sort().join(', ') : ''
    let kwirthVersion = props.cluster? props.clusters.find(c => c.name===props.cluster!.name)!.kwirthData?.version : 'n/a'
    let kwrithNamespace = props.cluster? props.clusters.find(c => c.name===props.cluster!.name)!.kwirthData?.namespace : 'n/a'
    let kwrithDeployment = props.cluster? props.clusters.find(c => c.name===props.cluster!.name)!.kwirthData?.deployment : 'n/a'
    let frontChannels:string = ((props.frontChannels.keys() as any).toArray()).sort().join(', ')
    /*
        Without a cluster there is no metrics provider, so nothing ever feeds these states and they stay at
        their initial 0. Painting a gauge at 0.0% is worse than painting nothing: it reads as "the cluster is
        idle" when the truth is "there is no cluster to measure". They are hidden instead.

        The same goes for everything else on this card that comes from the cluster -- nodes, flavour,
        version, platform, vCPU, memory: without one they render as `undefined` and `0.00GB`, which is not
        information, it is noise dressed as information.

        It is read from THE SELECTED cluster, not from the installation: add a Kubernetes cluster to the
        list and selecting it brings all of this back, because it is that cluster that has something to say.
    */
    const hasCluster = (props.cluster || props.clusters.find(x => x.home))?.kwirthData?.clusterType !== EClusterType.NONE

    const handleCardToggle = () => {
        setCardExpanded((prev) => !prev)
    }

    useEffect(() => {
        const targetCluster = props.cluster || props.clusters.find(x => x.home);
        if (!targetCluster) return;
        // No cluster, no metrics provider, nothing to poll: on Kwirth outside Kubernetes this interval was
        // firing a request that can only 404, every few seconds, for as long as the home page stayed open.
        if (targetCluster.kwirthData?.clusterType === EClusterType.NONE) return;

        const i = setInterval((c: Cluster) => {
            fetch(`${c.url}/provider/metrics/usage/cluster`, addGetAuthorization(c.accessString))
                .then((result) => {
                    if (!result.ok) throw new Error('Error getting cluster usage')
                    return result.json()
                })
                .then((data) => {
                    setCpu(data.cpuUsage)
                    setDataCpu(prev => [...prev, { value: data.cpuUsage as number }])
                    props.dataCpu.push({ value: data.cpuUsage as number })
                    
                    setMemory(data.memoryUsage)
                    setDataMemory(prev => [...prev, { value: data.memoryUsage as number}])
                    props.dataMemory.push({ value: data.memoryUsage as number})
                    
                    setTxmbps(data.txmbps)
                    setRxmbps(data.rxmbps)
                    setDataNetwork(prev => [...prev, { value: (data.txmbps + data.rxmbps) || 0}])
                    props.dataNetwork.push({ value: (data.txmbps + data.rxmbps) || 0 })
                })
                .catch((err) => {
                    console.warn('Error receiving cluster metrics, will retry:', err)
                });
        }, 3000, targetCluster)
        return () => clearInterval(i)
    }, [props.cluster, props.clusters]);
    
    const toFavTabs = (tab:ITabSummary) => {
        if (!props.favTabs.some(t => t.name === tab.name && t.channel === tab.channel)) {
            props.favTabs.push(tab)
            let i = props.lastTabs.findIndex(t => t.name === tab.name && t.channel === tab.channel)
            props.lastTabs.splice(i,1)
            props.onUpdateTabs([...props.lastTabs], [...props.favTabs])
        }
    }

    const toFavWorkspaces = (workspace:IWorkspaceSummary) => {
        if (!props.favWorkspaces.some(b => b.name === workspace.name)) {
            // from last to fav
            props.favWorkspaces.push(workspace)
            let i = props.lastWorkspaces.findIndex(b => b.name === workspace.name)
            props.lastWorkspaces.splice(i,1)
            props.onUpdateWorkspaces([...props.lastWorkspaces], [...props.favWorkspaces])
        }
    }

    const deleteFromTabsList = (list:ITabSummary[], tab:ITabSummary) => {
        let i = list.findIndex(t => t.name === tab.name  && t.channel === tab.channel)
        if (i>=0) {
            list.splice(i,1)
            props.onUpdateTabs([...props.lastTabs], [...props.favTabs])
        }
    }

    const deleteFromWorkspacesList = (list:IWorkspaceSummary[], workspace:IWorkspaceSummary) => {
        let i = list.findIndex(w => w.name === workspace.name)
        if (i>=0) {
            list.splice(i,1)
            props.onUpdateWorkspaces([...props.lastWorkspaces], [...props.favWorkspaces])
        }
    }

    /*
        A FIXED-width slot for each icon in the row.

        The channel's one is painted by each plugin through getChannelIcon(), so one brings a drop,
        another a cog and another a pin, and each takes up whatever it takes up. Without a fixed width,
        the tab's name starts at a different x on every line and the list comes out misaligned.

        24 px because that is a MUI icon's default size; the view's one is asked for at 20 and centred
        inside.
    */
    const iconSlotSx = {
        width: 24,
        minWidth: 24,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0
    }

    const drawTabCard = (tabList:ITabSummary[], listType:EListType) => {
        return <>
            <Card>
                <CardHeader title={`${listType=== EListType.LAST? 'Last':'Fav'} tabs`} sx={{borderBottom:1, borderColor:'divider'}}/>
                    <CardContent sx={{overflowY:'auto', overflowX:'hidden', minHeight:'50%', maxHeight:'50%' }}>
                    {
                        tabList.map(tab => {
                            const channelClass = props.frontChannels.get(tab.channel)
                            const channelAvailable = !!channelClass
                            const channelIcon: JSX.Element = getChannelIconSafe(channelClass)

                            let viewIcon = <></>
                            switch (tab.channelObject.view) {
                                case EInstanceConfigView.NAMESPACE:
                                    viewIcon = getIconFromKind('Namespace', 20)
                                    break
                                case EInstanceConfigView.GROUP:
                                    viewIcon = getIconFromKind('Controller', 20)
                                    break
                                case EInstanceConfigView.POD:
                                    viewIcon = getIconFromKind('Pod', 20)
                                    break
                                case EInstanceConfigView.CONTAINER:
                                    viewIcon = getIconFromKind('Container', 20)
                                    break
                                default:
                                    viewIcon = getIconFromKind('', 20)
                                    break
                            }

                            let name = tab.name
                            if (name.length>50) name = name.substring(0,25) + '...' + name.substring(name.length-25)

                            let disabled = !channelAvailable || ((!props.clusters.find(c => c.name === tab.channelObject.clusterName)) && tab.channelObject.clusterName!=='$cluster')

                            return <Stack key={listType+tab.name+tab.channel} direction={'row'} alignItems={'center'} flex={1}>
                                <Tooltip title={channelAvailable ? tab.channel : `Channel '${tab.channel}' is not available — plugin may not be installed`}>
                                    <Box sx={iconSlotSx}>{channelIcon}</Box>
                                </Tooltip>
                                <Typography>&nbsp;</Typography>
                                <Tooltip title={`View: ${tab.channelObject.view}`}>
                                    <Box sx={iconSlotSx}>{viewIcon}</Box>
                                </Tooltip>
                                <Typography>&nbsp;</Typography>
                                <Tooltip title={disabled? `Cannot access cluster '${tab.channelObject.clusterName}'`: `'${tab.name}' on cluster '${tab.channelObject.clusterName}'`}>
                                    <Typography>{name}</Typography>
                                </Tooltip>
                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: clusterColor(tab.channelObject.clusterName).dot, flexShrink: 0, mx: 0.5 }} />
                                <Typography flexGrow={1}/>
                                <Tooltip title={`Open this configuration on a new tab`}>
                                    <span>
                                        <IconButton onClick={() => props.onHomepageSelectTab(tab)} disabled={disabled}>
                                            <Launch/>
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                <Tooltip title={`Restore these tab parameters to resource selector`}>
                                    <span>
                                        <IconButton onClick={() => props.onRestoreTabParameters(tab)} disabled={disabled}>
                                            <FactCheck/>
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                
                                { listType !== EListType.FAV && 
                                    <IconButton onClick={() => toFavTabs(tab)} disabled={disabled}>
                                        <Star/>
                                    </IconButton>
                                }
                                <IconButton onClick={() => deleteFromTabsList(tabList, tab)}>
                                    <Delete/>
                                </IconButton>
                            </Stack>
                        })
                    }
                </CardContent>
            </Card>
        </>
    }

    const drawWorkspaceCard = (workspaceList:IWorkspaceSummary[], listType:EListType) => {
        return <>
            <Card>
                <CardHeader title={`${listType === EListType.LAST? 'Last':'Fav'} workspaces`} sx={{borderBottom:1, borderColor:'divider'}}/>
                <CardContent sx={{overflowY:'auto', overflowX:'hidden', maxHeight:'150px'}}>
                    { workspaceList.map (workspace => {
                        return <Stack key={listType+workspace.name} direction={'row'} spacing={1} alignItems={'baseline'}>
                            <Typography>{workspace.name}</Typography>
                            <Typography fontSize={'12px'}>{workspace.description}</Typography>
                            <Typography flexGrow={1}/>
                            <Tooltip title='Open workspace and start all tabs'>
                                <IconButton onClick={() => props.onSelectWorkspace(workspace)}>
                                    <Launch/>
                                </IconButton>
                            </Tooltip>
                            <Tooltip title='Open workspace without starting tabs'>
                                <IconButton onClick={() => props.onRestoreWorkspace(workspace)}>
                                    <FactCheck/>
                                </IconButton>
                            </Tooltip>
                            { listType !== EListType.FAV && 
                                <IconButton onClick={() => toFavWorkspaces(workspace)}>
                                    <Star/>
                                </IconButton>
                            }
                            <IconButton onClick={() => deleteFromWorkspacesList(workspaceList, workspace)}>
                                <Delete/>
                            </IconButton>
                        </Stack>
                    })}
                </CardContent>
            </Card>
        </>
    }

    const distributionIcon = (flavour:EClusterFlavour|undefined) => {
        if (!flavour) return <></>

        let content = <></>
        switch (flavour) {
            case EClusterFlavour.AKS:
                content = <>{getIconFromKind('IconAks', 20)}&nbsp;Azure Kubernetes</>
                break
            case EClusterFlavour.K3S:
                content = <>{getIconFromKind('IconK3s', 20)}&nbsp;SUSE K3s</>
                break
            case EClusterFlavour.K3D:
                content = <Stack direction={'row'} alignItems={'center'}>{getIconFromKind('IconK3d', 24)}&nbsp;K3D</Stack>
                break
            case EClusterFlavour.EKS:
                content = <>{getIconFromKind('IconEks', 20)}&nbsp;AWS Kubernetes</>
                break
            case EClusterFlavour.OCP:
                content = <>{getIconFromKind('IconOcp', 20)}&nbsp;OpenShift</>
                break
            case EClusterFlavour.HARVESTER:
                content = <>{getIconFromKind('IconHarvester', 20)}&nbsp;SUSE Harvester</>
                break
            case EClusterFlavour.GKE:
                content = <>{getIconFromKind('IconGke', 20)}&nbsp;Google Kubernetes</>
                break
            /*
                This case used to read 'rk2e' -- a typo of 'rke2' -- and never ran once, because nothing
                produced that value. Icon, label and all, dead since the day it was written. Matching on
                the enum is what makes that impossible to write again.
            */
            case EClusterFlavour.RKE2:
                content = <>{getIconFromKind('IconRk2e', 20)}&nbsp;SUSE RKE2</>
                break
            default:
                content = <>{getIconFromKind('IconK8s', 20)}&nbsp;Kubernetes</>
                break
        }
        return <Stack flexDirection={'row'} fontSize={12} alignItems={'center'}>{content}</Stack>
    }
    
    return (
        <Stack sx={{ display:'flex', flexDirection:'column', m:3}} spacing={2}>
            <Card sx={{width:'100%', alignSelf:'center', transition: 'all 0.3s ease'}}>
                <CardHeader sx={{borderBottom:(cardExpanded?1:0), borderColor:'divider'}}
                    title={<Fade key={cardExpanded ? 'expanded' : 'collapsed'} in={true} timeout={350}>
                        <Box>
                        {cardExpanded && <Typography variant="h6">Cluster details</Typography>}
                        {!cardExpanded && <Stack direction={'row'}>
                            <Typography><b>Cluster: </b>{props.cluster?.clusterInfo?.name}</Typography>
                            {hasCluster && <Typography sx={{ml:'32px'}}><b>Nodes: </b>{props.cluster?.clusterInfo?.nodes?.length}</Typography>}
                            {hasCluster && <Typography sx={{ml:'32px'}}><b>Resources: </b>{props.cluster?.clusterInfo?.vcpu} vCPU / {((props.cluster?.clusterInfo?.memory||0)/1024/1024/1024).toFixed(2)} GB</Typography>}

                            <Typography flexGrow={1}></Typography>

                            <Stack sx={{ml:'32px'}} direction={'row'} alignItems={'center'}>
                                {
                                    props.clusters && props.cluster && frontChannels.split(',').map ((c,ci) => {
                                        const channelClass = props.frontChannels.get(c.trim())
                                        if (channelClass) {
                                            const icon = getChannelIconSafe(channelClass)
                                            const isChannelActive = props.clusters.find(c => c.name === props.cluster!.name)!.kwirthData!.channels.some((ch: any) => ch.id === c.trim())
                                            const colorToken = isChannelActive ? 'text.primary' : 'text.disabled';
                                            let newElement = React.cloneElement(icon, { fontSize: 'small', sx:{ color:colorToken } })
                                            /*
                                                The Box is not decoration: Tooltip hands a ref to its child, and these
                                                channel icons are plain function components that cannot hold one --
                                                which filled the console with "Function components cannot be given
                                                refs". Same fix already used above for the channel and view icons.
                                                No width here on purpose: iconSlotSx would force 24px on icons that
                                                render at 'small', changing the spacing of this row.
                                            */
                                            return <Tooltip key={ci} title={c.trim()}><Box sx={{ display:'flex', alignItems:'center' }}>{newElement}</Box></Tooltip>
                                        }
                                        return <></>
                                    })
                                }
                            </Stack>

                            <Typography flexGrow={1}></Typography>

                            {hasCluster && <>
                            <Tooltip title={`${(cpu||0).toFixed(2)}%`}>
                                <Stack direction={'column'} alignItems={'center'} mr={'2px'}>
                                    <Typography fontSize={8} mb={-1}>CPU</Typography>
                                    <AreaChart width={120} height={20} data={dataCpu} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                        <Area type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} dot={false} fill={'#bbbbdd'}/>
                                    </AreaChart>
                                </Stack>
                            </Tooltip>
                            {/* <Tooltip title={`${(memory||0).toFixed()}GB / ${((props.cluster?.clusterInfo?.memory||0)/1024/1024/1024).toFixed()}GB`}> */}
                            <Tooltip title={`${(memory||0).toFixed(2)}%`}>
                                <Stack direction={'column'} alignItems={'center'} mr={'2px'}>
                                    <Typography fontSize={8} mb={-1}>Mem</Typography>
                                    <AreaChart width={120} height={20} data={dataMemory} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                        <Area type="monotone" dataKey="value" stroke="#d88488" strokeWidth={2} dot={false} fill={'#ddbbbb'}/>
                                    </AreaChart>
                                </Stack>
                            </Tooltip>
                            <Tooltip title={`${(txmbps||0).toFixed(2)}Mbps / ${(rxmbps||0).toFixed(2)}Mbps`}>
                                <Stack direction={'column'} alignItems={'center'}>
                                    <Typography fontSize={8} mb={-1}>Net</Typography>
                                    <AreaChart width={120} height={20} data={dataNetwork} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                        <Area type="monotone" dataKey="value" stroke="#88d884" strokeWidth={2} dot={false} fill={'#bbddbb'}/>
                                    </AreaChart>
                                </Stack>
                            </Tooltip>
                            </>}
                        </Stack>}
                        </Box>
                    </Fade>}
                    action={
                        <IconButton onClick={handleCardToggle} aria-label="expandir/colapsar">
                            {cardExpanded ? <ExpandLess /> : <ExpandMore />}
                        </IconButton>
                    }
                />
                <Collapse in={cardExpanded} timeout="auto" unmountOnExit>
                    <CardContent>
                        <Stack direction={'row'} spacing={2} sx={{mt:'4px'}}>
                            <Stack width={'25%'}>
                                <Typography fontSize={20}><b>Context</b></Typography>
                                <Typography><b>Home cluster: </b>{homeCluster} [{clusterUrl}]</Typography>
                                <Typography><b>Selected cluster: </b>{props.cluster?.clusterInfo?.name}</Typography>
                                <Typography><b>Cluster channels: </b>{homeChannels}</Typography>
                                <Typography><b>Front channels: </b>{frontChannels}</Typography>
                            </Stack>
                            <Divider orientation='vertical' flexItem/>
                            <Stack width={'25%'}>
                                <Typography fontSize={20}><b>Kwirth Info</b></Typography>
                                <Typography><b>Kwirth version: </b>{kwirthVersion}</Typography>
                                <Typography><b>Namespace: </b>{kwrithNamespace}</Typography>
                                <Typography><b>Deployment: </b>{kwrithDeployment || 'N/A'}</Typography>
                                <Typography><b>Clusters: </b>{props.clusters.map (c => c.name).join(', ')}</Typography>
                                <Typography><b>Cluster type: </b>{props.cluster?.clusterInfo?.type}</Typography>
                            </Stack>
                            {hasCluster && <>
                            <Divider orientation='vertical' flexItem/>
                            <Stack width={'25%'}>
                                <Typography fontSize={20}><b>Cluster Info</b></Typography>
                                <Typography><b>Name: </b>{props.cluster?.clusterInfo?.name}</Typography>
                                <Stack direction={'row'} alignItems={'center'}>
                                    <Typography><b>Flavour: &nbsp;</b></Typography>
                                    {distributionIcon(props.cluster?.clusterInfo?.flavour)}
                                </Stack>
                                {/* Only shown when there IS a Rancher: a cluster without one reads exactly as before. */}
                                {props.cluster?.clusterInfo?.rancherManaged &&
                                    <Typography><b>Managed by: </b>Rancher ({props.cluster?.clusterInfo?.rancherRole})</Typography>
                                }
                                <Typography><b>Version: </b>{props.cluster?.clusterInfo?.version}</Typography>
                                <Typography><b>Platform: </b>{props.cluster?.clusterInfo?.platform}</Typography>
                                <Typography><b>Nodes: </b>{props.cluster?.clusterInfo?.nodes?.length}</Typography>
                                <Typography><b>Total vCPU: </b>{props.cluster?.clusterInfo?.vcpu}</Typography>
                                <Typography><b>Total Memory: </b>{((props.cluster?.clusterInfo?.memory||0)/1024/1024/1024).toFixed(2)}GB</Typography>
                            </Stack>
                            </>}
                            {hasCluster && <>
                            <Divider orientation='vertical' flexItem/>
                            <Stack width={'25%'} direction={'row'} alignItems={'center'}>
                                <MiniGauge value={cpu} max={100} label='CPU' format={v => `${v.toFixed(1)}%`} />
                                <MiniGauge value={memory} max={100} label='Mem' format={v => `${v.toFixed(1)}%`} />
                                <MiniGauge value={txmbps} max={10} label='Tx Mbps' />
                                <MiniGauge value={rxmbps} max={10} label='Rx Mbps' />
                            </Stack>
                            </>}
                        </Stack>
                    </CardContent>

                </Collapse>
                
            </Card>

            <Stack direction={'column'} spacing={2} width={'100%'} height={'100%'}>

                <Stack direction={'row'} spacing={2} sx={{width:'100%', height:'100%'}}>
                    <Stack direction={'column'} width='100%' spacing={2} height='100%'>
                        {drawTabCard(props.lastTabs, EListType.LAST)}
                        {drawTabCard(props.favTabs, EListType.FAV)}
                    </Stack>
                    <Stack direction={'column'} width='100%' spacing={2} height='100%'>
                        {drawWorkspaceCard(props.lastWorkspaces, EListType.LAST)}
                        {drawWorkspaceCard(props.favWorkspaces, EListType.FAV)}
                    </Stack>
                </Stack>

            </Stack>
        </Stack>
    )
}

export { Homepage }
