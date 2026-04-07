import React, { useEffect, useState } from 'react'
import { Box,  Card, CardContent, CardHeader, Collapse, Divider, IconButton, Stack, Tooltip, Typography } from '@mui/material'
import { IWorkspaceSummary } from '../model/IWorkspace'
import { ITabSummary } from '../model/ITabObject'
import { Delete, ExpandLess, ExpandMore, FactCheck, OpenInBrowser, Star } from '@mui/icons-material'
import { TChannelConstructor } from '../channels/IChannel'
import { Cluster } from '../model/Cluster'
import { GaugeComponent } from 'react-gauge-component'
import { addGetAuthorization } from '../tools/AuthorizationManagement'
import { getIconFromKind } from '../tools/Constants-React'
import { Area, AreaChart } from 'recharts'
import { EInstanceConfigView } from '@kwirthmagnify/kwirth-common'

// svg optimizer: https://jakearchibald.github.io/svgomg/ (optmizes size and removes namespaces)
// Open source icons: https://iconbuddy.com/
// transform svg to JSX https://svg2jsx.com/
// remove background https://www.iloveimg.com/remove-background

interface IHomepageProps {
    cluster:Cluster|undefined,
    clusters:Cluster[]
    frontChannels: Map<string, TChannelConstructor>
    lastTabs:ITabSummary[]
    favTabs:ITabSummary[]
    lastWorkspaces:IWorkspaceSummary[]
    favWorkspaces:IWorkspaceSummary[]
    onRestoreTabParameters: (tab:ITabSummary) => void
    onHomepageSelectTab: (tab:ITabSummary) => void
    onSelectWorkspace: (workspace:IWorkspaceSummary) => void
    onUpdateTabs: (last:ITabSummary[], fav:ITabSummary[]) => void
    onUpdateWorkspaces: (last:IWorkspaceSummary[], fav:IWorkspaceSummary[]) => void
    dataCpu: {value:number}[]
    dataMemory: {value:number}[]
    dataNetwork: {value:number}[]
}

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
    let homeChannels = props.cluster? props.clusters.find(c => c.name===props.cluster!.name)!.kwirthData?.channels.map(c => c.id).join(', ') : ''
    let kwirthVersion = props.cluster? props.clusters.find(c => c.name===props.cluster!.name)!.kwirthData?.version : 'n/a'
    let kwrithNamespace = props.cluster? props.clusters.find(c => c.name===props.cluster!.name)!.kwirthData?.namespace : 'n/a'
    let kwrithDeployment = props.cluster? props.clusters.find(c => c.name===props.cluster!.name)!.kwirthData?.deployment : 'n/a'
    let frontChannels:string = ((props.frontChannels.keys() as any).toArray()).join(', ')

    const handleCardToggle = () => {
        setCardExpanded((prev) => !prev)
    }

    useEffect(() => {
        const targetCluster = props.cluster || props.clusters.find(x => x.source);
        if (!targetCluster) return;

        const i = setInterval((c: Cluster) => {
            fetch(`${c.url}/metrics/usage/cluster`, addGetAuthorization(c.accessString))
                .then((result) => {
                    if (!result.ok) throw new Error("Error en respuesta de red")
                    return result.json()
                })
                .then((data) => {
                    setCpu(data.cpu);
                    setDataCpu(prev => [...prev, { value: data.cpu as number }])
                    props.dataCpu.push({ value: data.cpu as number })
                    
                    setMemory(data.memory);
                    setDataMemory(prev => [...prev, { value: data.memory as number}])
                    props.dataMemory.push({ value: data.memory as number})
                    
                    setTxmbps(data.txmbps)
                    setRxmbps(data.rxmbps)
                    setDataNetwork(prev => [...prev, { value: (data.txmbps + data.rxmbps) || 0}])
                    props.dataNetwork.push({ value: (data.txmbps + data.rxmbps) || 0 })
                })
                .catch((err) => {
                    console.error('Critical error receiving cluster metrics. Interval will be cancelled:', err)
                    clearInterval(i)
                });
        }, 3000, targetCluster)
        return () => clearInterval(i)
    }, [props.cluster, props.clusters]);
    
    const toFavTabs = (tab:ITabSummary) => {
        if (!props.favTabs.some(t => t.name === tab.name && t.channel === tab.channel)) {
            props.favTabs.push(tab)
            let i = props.lastTabs.findIndex(t => t.name !== tab.name || t.channel !== tab.channel)
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

    const drawTabCard = (tabList:ITabSummary[], listType:EListType) => {
        return <>
            <Card>
                <CardHeader title={`${listType=== EListType.LAST? 'Last':'Fav'} tabs`} sx={{borderBottom:1, borderColor:'divider'}}/>
                    <CardContent sx={{overflowY:'auto', overflowX:'hidden', minHeight:'50%', maxHeight:'50%' }}>
                    {
                        tabList.map(tab => {
                            let channelIcon = <Box sx={{minWidth:'24px'}}/>

                            const channelClass = props.frontChannels.get(tab.channel)
                            if (channelClass) channelIcon = new channelClass()!.getChannelIcon()

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

                            let disabled = (!props.clusters.find(c => c.name === tab.channelObject.clusterName)) && tab.channelObject.clusterName!=='$cluster'

                            return <Stack key={listType+tab.name+tab.channel} direction={'row'} alignItems={'center'} flex={1}>
                                <Tooltip title={tab.channel}>
                                    {channelIcon}
                                </Tooltip>
                                <Typography>&nbsp;</Typography>
                                <Tooltip title={`View: ${tab.channelObject.view}`}>
                                    {/* span required for showing tooltip on icon */}
                                    <span style={{ display: 'inline-flex' }}>  
                                        {viewIcon}
                                    </span>
                                </Tooltip>
                                <Typography>&nbsp;</Typography>
                                <Tooltip title={disabled? `Cannot access cluster '${tab.channelObject.clusterName}'`: `Workspace '${tab.name}' on cluster '${tab.channelObject.clusterName}'`}>
                                    <Typography>{name}</Typography>
                                </Tooltip>
                                <Typography flexGrow={1}/>
                                <Tooltip title={`Open this configuration on a new tab`}>
                                    <IconButton onClick={() => props.onHomepageSelectTab(tab)} disabled={disabled}>
                                        <OpenInBrowser/>
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title={`Restore these tab parameters to resource selector`}>
                                    <IconButton onClick={() => props.onRestoreTabParameters(tab)} disabled={disabled}>
                                        <FactCheck/>
                                    </IconButton>
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
                            <IconButton onClick={() => props.onSelectWorkspace(workspace)
}>
                                <OpenInBrowser/>
                            </IconButton>
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

    const drawRadial = (value:number, text:string) => {
        return (
            <Box width={'100%'} flex={'1'} flexDirection={'column'} alignContent={'center'}>
                <GaugeComponent 
                    type='radial'
                    labels={{
                        valueLabel:{ style: {fontSize: "30px", fill: "currentColor", textShadow: "none"} }
                    }}
                    arc={{
                        subArcs: [
                            { limit: 50, color: '#5BE12C', showTick: true },
                            { limit: 80, color: '#F5CD19', showTick: true },
                            { limit: 100, color: '#EA4228', showTick: true },
                        ]
                    }}
                    value={value}
                    pointer={{elastic: true}}
                />
                <Stack direction={'column'} alignItems={'center'}>
                    <Typography>{text}</Typography>
                </Stack>
            </Box>
        )
    }

    const drawSemicircle = (value:number, text:string, minValue:number, maxValue:number) => {
        return (
            <Box width={'100%'}>
                <GaugeComponent 
                    type='semicircle'
                    arc={{
                        colorArray: ['#5BE12C', '#F5CD19', '#EA4228'],
                    }}                
                    labels={{
                        valueLabel:{
                            style: {fontSize: "30px", fill: "currentColor", textShadow: "none" },
                            formatTextValue: (v) => v
                        },
                        tickLabels: {
                            type: 'inner',
                            defaultTickValueConfig: { formatTextValue: (v) => '' }
                        }
                    }}
                    pointer={{type: "arrow", elastic: true}}
                    value={value}
                />
                <Stack direction={'column'} alignItems={'center'}>
                    <Typography fontSize={12}>{text} Mbps</Typography>
                </Stack>
            </Box>
        )
    }

    const distributionIcon = (flavour:string|undefined) => {
        if (!flavour) return <></>
        
        let content = <></>
        switch (flavour) {
            case 'aks':
                content = <>{getIconFromKind('IconAks', 20)}&nbsp;Azure Kubernetes</>
                break
            case 'k3s':
                content = <>{getIconFromKind('IconK3s', 20)}&nbsp;Rancher K3</>
                break
            case 'k3d':
                content = <>{getIconFromKind('IconK3d', 20)}&nbsp;K3D</>
                break
            case 'eks':
                content = <>{getIconFromKind('IconEks', 20)}&nbsp;AWS Kubernetes</>
                break
            case 'ocp':
                content = <>{getIconFromKind('IconOcp', 20)}&nbsp;OpenShift</>
                break
            case 'gke':
                content = <>{getIconFromKind('IconGke', 20)}&nbsp;Google Kubernetes</>
                break
            case 'rk2e':
                content = <>{getIconFromKind('IconRk2e', 20)}&nbsp;Rancher Kubernetes</>
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
                    title={<>
                        {cardExpanded && <Typography variant="h6">Cluster details</Typography>}
                        {!cardExpanded && <Stack direction={'row'}>
                            <Typography><b>Cluster: </b>{props.cluster?.clusterInfo?.name}</Typography>
                            <Typography sx={{ml:'32px'}}><b>Nodes: </b>{props.cluster?.clusterInfo?.nodes?.length}</Typography>
                            <Typography sx={{ml:'32px'}}><b>Resources: </b>{props.cluster?.clusterInfo?.vcpu} vCPU / {((props.cluster?.clusterInfo?.memory||0)/1024/1024/1024).toFixed(2)} GB</Typography>

                            <Typography flexGrow={1}></Typography>

                            <Stack sx={{ml:'32px'}} direction={'row'} alignItems={'center'}>
                                {
                                    props.clusters && props.cluster && frontChannels.split(',').map ((c,ci) => {
                                        const channelClass = props.frontChannels.get(c.trim())
                                        if (channelClass) {
                                            let icon = new channelClass()!.getChannelIcon()
                                            const isChannelActive = props.clusters.find(c => c.name === props.cluster!.name)!.kwirthData!.channels.some(ch => ch.id === c.trim())
                                            const colorToken = isChannelActive ? 'text.primary' : 'text.disabled';
                                            let newElement = React.cloneElement(icon, { fontSize: 'small', sx:{ color:colorToken } })
                                            return <Tooltip key={ci} title={c.trim()}>{newElement}</Tooltip>
                                        }
                                        return <></>
                                    })
                                }
                            </Stack>

                            <Typography flexGrow={1}></Typography>

                            <Tooltip title={`${(cpu||0).toFixed(2)}%`}>
                                <Stack direction={'column'} alignItems={'center'}>
                                    <Typography fontSize={8} mb={-1}>CPU</Typography>
                                    <AreaChart width={120} height={20} data={dataCpu} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                                        <Area type="monotone" dataKey="value" stroke="#8884d8" strokeWidth={2} dot={false} fill={'#bbbbdd'}/>
                                    </AreaChart>
                                </Stack>
                            </Tooltip>
                            <Tooltip title={`${(memory||0).toFixed()}GB / ${((props.cluster?.clusterInfo?.memory||0)/1024/1024/1024).toFixed()}GB`}>
                                <Stack direction={'column'} alignItems={'center'}>
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
                        </Stack>}
                    </>}
                    action={
                        <IconButton onClick={handleCardToggle} aria-label="expandir/colapsar">
                            {cardExpanded ? <ExpandLess /> : <ExpandMore />}
                        </IconButton>
                    }
                />
                <Collapse in={cardExpanded} timeout="auto" unmountOnExit>
                    <CardContent>
                        <Stack direction={'row'} spacing={2} sx={{mt:'4px'}}>
                            <Stack width={'30%'}> 
                                <Typography fontSize={20}><b>Context</b></Typography>
                                <Typography><b>Home cluster: </b>{homeCluster} [{clusterUrl}]</Typography>
                                <Typography><b>Selected cluster: </b>{props.cluster?.clusterInfo?.name}</Typography>
                                <Typography><b>Cluster channels: </b>{homeChannels}</Typography>
                                <Typography><b>Front channels: </b>{frontChannels}</Typography>
                            </Stack>
                            <Divider orientation='vertical' flexItem/>
                            <Stack width={'20%'}>
                                <Typography fontSize={20}><b>Kwirth Info</b></Typography>
                                <Typography><b>Kwirth version: </b>{kwirthVersion}</Typography>
                                <Typography><b>Namespace: </b>{kwrithNamespace}</Typography>
                                <Typography><b>Deployment: </b>{kwrithDeployment}</Typography>
                                <Typography><b>Clusters: </b>{props.clusters.map (c => c.name).join(', ')}</Typography>
                                <Typography><b>Type: </b>{props.cluster?.clusterInfo?.type}</Typography>
                            </Stack>
                            <Divider orientation='vertical' flexItem/>
                            <Stack width={'20%'}>
                                <Typography fontSize={20}><b>Cluster Info</b></Typography>
                                <Typography><b>Name: </b>{props.cluster?.clusterInfo?.name}</Typography>
                                <Stack direction={'row'} alignItems={'center'}>
                                    <Typography><b>Flavour: &nbsp;</b></Typography>
                                    {distributionIcon(props.cluster?.clusterInfo?.flavour)}
                                </Stack>
                                <Typography><b>Version: </b>{props.cluster?.clusterInfo?.version}</Typography>
                                <Typography><b>Platform: </b>{props.cluster?.clusterInfo?.platform}</Typography>
                                <Typography><b>Nodes: </b>{props.cluster?.clusterInfo?.nodes?.length}</Typography>
                                <Typography><b>Total vCPU: </b>{props.cluster?.clusterInfo?.vcpu}</Typography>
                                <Typography><b>Total Memory: </b>{((props.cluster?.clusterInfo?.memory||0)/1024/1024/1024).toFixed(2)}GB</Typography>
                            </Stack>
                            <Divider orientation='vertical' flexItem/>
                            <Stack width={'10%'} direction={'column'} alignItems={'center'}>
                                {drawRadial(cpu,'CPU')}
                            </Stack>
                            <Stack width={'10%'} direction={'column'} alignItems={'center'}>
                                {drawRadial(memory,'Memory')}
                            </Stack>
                            <Stack width={'10%'} direction={'column'} alignItems={'center'}>
                                {drawSemicircle(txmbps,'Tx', 0, 10)}
                                {drawSemicircle(rxmbps,'Rx', 0, 10)}
                            </Stack>
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
