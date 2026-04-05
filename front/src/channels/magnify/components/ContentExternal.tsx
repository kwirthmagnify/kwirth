import { EInstanceConfigObject, EInstanceConfigScope, EInstanceConfigView, EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, EMetricsConfigMode, IInstanceConfig, IInstanceMessage, InstanceConfigScopeEnum } from '@jfvilas/kwirth-common'
import { TChannelConstructor, EChannelRefreshAction, IChannel, IChannelObject, IContentProps } from '../../IChannel'
import { Box, DialogContent, DialogTitle, Divider, IconButton, Popover, Stack, Typography } from '@mui/material'
import { Close, Fullscreen, FullscreenExit, Info, Minimize, PauseCircle, PinDrop, Place, PlayCircle, Settings, StopCircle } from '@mui/icons-material'
import { ELogSortOrder, ILogConfig, ILogInstanceConfig } from '../../log/LogConfig'
import { ILogData } from '../../log/LogData'
import { useEffect, useState } from 'react'
import { createChannelInstance } from '../../../tools/ChannelTools'
import { ENotifyLevel } from '../../../tools/Global'
import { IMetricsConfig, IMetricsInstanceConfig } from '../../metrics/MetricsConfig'
import { IMetricsData } from '../../metrics/MetricsData'
import { EChartType } from '../../metrics/MenuChart'
import { IOpsData } from '../../ops/OpsData'
import { ESwitchKey, IOpsConfig, IOpsInstanceConfig } from '../../ops/OpsConfig'
import { MagnifyUserPreferences } from './MagnifyUserPreferences'
import { IFilemanData } from '../../fileman/FilemanData'
import { IFilemanConfig } from '../../fileman/FilemanConfig'
import { useAsync } from 'react-use'
import { IContentWindow } from '../MagnifyTabContent'
import { ResizableDialog } from './ResizableDialog'
import { FormSimple } from './FormSimple'
import { ITrivyInstanceConfig } from '../../trivy/TrivyConfig'
import { ITrivyData } from '../../trivy/TrivyData'
import { addGetAuthorization } from '../../../tools/AuthorizationManagement'
import { MsgBoxOk, MsgBoxWait } from '../../../tools/MsgBox'
import { TerminalManager } from '../../ops/Terminal/TerminalManager'

export interface IContentExternalOptions {
    pauseable: boolean
    stopable: boolean
    autostart: boolean
    configurable: boolean
}

export interface IContentExternalData {
    isInitialized: boolean
    isElectron: boolean
    channelId: string
    options: IContentExternalOptions
    contentView: EInstanceConfigView
    settings: MagnifyUserPreferences
    frontChannels: Map<string, TChannelConstructor>
    onNotify: (channel:string|undefined, level: ENotifyLevel, msg: string) => void
    onRefresh: () => void
    content?: IContentExternalObject
    channelObject: IChannelObject
}

export interface IContentExternalProps extends IContentWindow {
    data: IContentExternalData
}

export interface IContentExternalObject {
    ws: WebSocket | undefined
    settings: MagnifyUserPreferences
    externalChannel?: IChannel
    externalChannelObject?: IChannelObject
    externalChannelStarted: boolean
    externalChannelPaused: boolean
    externalChannelPending: boolean
    termId: string|undefined
}

const ContentExternal: React.FC<IContentExternalProps> = (props:IContentExternalProps) => {
    let contentExternalData:IContentExternalData = props.data
    const [ msgBox, setMsgBox ] = useState(<></>)
    const [ anchorHelp, setAnchorHelp ] = useState<undefined | HTMLElement>(undefined)
    const [ anchorConfig, setAnchorConfig ] = useState<undefined | HTMLElement>(undefined)
    const [ isMaximized, setIsMaximized ] = useState(props.isMaximized)
    const [ channelConfig, setChannelConfig ] = useState<any>()
    const [ , setRefreshTick] = useState(0);
    const forceUpdate = () => setRefreshTick(tick => tick + 1);

    useEffect( () => {
        if (!contentExternalData.isInitialized) {
            contentExternalData.isInitialized = true

            contentExternalData.content = createContent(contentExternalData.channelId)
            if (!contentExternalData.content) return

            switch(contentExternalData.channelId) {
                case 'log':
                    setChannelConfig({ lines: 5000, showNames:false, timestamp:false, startDiagnostics: false })
                    setLogConfig(contentExternalData.content)
                    break
                case 'metrics':
                    setChannelConfig({ aggregate: true, merge: false, type: {value:'line', options:['line','bar','area']}, width:3, depth:50, legend:true})
                    setMetricsConfig(contentExternalData.content)
                    break
                case 'ops':
                    setChannelConfig({})
                    setOpsConfig(contentExternalData.content)
                    break
                case 'fileman':
                    setChannelConfig({})
                    setFilemanConfig(contentExternalData.content)
                    break
                case 'trivy':
                    setChannelConfig({
                        'Status': {
                            text: 'Status',
                            asyncAction: async () => {
                                try  {
                                    if (contentExternalData.content?.externalChannelObject?.data.ri)
                                        return await (await fetch (`${contentExternalData.content?.externalChannelObject?.clusterUrl}/${contentExternalData.content?.externalChannelObject?.data.ri}/channel/trivy/operator?action=status`, addGetAuthorization(contentExternalData.content?.externalChannelObject?.accessString!))).text()
                                    else
                                        return 'No RI. Wait a few seconds.'
                                }
                                catch {
                                    return 'N/A'
                                }
                            }
                        },
                        'Install Trivy operator': { 
                            button:'Install',
                            action: async () => {
                                if (contentExternalData.content?.externalChannelObject?.data.ri) {
                                    setMsgBox(MsgBoxWait('Trivy install', 'Wait for Trivy to start installation', setMsgBox, ))
                                    await fetch (`${contentExternalData.content?.externalChannelObject?.clusterUrl}/${contentExternalData.content?.externalChannelObject?.data.ri}/channel/trivy/operator?action=install`, addGetAuthorization(contentExternalData.content?.externalChannelObject?.accessString!))
                                    setMsgBox(MsgBoxOk('Install', 'Installation started, close this dialog and wait for Trivy to finish startup', setMsgBox))
                                }
                                else {
                                    setMsgBox(MsgBoxOk('Trivy install', 'Running instance is not yet available, please try again in a few seconds', setMsgBox))
                                }
                            } 
                        },
                        'Remove Trivy operator': { 
                            button:'Remove',
                            action: async () => {
                                if (contentExternalData.content?.externalChannelObject?.data.ri) {
                                    setMsgBox(MsgBoxWait('Trivy remove', 'Wait for Trivy to start removing', setMsgBox, ))
                                    await fetch (`${contentExternalData.content?.externalChannelObject?.clusterUrl}/${contentExternalData.content?.externalChannelObject?.data.ri}/channel/trivy/operator?action=remove`, addGetAuthorization(contentExternalData.content?.externalChannelObject?.accessString!))
                                    setMsgBox(MsgBoxOk('Remove', 'Removing started, close this dialog and wait for Trivy to completely disappear from your cluster', setMsgBox))
                                }
                                else {
                                    setMsgBox(MsgBoxOk('Trivy install', 'Running instance is not yet available, please try again in a few seconds', setMsgBox))
                                }
                            } 
                        }
                    })
                    setTrivyConfig(contentExternalData.content)
                    break
            }
        }
    },[])

    useEffect(() => {
        // this Effect must be executed after initial useEffect, because it uses content.current
        if (contentExternalData.channelId==='ops') {
            const handleNativeKey = async (e: KeyboardEvent) => {
                if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return

                // we handle first start and restore (the id comes from a different source). This is needed because the id is included in the colusure of the keyboard handle)
                let id = contentExternalData.content!.termId ||
                    props.selectedFiles[0]?.data?.origin?.metadata?.namespace + '/' + 
                    props.selectedFiles[0]?.data?.origin?.metadata?.name + '/' + 
                    props.container

                const terminalEntry = contentExternalData.content?.externalChannelObject?.data?.terminalManager?.terminals.get(id)
                const socket = terminalEntry?.socket
                if (!socket || socket.readyState !== WebSocket.OPEN) return

                const key = e.key.toLowerCase();
                let toSend: string | null = null;

                // Ctrl + Shift + C = copy
                if (e.ctrlKey && e.shiftKey && key === 'c') {
                    e.preventDefault();
                    const selectedText = terminalEntry.term ? terminalEntry.term.getSelection() : window.getSelection()?.toString();
                    if (selectedText) await navigator.clipboard.writeText(selectedText);
                    return
                }

                // Ctrl + Shift + V = paste
                if (e.ctrlKey && e.shiftKey && key === 'v') {
                    e.preventDefault()
                    try {
                        const text = await navigator.clipboard.readText()
                        if (text) socket.send(text)
                    }
                    catch (err) {
                        console.error('Clipboard could not be accessed', err)
                    }
                    return
                }

                toSend = getComplexCode(e)
                if (!toSend && e.ctrlKey) toSend = getControlChar(e.key)
                if (!toSend && e.altKey && e.key.length === 1) toSend = '\x1b' + e.key;
                if (!toSend) toSend = ANSI_MAP[e.key] || (e.key.length === 1 ? e.key : null);

                if (toSend) {
                    e.preventDefault()
                    e.stopPropagation()
                    socket.send(toSend)
                }
            }

            // Use 'true' for the capture phase
            window.addEventListener('keydown', handleNativeKey, true)
            
            return () => {
                window.removeEventListener('keydown', handleNativeKey, true)
            }
        }
    }, [props.container, props.selectedFiles, contentExternalData.content?.externalChannelObject])

    useAsync (async () => {
        // useAsync must be executed after useEffect, because it uses content.current
        if (contentExternalData.options.autostart) {
            if (contentExternalData.content && !contentExternalData.content.externalChannelStarted) {
                while (contentExternalData.content?.ws?.readyState !== WebSocket.OPEN) {
                    await new Promise((resolve) => setTimeout(resolve, 10))
                }
                if (contentExternalData.content?.ws?.readyState === WebSocket.OPEN) play()
            }
        }
    }, [])

    const createContent = (channelId:string) : IContentExternalObject|undefined => {
        let newChannel = createChannelInstance(contentExternalData.frontChannels.get(channelId))
        if (!newChannel) {
            console.log('Invaid channel instance created')
            return undefined
        }
        let newContent:IContentExternalObject = {
            ws: undefined,
            externalChannel: newChannel,
            externalChannelObject: {
                isElectron: contentExternalData.isElectron,
                clusterName: contentExternalData.channelObject?.clusterName!,
                instanceId: '',
                view: contentExternalData.contentView,
                // for namespaces, we can create a list of selected namespaces or just a list of namespaced referenced boy objects (in another view)
                namespace: contentExternalData.contentView === EInstanceConfigView.NAMESPACE ? props.selectedFiles.map(f=> f.data.origin.metadata.name).join(',') : [...new Set(props.selectedFiles.map(n => n.data.origin.metadata.namespace))].join(','),
                group: contentExternalData.contentView === EInstanceConfigView.GROUP ? props.selectedFiles.map(g => g.data.origin.kind + '+' + g.data.origin.metadata.name).join(',') : '',
                pod: contentExternalData.contentView === EInstanceConfigView.POD ? props.selectedFiles.map(p => p.data.origin.metadata.name).join(',') : '',
                container: contentExternalData.contentView === EInstanceConfigView.CONTAINER ? props.selectedFiles[0].data.origin.metadata.name + '+' + props.container : '',
                config: undefined,
                data: undefined,
                instanceConfig: undefined,
                channelId: newChannel.channelId
            } satisfies IChannelObject,
            externalChannelStarted: false,
            externalChannelPaused: false,
            externalChannelPending: false,
            settings: contentExternalData.settings,
            termId: props.selectedFiles[0]?.data?.origin?.metadata?.namespace + '/' + 
                    props.selectedFiles[0]?.data?.origin?.metadata?.name.split('+')[0] + '/' + 
                    props.container
        }

        if (newChannel.requirements.notifier) newContent.externalChannelObject!.notify = contentExternalData.channelObject?.notify
        if (newChannel.requirements.metrics) newContent.externalChannelObject!.metricsList = contentExternalData.channelObject?.metricsList
        if (newChannel.requirements.clusterUrl) newContent.externalChannelObject!.clusterUrl = contentExternalData.channelObject?.clusterUrl
        if (newChannel.requirements.accessString) newContent.externalChannelObject!.accessString = contentExternalData.channelObject?.accessString

        newContent.ws = new WebSocket(contentExternalData.channelObject?.clusterUrl!)
        newContent.ws.onmessage = (event:MessageEvent) => wsOnMessage(event)
        newContent.ws.onerror = (event) => () => { console.log('WebSocket error:'+event, new Date().toISOString()) }
        newContent.ws.onclose = (event:CloseEvent) => { console.log('WebSocket disconnect:'+event.reason, new Date().toISOString()) }
        return newContent
    }

    const wsOnMessage = (wsEvent:MessageEvent) => {
        let instanceMessage:IInstanceMessage
        try {
            instanceMessage = JSON.parse(wsEvent.data)
        }
        catch (err:any) {
            console.log(err.stack)
            console.log(wsEvent.data)
            return
        }

        if (instanceMessage.action === EInstanceMessageAction.PING || instanceMessage.channel === '') return

        if (contentExternalData.frontChannels.has(instanceMessage.channel)) {
            let refreshAction = contentExternalData.content!.externalChannel?.processChannelMessage(contentExternalData.content!.externalChannelObject!, wsEvent)
            if (refreshAction) {
                if (refreshAction.action === EChannelRefreshAction.REFRESH) {
                    contentExternalData.onRefresh()
                }
                else if (refreshAction.action === EChannelRefreshAction.STOP) {
                    stop()
                }
            }
        }
        else {
            console.log('Received invalid channel in message: ', instanceMessage)
            contentExternalData.onNotify(undefined, ENotifyLevel.ERROR, `'Received invalid channel in message: ${instanceMessage.channel}`)
        }
    }

    const setLogConfig = (c:IContentExternalObject) => {
        let logConfig:ILogConfig = {
            startDiagnostics: false,
            follow: true,
            showNames: false,
            maxMessages: contentExternalData.settings.logLines,
            maxPerPodMessages: 500,
            sortOrder: ELogSortOrder.TIME
        }
        let logInstanceConfig:ILogInstanceConfig = {
            previous: false,
            timestamp: false,
            fromStart: false
        }
        let logData:ILogData = {
            messages: [],
            pending: false,
            backgroundNotification: false,
            counters: new Map(),
            buffers: new Map(),
            paused: false,
            started: false
        }
        c.externalChannelObject!.data = logData
        c.externalChannelObject!.config = logConfig
        c.externalChannelObject!.instanceConfig = logInstanceConfig
    }

    const setMetricsConfig = (c:IContentExternalObject) => {
        let metricsData:IMetricsData = {
            assetMetricsValues: [],
            events: [],
            paused: false,
            started: false
        }
        let metricsConfig:IMetricsConfig = {
            depth: 50,
            width: 3,
            lineHeight: 300,
            configurable: true,
            compact: true,
            legend: true,
            merge: false,
            stack: false,
            chart: EChartType.LineChart,
            metricsDefault: {}
        }
        let metricsInstanceConfig:IMetricsInstanceConfig = {
            mode: EMetricsConfigMode.STREAM,
            aggregate: true,
            interval: 15,
            metrics: ['kwirth_container_cpu_percentage','kwirth_container_memory_percentage', 'kwirth_container_transmit_mbps', 'kwirth_container_receive_mbps', 'kwirth_container_write_mbps', 'kwirth_container_read_mbps']
        }

        c.externalChannelObject!.data = metricsData
        c.externalChannelObject!.config = metricsConfig
        c.externalChannelObject!.instanceConfig = metricsInstanceConfig
    }

    const setOpsConfig = (c:IContentExternalObject) => {
        let opsData:IOpsData = {
            scopedObjects: [],
            paused: false,
            started: false,
            websocketRequest: {
                namespace: '',
                pod: '',
                container: ''
            },
            terminalManager: new TerminalManager(),
            selectedTerminal: undefined
        }
        let onlyContName = c.externalChannelObject!.container.split('+')[1]
        let onlyPodName = c.externalChannelObject!.container.split('+')[0]
        let opsConfig:IOpsConfig = {
            accessKey: ESwitchKey.DISABLED,
            launchShell: true,
            shell: {
                namespace: c.externalChannelObject!.namespace,
                pod: onlyPodName,
                container: onlyContName
            }
        }
        let opsInstanceConfig:IOpsInstanceConfig = {
            sessionKeepAlive: false
        }
        c.externalChannelObject!.webSocket = contentExternalData.content!.ws
        c.externalChannelObject!.data = opsData
        c.externalChannelObject!.config = opsConfig
        c.externalChannelObject!.instanceConfig = opsInstanceConfig
    }

    const setFilemanConfig = (c:IContentExternalObject) => {
        let filemanData:IFilemanData = {
            paused: false,
            started: false,
            files: [],
            currentPath: '',
            ri: undefined
        }
        let filemanConfig:IFilemanConfig = {
            notify: contentExternalData.onNotify
        }

        c.externalChannelObject!.webSocket = contentExternalData.content!.ws
        c.externalChannelObject!.data = filemanData
        c.externalChannelObject!.config = filemanConfig
    }

    const setTrivyConfig = (c:IContentExternalObject) => {
        let trivyInstanceConfig:ITrivyInstanceConfig = {
            ignoreCritical: false,
            ignoreHigh: false,
            ignoreMedium: true,
            ignoreLow: true
        }
        let trivyData:ITrivyData = {
            mode: 'card',
            paused: false,
            started: false,
            assets: [],
            ri: undefined
        }
        c.externalChannelObject!.webSocket = contentExternalData.content!.ws
        c.externalChannelObject!.data = trivyData
        c.externalChannelObject!.instanceConfig = trivyInstanceConfig
    }

    const play = () => {
        if (!contentExternalData.content || !contentExternalData.content.ws || !contentExternalData.content.externalChannel || !contentExternalData.content.externalChannelObject) return

        if (contentExternalData.content.externalChannelPaused) {
            contentExternalData.content.externalChannel.continueChannel(contentExternalData.content.externalChannelObject)
            let instanceConfig:IInstanceConfig = {
                channel: contentExternalData.content.externalChannel.channelId,
                objects: EInstanceConfigObject.PODS,
                action: EInstanceMessageAction.CONTINUE,
                flow: EInstanceMessageFlow.REQUEST,
                instance: contentExternalData.content.externalChannelObject.instanceId,
                accessKey: contentExternalData.channelObject?.accessString!,
                view: contentExternalData.contentView,
                scope: InstanceConfigScopeEnum.NONE,
                namespace: '',
                group: '',
                pod: '',
                container: '',
                type: EInstanceMessageType.SIGNAL
            }
            contentExternalData.content.externalChannelPaused = false
            contentExternalData.content.ws.send(JSON.stringify(instanceConfig))
        }
        else {
            contentExternalData.content.externalChannel.startChannel(contentExternalData.content.externalChannelObject)

            let instanceConfig:IInstanceConfig = {
                channel: contentExternalData.content.externalChannel.channelId,
                objects: EInstanceConfigObject.PODS,
                action: EInstanceMessageAction.START,
                flow: EInstanceMessageFlow.REQUEST,
                instance: '',
                accessKey: contentExternalData.channelObject?.accessString!,
                scope: EInstanceConfigScope.NONE,
                view: contentExternalData.contentView,
                namespace: contentExternalData.contentView === EInstanceConfigView.NAMESPACE ? props.selectedFiles.map(n => n.data.origin.metadata.name).join(',') : [...new Set(props.selectedFiles.map(n => n.data.origin.metadata.namespace))].join(','),
                group: contentExternalData.contentView === EInstanceConfigView.GROUP? props.selectedFiles.map(g => g.data.origin.kind+'+'+g.data.origin.metadata.name).join(',') : '',
                pod: contentExternalData.contentView === EInstanceConfigView.POD? props.selectedFiles.map(p => p.data.origin.metadata.name).join(',') : '',
                container: contentExternalData.contentView === EInstanceConfigView.CONTAINER? props.selectedFiles[0].data.origin.metadata.name + '+' + props.container : '',
                type: EInstanceMessageType.SIGNAL,
            }
            instanceConfig.scope = contentExternalData.content.externalChannel.getScope() || ''
            instanceConfig.data = contentExternalData.content.externalChannelObject.instanceConfig
            contentExternalData.content.ws.send(JSON.stringify(instanceConfig))
            contentExternalData.content.externalChannelStarted = true
            contentExternalData.content.externalChannelPaused = false
        }
        forceUpdate()
    }

    const pause = () => {
        if (!contentExternalData.content || !contentExternalData.content.ws || !contentExternalData.content.externalChannel || !contentExternalData.content.externalChannelObject) return

        contentExternalData.content.externalChannel.pauseChannel(contentExternalData.content.externalChannelObject!)

        let instanceConfig:IInstanceConfig = {
            channel: contentExternalData.content.externalChannel.channelId,
            objects: EInstanceConfigObject.PODS,
            action: EInstanceMessageAction.PAUSE,
            flow: EInstanceMessageFlow.REQUEST,
            instance: contentExternalData.content.externalChannelObject.instanceId,
            accessKey: contentExternalData.channelObject?.accessString!,
            view: contentExternalData.content.externalChannelObject.view,
            scope: InstanceConfigScopeEnum.NONE,
            namespace: '',
            group: '',
            pod: '',
            container: '',
            type: EInstanceMessageType.SIGNAL
        }

        contentExternalData.content.externalChannelPaused = true
        instanceConfig.action = EInstanceMessageAction.PAUSE
        contentExternalData.content.ws.send(JSON.stringify(instanceConfig))
        forceUpdate()
    }

    const stop = () => {
        if (!contentExternalData.content || !contentExternalData.content.ws || !contentExternalData.content.externalChannel || !contentExternalData.content.externalChannelObject) return

        let instanceConfig: IInstanceConfig = {
            channel: contentExternalData.content.externalChannel.channelId,
            objects: EInstanceConfigObject.PODS,
            action: EInstanceMessageAction.STOP,
            flow: EInstanceMessageFlow.REQUEST,
            instance: contentExternalData.content.externalChannelObject.instanceId,
            accessKey: contentExternalData.channelObject?.accessString!,
            view: contentExternalData.content.externalChannelObject.view,
            scope: InstanceConfigScopeEnum.NONE,
            namespace: '',
            group: '',
            pod: '',
            container: '',
            type: EInstanceMessageType.SIGNAL
        }
        contentExternalData.content.externalChannel.stopChannel(contentExternalData.content.externalChannelObject)
        contentExternalData.content.ws.send(JSON.stringify(instanceConfig))
        contentExternalData.content.externalChannelStarted = false
        contentExternalData.content.externalChannelPaused = false
        forceUpdate()
    }

    const showHelp = () => {
        let content = <></>
        switch(contentExternalData.channelId) {
            case 'log':
                content = <>
                    <Typography variant='subtitle1' sx={{ fontWeight: 700, flexGrow: 1 }}>Log</Typography>
                    <Divider/>
                    <Typography fontSize={12}>You can configure log depth (number of lines) on the configuration menu.</Typography>
                    <Typography fontSize={12}>Other configuration options, like Start Diagnostics, are not available to Magnify, but you can use them in log channel.</Typography>
                </>
                break
            case 'metrics':
                content = <>
                    <Typography variant='subtitle1' sx={{ fontWeight: 700, flexGrow: 1 }}>Metrics</Typography>
                    <Divider/>
                    <Typography fontSize={12}>You can change every individual chart type, but it won't be saved. Next time you'll need to reconfigure it again.</Typography>
                    <Typography fontSize={12}>Data visualization refreshment depends on your Kwirth front configuration, your Magnify configuration.</Typography>
                    <Typography fontSize={12}>On the other side, data freshness depends on Kwirth backend configuration. If you ser a visualization refresh lower than your data freshness, you'll get repeated values on different intervals.</Typography>
                </>
                break
            case 'ops':
                content = <>
                    <Typography variant='subtitle1' sx={{ fontWeight: 700, flexGrow: 1 }}>Ops</Typography>
                    <Divider/>
                    <Typography fontSize={12}>You can use clipboard functions by pressing <b>Ctrl+Shift+C</b> for copying and <b>Ctrl+Shift+V</b> for pasting</Typography>
                    <Typography fontSize={12}>You can minimize this window and the connection will keep open, or you can close this window and the connection to the container will be closed.</Typography>
                </>
                break
            case 'fileman':
                content = <>
                    <Typography variant='subtitle1' sx={{ fontWeight: 700, flexGrow: 1 }}>Fileman</Typography>
                    <Divider/>
                    <Typography fontSize={12}>You can refresh filesystem data everytime you suspect what you are viewing is not acccurate. Just click on top-righ icon to refresh content.</Typography>
                    <Typography fontSize={12}>Upload and Download capabilities depend on your kind of Kwirth deployment. These actions are not available for all architectures. They should be available, at least, on Kubernetes Deployment. Accessing them via Electron may not be working.</Typography>
                </>
                break
            case 'trivy':
                content = <>
                    <Typography variant='subtitle1' sx={{ fontWeight: 700, flexGrow: 1 }}>Trivy</Typography>
                    <Divider/>
                    <Typography variant='body2'>Kwirth Trivy channel is a powerful tool for managing your workload security. It is based on Trivy Operator, which you can install by your own or use Kwirth for deploying Trivy without any effort (perform installation from a Trivy channel or from 'Settings' on this window).</Typography>
                    <Typography variant='body2'>Once Trivy Operator is installed, you will see here Trivy information related to artifacts you've selected in Magnify. You can select, for instance, several pods and access this Trivy channel for viewing Trivy information about those set of pods.</Typography>
                    <Typography variant='body2'>From the asset list you will be able to see: Vulnerabilities report, Config Audit report, Exposed secrets report and also a SBOM (Software Bill of Materials, where you can analyze pacakges and its dependencies).</Typography>
                </>
                break
        }
        return <Popover
                anchorEl={anchorHelp}
                open={true}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                slotProps={{paper: { sx: { width: 400, maxHeight: 500 } }}}
                onClose={() => setAnchorHelp(undefined)}
            >
            <Box sx={{ p: 2, display: 'flex', alignItems: 'left', gap: 1, flexDirection:'column' }}>
                {content}
            </Box>
        </Popover>
    }

    const showContent = () => {
        if (!contentExternalData.content || !contentExternalData.content.ws || !contentExternalData.content.externalChannel || !contentExternalData.content.externalChannelObject) return

        let ChannelTabContent = contentExternalData.content.externalChannel.TabContent
        let channelProps:IContentProps = {
            channelObject: contentExternalData.content.externalChannelObject!
        }
        return <ChannelTabContent {...channelProps}/>
    }

	const onFocus = () => {
		if (props.onFocus) props.onFocus()
	}

	const handleIsMaximized = () => {
		props.onWindowChange(props.id, !isMaximized, props.x, props.y, props. width, props.height)
		setIsMaximized(!isMaximized)
	}

    const onConfigApply = (values:any) => {
        setAnchorConfig(undefined)
        setChannelConfig(values)
        switch(contentExternalData.channelId) {
            case 'log':
                let logConfig = contentExternalData.content!.externalChannelObject!.config as ILogConfig
                logConfig.maxMessages = values.lines
                logConfig.showNames = values.showNames
                logConfig.startDiagnostics = values.startDiagnostics
                let logInstanceConfig = contentExternalData.content!.externalChannelObject!.instanceConfig as ILogInstanceConfig
                logInstanceConfig.timestamp = values.timestamp
                stop()
                play()
                break
            case 'metrics':
                let metricsConfig = contentExternalData.content!.externalChannelObject!.config as IMetricsConfig
                let metricsInstanceConfig = contentExternalData.content!.externalChannelObject!.instanceConfig as IMetricsInstanceConfig
                metricsConfig.width = values.width
                metricsConfig.merge = values.merge
                metricsConfig.depth = values.depth
                metricsConfig.legend = values.legend
                metricsInstanceConfig.aggregate = values.aggregate
                stop()
                play()
                break
            case 'shell':
                break
            case 'fileman':
                break
            case 'trivy':
                let trivyConfig = contentExternalData.content!.externalChannelObject!.config as IMetricsConfig
                let trivyInstanceConfig = contentExternalData.content!.externalChannelObject!.instanceConfig as IMetricsInstanceConfig
                trivyConfig.width = values.width
                trivyConfig.merge = values.merge
                trivyConfig.depth = values.depth
                trivyInstanceConfig.aggregate = values.aggregate
                break
        }
    }

    return (<>
        <ResizableDialog id={props.id} isMaximized={isMaximized} onFocus={onFocus} onWindowChange={props.onWindowChange} x={props.x} y={props.y} width={props.width} height={props.height}>
            <DialogTitle sx={{ cursor: isMaximized ? 'default' : 'move',  py: 1 }} id='draggable-dialog-title'>
                <Stack direction={'row'} alignItems={'center'}>
                    <IconButton onClick={play} disabled={!contentExternalData.options.autostart || (contentExternalData.content?.externalChannelStarted && !contentExternalData.content?.externalChannelPaused)}>
                        <PlayCircle/>
                    </IconButton>
                    <IconButton onClick={pause} disabled={!contentExternalData.options.pauseable || !contentExternalData.content?.externalChannelStarted || contentExternalData.content?.externalChannelPaused}>
                        <PauseCircle/>
                    </IconButton>
                    <IconButton onClick={stop} disabled={!contentExternalData.options.stopable || !contentExternalData.content?.externalChannelStarted}>
                        <StopCircle/>
                    </IconButton>
                    <IconButton disabled={!contentExternalData.options.configurable} onClick={(event) => setAnchorConfig(event.target as HTMLElement)}>
                        <Settings/>
                    </IconButton>
                    <IconButton onClick={(event) => setAnchorHelp(event.currentTarget)}>
                        <Info/>
                    </IconButton>
                    
                    <Typography sx={{flexGrow:1}}></Typography>
                    <Typography>{contentExternalData.content?.externalChannel?.getChannelIcon()}&nbsp;{props.title}</Typography>
                    <Typography sx={{flexGrow:1}}></Typography>

                    <IconButton size="small" onClick={() => props.onMinimize(props.id)}>
                        <Minimize fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => props.onTop(props.id)}>
                        {props.atTop? <PinDrop sx={{color:'blue'}} fontSize="small" /> : <Place fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" onClick={handleIsMaximized}>
                        {isMaximized ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" onClick={() => props.onClose(props.id)} sx={{ '&:hover': { color: 'error.main' } }}>
                        <Close fontSize="small" />
                    </IconButton>
                </Stack>
            </DialogTitle>


            <DialogContent sx={{ display: 'flex', flexDirection: 'column', p: 0, overflow: 'hidden', height: '100%', minHeight: 0, paddingBottom: 1}}>
                {showContent()}
            </DialogContent>
        </ResizableDialog>        
        { anchorHelp && showHelp() }
        { anchorConfig && <FormSimple anchorParent={anchorConfig} model={channelConfig} onApply={onConfigApply} onClose={() => setAnchorConfig(undefined)}/> }
        { msgBox }
    </>)
}

export const ANSI_MAP: Record<string, string> = {
    'ArrowUp':    '\x1b[A',
    'ArrowDown':  '\x1b[B',
    'ArrowRight': '\x1b[C',
    'ArrowLeft':  '\x1b[D',
    'Home':       '\x1b[H',
    'End':        '\x1b[F',
    'PageUp':     '\x1b[5~',
    'PageDown':   '\x1b[6~',
    'Insert':     '\x1b[2~',
    'Delete':     '\x1b[3~',

    // Teclas de control básicas
    'Backspace':  '\x7f',    // A veces \x08 según el sistema
    'Tab':        '\t',
    'Enter':      '\r',
    'Escape':     '\x1b',

    // F1 - F12 (Varían según el terminal, estos son los comunes de xterm)
    'F1':  '\x1bOP',
    'F2':  '\x1bOQ',
    'F3':  '\x1bOR',
    'F4':  '\x1bOS',
    'F5':  '\x1b[15~',
    'F6':  '\x1b[17~',
    'F7':  '\x1b[18~',
    'F8':  '\x1b[19~',
    'F9':  '\x1b[20~',
    'F10': '\x1b[21~',
    'F11': '\x1b[23~',
    'F12': '\x1b[24~',
}

export const getComplexCode = (e: KeyboardEvent): string | null => {
    const { key, ctrlKey, altKey, shiftKey } = e

    let modifier = 1
    if (shiftKey) modifier += 1
    if (altKey)   modifier += 2
    if (ctrlKey)  modifier += 4

    if (modifier === 1) return null

    const F1_F4: Record<string, string> = { 'F1': 'P', 'F2': 'Q', 'F3': 'R', 'F4': 'S' }
    if (F1_F4[key]) return `\x1b[1;${modifier}${F1_F4[key]}`

    const F5_F12: Record<string, number> = {
        'F5': 15, 'F6': 17, 'F7': 18, 'F8': 19, 'F9': 20, 'F10': 21, 'F11': 23, 'F12': 24
    }
    if (F5_F12[key]) return `\x1b[${F5_F12[key]};${modifier}~`

    // 5. Mapeo para Flechas y navegación
    const Nav: Record<string, string> = {
        'ArrowUp': 'A', 'ArrowDown': 'B', 'ArrowRight': 'C', 'ArrowLeft': 'D',
        'Home': 'H', 'End': 'F'
    };
    if (Nav[key]) return `\x1b[1;${modifier}${Nav[key]}`

    // 6. Mapeo para Edición (Insert, Delete, etc.)
    const Edit: Record<string, number> = { 'Insert': 2, 'Delete': 3, 'PageUp': 5, 'PageDown': 6 }
    if (Edit[key]) return `\x1b[${Edit[key]};${modifier}~`

    return null
}

export function getControlChar(key: string): string | null {
    const charCode = key.toLowerCase().charCodeAt(0)
    if (charCode >= 97 && charCode <= 122) return String.fromCharCode(charCode - 96)
    
    return null
}

export { ContentExternal }