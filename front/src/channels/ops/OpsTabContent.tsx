import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box, Button, Card, CardContent, CardHeader, IconButton, ListItem, ListItemButton, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { IOpsData, IScopedObject } from './OpsData'
import { IInstanceConfig, EInstanceMessageAction, EInstanceMessageChannel, EInstanceMessageFlow, EInstanceMessageType, IOpsMessage, EMetricsConfigMode, EOpsCommand, EInstanceConfigObject, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { IContentProps } from '../IChannel'
import { ESwitchKey, IOpsConfig } from './OpsConfig'
import { v4 as uuid } from 'uuid'
import { MsgBoxButtons, MsgBoxOk, MsgBoxYesNo } from '../../tools/MsgBox'
import { Delete, Home, MoreVert, RestartAlt, Terminal } from '@mui/icons-material'
import { defaultStyles, JsonView } from 'react-json-view-lite'
// @ts-ignore
import 'react-json-view-lite/dist/index.css';
import { MenuObject, EMenuObjectOption } from './MenuObject'
import { IResourceSelected } from '../../components/ResourceSelector'
import { ILogConfig, ILogInstanceConfig, ELogSortOrder } from '../log/LogConfig'
import { IMetricsConfig, IMetricsInstanceConfig } from '../metrics/MetricsConfig'
import { EChartType } from '../metrics/MenuChart'
import { SelectTerminal } from './Terminal/SelectTerminal'
import { TerminalInstance } from './Terminal/TerminalInstance'

const OpsTabContent: React.FC<IContentProps> = (props:IContentProps) => {
    let opsData:IOpsData = props.channelObject.data
    let opsConfig:IOpsConfig = props.channelObject.config

    const opsBoxRef = useRef<HTMLDivElement | null>(null)
    const [opsBoxHeight, setOpsBoxHeight] = useState(0)

    const [showSelector, setShowSelector] = useState(false)
    const [selectedScopedObject, setSelectedScopedObject] = useState<IScopedObject|null>(null)
    const [anchorMenuChart, setAnchorMenuChart] = useState<null | HTMLElement>(null)
    const [selectedTerminal, setSelectedTerminal] = useState<string | undefined>(undefined)
    const [msgBox, setMsgBox] = useState(<></>)
    const [refresh,setRefresh] = useState(0)
    const [filter, setFilter] = useState<string>('')

    enum LaunchActionEnum {
        INFO,
        TERMINAL,
        RESTART
    }
    
    useLayoutEffect(() => {
        const observer = new ResizeObserver(() => {
            if (!opsBoxRef.current) return
            const { top } = opsBoxRef.current.getBoundingClientRect()
            let a = window.innerHeight - top
            setOpsBoxHeight(a)
        })
        observer.observe(document.body)

        return () => observer.disconnect()
    }, [opsBoxRef.current])

    const closeTerminal = (_id:string) => {
        setSelectedTerminal(undefined)
        opsData.selectedTerminal = undefined
        setRefresh(Math.random())
    }

    const onAsyncData = (data:any) => {
        switch(data.event) {
            case 'describe': 
                let content = (
                    <Box sx={{width: '600px', height: '400px', overflow: 'auto'}}>
                        <JsonView data={data.data} style={defaultStyles}/>
                    </Box>
                )
                setMsgBox(MsgBoxOk('Object info', content, setMsgBox))
            break
        }
    }

    useEffect(() => {
        if (!opsData.onDescribeResponse) opsData.onDescribeResponse = onAsyncData
        window.addEventListener('keydown', onKeyDown)

        if (opsData.selectedTerminal) {
            setSelectedTerminal(opsData.selectedTerminal)
        }

        if (!opsData.terminalManager.onClose) opsData.terminalManager.onClose = closeTerminal

        return () => {
            window.removeEventListener('keydown', onKeyDown)
            setSelectedTerminal(undefined)
        }
    }, [])
    
    const onKeyDown = (event:any) => {
        console.log('key', event.key)
        let key = event.key
        if (key.startsWith('F') && key.length>1) {
            switch(key) {
                case 'F12':
                    setSelectedTerminal(undefined)
                    opsData.selectedTerminal = undefined
                    break
                case 'F11':
                    if (opsData.terminalManager.terminals.size===0)
                        setMsgBox(MsgBoxOk('Terminal','You have no terminal consoles open.', setMsgBox))
                    else {
                        setShowSelector(true)
                        event.stopPropagation()
                        event.preventDefault()
                    }
                    break
                default:
                    let knum = +key.substring(1)
                    let manterm = Array.from(opsData.terminalManager.terminals.entries()).find(tm => tm[1].index === knum)
                    if (manterm) {
                        setSelectedTerminal(manterm[0])
                        opsData.selectedTerminal = manterm[0]
                    }
                    break
            }
            event.preventDefault()
            event.stopPropagation()
        }
    }

    const onSelectNewTerm = (id?:string) =>  {
        setShowSelector(false)
        if (id) {
            opsData.selectedTerminal = id
            setSelectedTerminal(id)
        }
    }

    const formatSelector = () => {
        return <SelectTerminal onSelect={onSelectNewTerm} current={selectedTerminal!} opsData={opsData} />
    }

    const assignIndex = (key:string) => {
        for (let i=1;i<11;i++) {
            let exist = Array.from(opsData.terminalManager.terminals.values()).some(t => t.index === i)
            if (!exist) {
                return i
            }
        }
        return 0
    }

    let newManagedTerm =  Array.from(opsData.terminalManager.terminals.keys()).find(tm => !opsData.terminalManager.terminals.get(tm)?.started)
    if (newManagedTerm) {
        setSelectedTerminal(newManagedTerm)
        opsData.selectedTerminal = newManagedTerm
        let managedTerm = opsData.terminalManager.terminals.get(newManagedTerm)!
        managedTerm.index = assignIndex(newManagedTerm)
        managedTerm.term.attachCustomKeyEventHandler((event) => {
            if (opsConfig.accessKey !== ESwitchKey.DISABLED && event.key.startsWith('F') && event.key.length>1) {
                if (opsConfig.accessKey === ESwitchKey.NONE && !event.altKey && !event.ctrlKey && !event.shiftKey) return false
                if (opsConfig.accessKey === ESwitchKey.ALT && event.altKey && !event.ctrlKey && !event.shiftKey) return false
                if (opsConfig.accessKey === ESwitchKey.CTRL && !event.altKey && event.ctrlKey && !event.shiftKey) {
                    return false
                }
                if (opsConfig.accessKey === ESwitchKey.SHIFT && !event.altKey && !event.ctrlKey && event.shiftKey) return false
            }
            return true
        })
        managedTerm.started = true
    }

    const launch = (type:LaunchActionEnum, so:IScopedObject) => {
        switch(type) {
            case LaunchActionEnum.TERMINAL:
                let instanceConfig:IInstanceConfig = {
                    flow: EInstanceMessageFlow.REQUEST,
                    action: EInstanceMessageAction.WEBSOCKET,
                    channel: EInstanceMessageChannel.OPS,
                    type: EInstanceMessageType.DATA,
                    accessKey: props.channelObject.accessString!,
                    instance: props.channelObject.instanceId,
                    namespace: so.namespace,
                    group: '',
                    pod: so.pod,
                    //container: so.pod+'+'+so.container,
                    container: so.container,
                    objects: EInstanceConfigObject.PODS,
                    scope: '',
                    view: EInstanceConfigView.NONE
                }
                opsData.websocketRequest = { namespace:so.namespace, pod:so.pod, container:so.container }
                if (props.channelObject.webSocket) 
                    props.channelObject.webSocket.send(JSON.stringify( instanceConfig ))
                else
                    console.log('No webSocket for terminal trying to launch')
                break
            case LaunchActionEnum.RESTART:
                let opsMessage:IOpsMessage = {
                    flow: EInstanceMessageFlow.REQUEST,
                    action: EInstanceMessageAction.COMMAND,
                    channel: EInstanceMessageChannel.OPS,
                    type: EInstanceMessageType.DATA,
                    accessKey: props.channelObject.accessString!,
                    instance: props.channelObject.instanceId,
                    id: uuid(),
                    command: EOpsCommand.RESTART,
                    namespace: so.namespace,
                    group: '',
                    pod: so.pod,
                    container: so.container,
                    params: [],
                    msgtype: 'opsmessage'
                }
                if (props.channelObject.webSocket)
                    props.channelObject.webSocket.send(JSON.stringify( opsMessage ))
                else
                    console.log('No webSocket for restart')
                break
        }
    }

    const menuObjectOptionSelected = (opt:EMenuObjectOption, so:IScopedObject) => {
        setAnchorMenuChart(null)
        switch (opt) {
            case EMenuObjectOption.DESCRIBE:
                let opsMessageInfo:IOpsMessage = {
                    flow: EInstanceMessageFlow.REQUEST,
                    action: EInstanceMessageAction.COMMAND,
                    channel: EInstanceMessageChannel.OPS,
                    type: EInstanceMessageType.DATA,
                    accessKey: props.channelObject.accessString!,
                    instance: props.channelObject.instanceId,
                    id: uuid(),
                    command: EOpsCommand.DESCRIBE,
                    namespace: so.namespace,
                    group: '',
                    pod: so.pod,
                    container: so.container,
                    params: [],
                    msgtype: 'opsmessage'
                }
                if (props.channelObject.webSocket) props.channelObject.webSocket.send(JSON.stringify( opsMessageInfo ))
                break

            case EMenuObjectOption.RESTARTCONTAINER:
                launch (LaunchActionEnum.RESTART, so)
                break
                
            case EMenuObjectOption.RESTARTPOD:
                setMsgBox(MsgBoxYesNo('Restart pod',`Are you sure you want to restart pod '${so.pod}' in '${so.namespace}' namespace?`, setMsgBox, (button) => {
                    if (button===MsgBoxButtons.Yes) {
                        let opsMessage:IOpsMessage = {
                            msgtype: 'opsmessage',
                            action: EInstanceMessageAction.COMMAND,
                            flow: EInstanceMessageFlow.REQUEST,
                            type: EInstanceMessageType.DATA,
                            channel: EInstanceMessageChannel.OPS,
                            instance: props.channelObject.instanceId,
                            id: '1',
                            accessKey: props.channelObject.accessString!,
                            command: EOpsCommand.RESTARTPOD,
                            namespace: so.namespace,
                            group: '',
                            pod: so.pod,
                            container: ''
                        }
                        if (props.channelObject.webSocket) props.channelObject.webSocket.send(JSON.stringify( opsMessage ))
                    }
                }))
                break
            case EMenuObjectOption.RESTARTNS:
                setMsgBox(MsgBoxYesNo('Restart namespace',`Are you sure you want to restart namespace '${so.namespace}' (this will restart all pods you have access to)?`, setMsgBox, (button) => {
                    if (button===MsgBoxButtons.Yes) {
                        let opsMessage:IOpsMessage = {
                            msgtype: 'opsmessage',
                            action: EInstanceMessageAction.COMMAND,
                            flow: EInstanceMessageFlow.IMMEDIATE,
                            type: EInstanceMessageType.DATA,
                            channel: EInstanceMessageChannel.OPS,
                            instance: '',
                            id: '1',
                            accessKey: props.channelObject.accessString!,
                            command: EOpsCommand.RESTARTNS,
                            namespace: so.namespace,
                            group: '',
                            pod: '',
                            container: ''
                        }
                        if (props.channelObject.webSocket) props.channelObject.webSocket.send(JSON.stringify( opsMessage ))
                    }
                }))
                break
            case EMenuObjectOption.VIEWMETRICS:
                let metricsResource:IResourceSelected = {
                    channelId: 'metrics',
                    clusterName: props.channelObject.clusterName,
                    view: props.channelObject.view,
                    namespaces: [so.namespace],
                    controllers: [],
                    pods: [so.pod],
                    containers: [so.container],
                    name: `${so.namespace}-${so.pod}+${so.container}`
                }
                let metricsConfig:IMetricsConfig = {
                    depth: 50,
                    width: 3,
                    lineHeight: 300,
                    configurable: true,
                    compact: false,
                    legend: true,
                    merge: false,
                    stack: false,
                    chart: EChartType.LineChart,
                    metricsDefault: {}
                }
                let metricsInstanceConfig:IMetricsInstanceConfig = {
                    mode: EMetricsConfigMode.STREAM,
                    aggregate: false,
                    interval: 15,
                    metrics: ['kwirth_container_cpu_percentage','kwirth_container_memory_percentage', 'kwirth_container_transmit_mbps', 'kwirth_container_receive_mbps', 'kwirth_container_write_mbps', 'kwirth_container_read_mbps']
                }
                let metricsSettings ={
                    config:metricsConfig,
                    instanceConfig:metricsInstanceConfig
                }
                props.channelObject.createTab?.(metricsResource, true, metricsSettings)
                break
            case EMenuObjectOption.VIEWLOG:
                let logResource:IResourceSelected = {
                    channelId: 'log',
                    clusterName: props.channelObject.clusterName,
                    view: props.channelObject.view,
                    namespaces: [so.namespace],
                    controllers: [],
                    pods: [so.pod],
                    containers: [so.container],
                    name: `${so.namespace}-${so.pod}+${so.container}`
                }
                let logConfig:ILogConfig = {
                    startDiagnostics: false,
                    follow: true,
                    showNames: false,
                    maxMessages: 5000,
                    maxPerPodMessages: 5000,
                    sortOrder: ELogSortOrder.TIME
                }
                let logInstanceConfig:ILogInstanceConfig = {
                    previous: false,
                    timestamp: false,
                    fromStart: false
                }
                let logSettings ={
                    config:logConfig,
                    instanceConfig:logInstanceConfig
                }
                if (props.channelObject.createTab) props.channelObject.createTab(logResource, true, logSettings)
                break
        }
    }

    const deleteSession = (key:string) => {
        let manterm = opsData.terminalManager.terminals.get(key)
        if (manterm) {
            manterm.term.dispose()
            if (opsData.terminalManager.onClose) opsData.terminalManager.onClose(key)
            opsData.terminalManager.terminals.delete(key)
            opsData.selectedTerminal = undefined
            setSelectedTerminal(undefined)
            setRefresh(Math.random())
        }
    }

    const onChangeFilter = (event: any) => {
        setFilter(event.target?.value)
    }

    return (<>
        <Box ref={opsBoxRef} sx={{ display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden', flexGrow:1, height: `${opsBoxHeight}px`, p:2, gap: 2}}>
            { showSelector && !opsConfig.launchShell && formatSelector() }

            { opsData.started && !opsConfig.launchShell && !selectedTerminal &&
                <Stack direction={'row'} spacing={2} alignItems={'stretch'} sx={{ flexGrow: 1, minHeight: 0 }}>
                    <Card sx={{ width: '60%', display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
                        <CardHeader title={
                            <Stack direction={'row'} alignItems={'center'}>
                                <Typography fontSize={24}>Objects</Typography>
                                <Typography flex={1}></Typography>
                                <TextField value={filter} onChange={onChangeFilter} disabled={!opsData.started} variant='standard' placeholder='Filter...'/>
                            </Stack>
                        }/>
                        <CardContent sx={{overflowY:'auto'}}>
                            {
                                opsData.scopedObjects.filter(so => so.namespace.includes(filter) || so.pod.includes(filter) || so.container.includes(filter)).map( (scopedObject,index) => {
                                return (
                                    <ListItem key={index}>
                                        <Stack direction={'row'} sx={{width:'100%'}} alignItems={'center'}>
                                            <Typography>{scopedObject.namespace+'/'+scopedObject.pod+'/'+scopedObject.container}</Typography>
                                            <Typography flex={1}></Typography>
                                            <Stack direction={'row'} alignItems={'center'}>
                                                <Tooltip title={'Restart container'}>
                                                    <IconButton onClick={() => launch (LaunchActionEnum.RESTART, scopedObject)}>
                                                        <RestartAlt/>
                                                    </IconButton>
                                                </Tooltip>
                                                <IconButton onClick={() => launch (LaunchActionEnum.TERMINAL, scopedObject)} disabled={opsData.terminalManager.terminals.has(scopedObject.namespace+'/'+scopedObject.pod+'/'+scopedObject.container)}>
                                                    <Terminal/>
                                                </IconButton>
                                                <IconButton onClick={(event) => {setAnchorMenuChart(event.currentTarget); setSelectedScopedObject(scopedObject)}}>
                                                    <MoreVert/>
                                                </IconButton>
                                            </Stack>
                                        </Stack>
                                    </ListItem>
                                )                                
                            }
                            )}
                        </CardContent>
                    </Card>
                    
                    <Card sx={{ width: '40%', display: 'flex', flexDirection: 'column', maxHeight: '100%' }}>
                        <CardHeader title={<>XTerm</>}></CardHeader>
                        <CardContent sx={{overflowY:'auto'}}>
                            { opsData.terminalManager.terminals.size===0 &&
                                <>You have no open terminals.</>
                            }

                            { opsData.terminalManager.terminals.size>0 &&
                                Array.from(opsData.terminalManager.terminals.keys()).map( (key,index) => {

                                    return <ListItem key={index}>
                                        <Stack direction={'row'} sx={{width:'100%'}} alignItems={'center'}>
                                            <ListItemButton onClick={() => onSelectNewTerm(key)}>
                                                <Typography flex={1}>{key}</Typography>
                                                {opsData.terminalManager.terminals.get(key)!.index > 0 ?
                                                    <Typography width={'32px'}>{'F'+opsData.terminalManager.terminals.get(key)!.index}</Typography>
                                                :
                                                    <Typography width={'32px'}></Typography>
                                                }

                                            </ListItemButton>
                                            <IconButton onClick={() => deleteSession(key)}>
                                                <Delete />
                                            </IconButton>

                                        </Stack>
                                    </ListItem>
                                })
                            }

                        </CardContent>
                    </Card>

                </Stack> }

            { opsData.started &&  opsData.selectedTerminal!==undefined && selectedTerminal && (
                <Stack sx={{ display:'flex', flex:1,  flexDirection:'column', height: '100%', position: 'relative', overflow:'hidden' }}>
                    {
                       !opsConfig.launchShell &&
                       <Box>
                            <Button onClick={() => {setSelectedTerminal(undefined); opsData.selectedTerminal=undefined}} sx={{borderBottomRightRadius:0, borderBottomLeftRadius:0}}>
                                <Home fontSize='small' sx={{mb:'2px'}}/>HOME
                            </Button>
                            {Array.from(opsData.terminalManager.terminals.keys()).map(key => {               
                                return (
                                    <Tooltip key={key} title={key}>
                                        <Button onClick={() => {setSelectedTerminal(key); opsData.selectedTerminal=key}} sx={{background: selectedTerminal===key? 'lightgray':'white', borderBottomRightRadius:0, borderBottomLeftRadius:0}}>
                                            {key.split('/')[2]}{opsData.terminalManager.terminals.get(key)!.index>0 && <Typography fontSize={10} fontWeight={'900'}>&nbsp;&nbsp;F{opsData.terminalManager.terminals.get(key)?.index}</Typography>}
                                        </Button>
                                    </Tooltip>
                                )
                            })}
                        </Box>
                    }

                    <TerminalInstance id={selectedTerminal} terminalManager={opsData.terminalManager} data-refresh={refresh}/>
                </Stack>
            )
            }
            { msgBox }
            { anchorMenuChart && selectedScopedObject && <MenuObject onClose={() => setAnchorMenuChart(null)} onOptionSelected={menuObjectOptionSelected} anchorParent={anchorMenuChart} scopedObject={selectedScopedObject}/> }
        </Box>
    </>)
}

export { OpsTabContent }