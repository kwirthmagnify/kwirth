import React from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { IContentProps } from '../IChannel'
import { EMagnifyCommand, IMagnifyMessage, IMagnifyData } from './MagnifyData'
import { Box, Button, Stack, Tooltip, Typography } from '@mui/material'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType, EInstanceConfigView } from '@kwirthmagnify/kwirth-common'
import { ICategory, IError, IFileManagerHandle, IFileManagerMenuItem, IFileObject } from '@jfvilas/react-file-manager'
import { FileManager } from '@jfvilas/react-file-manager'
import { v4 as uuid } from 'uuid'
import { ENotifyLevel } from '../../tools/Global'
import { actions, icons, menu, spaces } from './components/RFMConfig'
import { objectSections } from './components/DetailsSections'
import { CloudOff, CloudQueue, Edit, EditOff, List, Notifications, NotificationsActive, Search } from '@mui/icons-material'
import { MsgBoxButtons, MsgBoxOkError, MsgBoxWaitCancel, MsgBoxYesNo } from '../../tools/MsgBox'
import { ContentExternal, IContentExternalData } from './components/ContentExternal'
import { ContentDetails, IDetailsData } from './components/ContentDetails'
import { ContentEdit, IContentEditData } from './components/ContentEdit'
import { MenuContainers } from './components/MenuContainers'
import { buildPath } from './MagnifyChannel'
import { InputBox } from '../../tools/FrontTools'
import { templates } from './components/Templates'
// @ts-ignore
import '@jfvilas/react-file-manager/dist/style.css'
// @ts-ignore
import './custom-fm-magnify.css'
import { ArtifactSearch, IArtifactSearchData } from './components/ArtifactSearch'
import { rfmSetup, setLeftItem, setPropertyFunction } from './components/RFMSetup'
import { MenuKubeWorks } from './components/MenuKubeWorks'
import {useTheme } from '@mui/material';
import { MenuKwirthWorks } from './components/MenuKwirthWorks'
import { ICustomAction } from './components/UserPreferences'
import { MenuNotification } from '../../components/MenuNotification'
import { generateMinimalFromCRD } from './Tools'
const yamlParser = require('js-yaml')

const ICON_WINDOW : Record<string, JSX.Element> = {
    ContentDetails: <List />,
    ArtifactSearch: <Search />,
    ContentEdit: <Edit />,
    ContentBrowse: <EditOff />,
}

export interface IContentWindow {
    id: string
    class: string
    visible: boolean
    atFront: boolean
    atTop: boolean
    x: number
    y: number
    width: number
    height: number
    isMaximized: boolean
    onMinimize: (id: string) => void
    onClose: (id: string) => void
    onTop: (id: string) => void
    onFocus?: () => void
    onWindowChange: (id:string, isMaximized:boolean, x:number, y:number, width:number, height:number) => void
    title: string
    
    selectedFiles: IFileObject[]
    container?: string
    data: any
}

const MagnifyTabContent: React.FC<IContentProps> = (props:IContentProps) => {
    const theme = useTheme()
    let magnifyData:IMagnifyData = props.channelObject.data
    let permissions = {
        create: false,
        delete: false,
        download: false,
        copy: false,
        move: false,
        rename: false,
        upload: false
    }

    const [magnifyBoxHeight, setMagnifyBoxHeight] = useState(0)
    const magnifyBoxRef = useRef<HTMLDivElement | null>(null)
    const fileManagerRef = useRef<IFileManagerHandle>(null)

    const [msgBox, setMsgBox] = useState(<></>)

    const [inputBoxTitle, setInputBoxTitle] = useState<any>()
    const [inputBoxMessage, setInputBoxMessage] = useState<any>()
    const [inputBoxDefault, setInputBoxDefault] = useState<any>()
    const [inputBoxResult, setInputBoxResult] = useState<(result:any) => void>()

    const [menuKubeWorksAnchorParent, setMenuKubeWorksAnchorParent] = useState<Element>()
    const [menuKwirthWorksAnchorParent, setMenuKwirthWorksAnchorParent] = useState<Element>()

    const [menuContainersAnchorParent, setMenuContainersAnchorParent] = useState<Element>()
    const [menuContainersFile, setMenuContainersFile] = useState<IFileObject>()
    const [menuContainersChannel, setMenuContainersChannel] = useState<string>('')
    const [menuContainersIncludeAllContainers, setMenuContainersIncludeAllContainers] = useState<boolean>(false)

    const [notificationMenuAnchorParent, setNotificationMenuAnchorParent] = useState<HTMLElement|undefined>(undefined)

    const [ , setTick] = useState<number>(0)

    // RFM categories
    const onCategoryFilter = (categoryKey:string, f:IFileObject) : boolean => {
        let cat = categories.find(c => c.key===categoryKey)
        if (!cat) return true

        let valid=true
        switch(categoryKey) {
            case 'Node':
                valid = cat.selected.includes('all') || cat.selected.some(cat => f.data?.origin?.spec?.nodeName?.includes(cat))
                break
            case 'Namespace':
                valid = cat.selected.includes('all') || cat.selected.some(cat => f.data?.origin?.metadata?.namespace?.includes(cat))
                break
            case 'controller':
                valid = cat.selected.includes('all') || cat.selected.some(cat => f.data?.origin?.metadata?.ownerReferences?.[0]?.kind.includes(cat))
                break
        }
        return valid
    }
    const isFilterActive = (categoryKey:string) : boolean => {
        let cat = categories.find(c => c.key===categoryKey)
        if (!cat) return false
        return !(cat.selected.length===1 && cat.selected[0]==='all')
    }

    const onCategoryValuesChange = (categoryKey:string, categoryValue:string, selected:string[]) => {
        let cat = categories.find(c => c.key===categoryKey)
        if (!cat) return

        if (categoryValue==='all') selected=['all']
        else if (categoryValue!=='all' && selected.length===2 && selected.includes('all')) selected=selected.filter(f => f!=='all')
        else if (selected.length===0) selected=['all']

        cat.selected = selected
        setCategories ([ ...categories ])
    }

    const [categories, setCategories] = useState<ICategory[]>([
        {
            key:'Node',
            text: 'Node',
            all: [ {key:'all',text:'All...'}, {key:'-'} ],
            selected: ['all'],
            onCategoryValuesChange: onCategoryValuesChange,
            onCategoryFilter: onCategoryFilter,
            isFilterActive: isFilterActive
        },
        {
            key:'Namespace',
            text: 'Namespace',
            all: [ {key:'all',text:'All...'}, {key:'-'} ],
            selected: ['all'],
            onCategoryValuesChange: onCategoryValuesChange,
            onCategoryFilter: onCategoryFilter,
            isFilterActive: isFilterActive
        },
        {
            key:'controller',
            text: 'Controller',
            all: [ {key:'all',text:'All...'}, {key:'-'} , {key:'ReplicaSet'} , {key:'DaemonSet'} , {key:'StatefulSet'} , {key:'ReplicationController'}, {key:'Job'}  ],
            selected: ['all'],
            onCategoryValuesChange: onCategoryValuesChange,
            onCategoryFilter: onCategoryFilter,
            isFilterActive: isFilterActive
        }
    ])

    const drawRightItem = (name:string) => {
        switch(name) {
            case 'notifications':
                return props.channelObject.notifications!.length>0? <NotificationsActive sx={{color: 'green'}}/> : <Notifications sx={{color: 'gray'}}/>
            case 'cloud':
                return props.channelObject.webSocket?.readyState===1? 
                    <Tooltip title={<div style={{textAlign:'center'}}>Communications to<br/> Kwirth backend are ok</div>}>
                        <CloudQueue sx={{color: 'green'}}/>
                    </Tooltip>
                    :
                    <Tooltip title={<div style={{textAlign:'center'}}>Communications to Kwirth backend<br/>have been interrupted.<br/>You need to exit cluster and reenter.</div>}>
                        <CloudOff sx={{color: 'red', animation: 'blink 1.5s infinite', '@keyframes blink': { '0%': { opacity: 1 }, '50%': { opacity: 0.1 }, '100%': { opacity: 1 }} }}/>
                    </Tooltip>
        }
    }

    const clickRightItem = (name:string, target:HTMLElement) => {
        switch(name) {
            case 'notifications':
                setNotificationMenuAnchorParent(target)
                break
        }
    }

    const rightItems:IFileManagerMenuItem[] = [
        {
            name: 'cloud',
            //onClick: (name:string, target:HTMLElement) => clickRightItem(name, target),
            onDraw: (name:string) => drawRightItem(name)
        },
        {
            name: 'notifications',
            onClick: (name:string, target:HTMLElement) => clickRightItem(name, target),
            onDraw: (name:string) => drawRightItem(name)
        },
    ]

    useLayoutEffect(() => {
        const observer = new ResizeObserver(() => {
            if (!magnifyBoxRef.current) return
            const { top } = magnifyBoxRef.current.getBoundingClientRect()
            let a = window.innerHeight - top
            setMagnifyBoxHeight(a)
        })
        observer.observe(document.body)

        return () => observer.disconnect()
    }, [magnifyBoxRef.current])

    useEffect(() => {
        props.channelObject.setPalette?.(magnifyData.userPreferences?.palette)
        if (!magnifyData.files.some(f => f.path ==='/overview')) {
            magnifyData.files.push(...menu)
        }

        // Main menu
        rfmSetup(
            theme, 
            magnifyData,
            props.channelObject,
            spaces,
            onMagnifyObjectDetailsLink,
            onFileManagerNavigate,
            launchObjectCreate,
            launchObjectDelete,
            launchObjectDetails,
            launchObjectEdit,
            launchObjectBrowse,
            launchSearch
        )
        setPodActions()
        setControllerActions()
        setClusterActions()
        setNetworkActions()
        setCrdActions()

        // we provide a mechanism for refreshing cluster usage charts
        magnifyData.refreshUsage = ()  => setTick(t=>t+1)

        // we need to do this because category data is lost when magnify tab is unmounted (we could move this into magnifyData structure in order to preserve)
        let namespaceCategory = categories.find(c => c.key==='Namespace')
        if (namespaceCategory) {
            for (let f of magnifyData.files.filter(f => f.data?.origin?.kind==='Namespace')) {
                if (!namespaceCategory.all.some(cv => cv.key === f.name)) namespaceCategory.all.push({key:f.name, text:f.name})
            }
        }
        let nodeCategory = categories.find(c => c.key==='Node')
        if (nodeCategory) {
            for (let f of magnifyData.files.filter(f => f.data?.origin?.kind==='Node')) {
                if (!nodeCategory.all.some(cv => cv.key === f.name)) nodeCategory.all.push({key:f.name, text:f.name})
            }
        }

        // // we provide a mechanism for refreshing namespace list when there is a change in nodes (added/deleted)
        // magnifyData.updateNodes = (action:string, node:string) => {
        //     let nodeCategory = categories.find(c => c.key==='node')
        //     if (!nodeCategory) return
        //     if (action==='DELETED') {
        //         nodeCategory.all = nodeCategory.all.filter(c => c.key !== node)
        //     }
        //     else {
        //         if (!nodeCategory.all.some(c => c.key===node)) nodeCategory.all.push({ key:node })
        //     }
        // }

        // // we provide a mechanism for refreshing namespace list when there is a change in namespaces (added/deleted)
        // magnifyData.updateNamespaces = (action:string, namespace:string) => {
        //     let namespaceCategory = categories.find(c => c.key==='namespace')
        //     if (!namespaceCategory) return
        //     if (action==='DELETED') {
        //         namespaceCategory.all = namespaceCategory.all.filter(c => c.key !== namespace)
        //     }
        //     else {
        //         if (!namespaceCategory.all.some(c => c.key===namespace)) namespaceCategory.all.push({ key:namespace })
        //     }
        // }
        magnifyData.updateCategoryValues = (categoryName:string, action:string, value:string) => {
            let category = categories.find(c => c.key===categoryName)
            if (!category) return
            if (action==='DELETED') {
                category.all = category.all.filter(c => c.key !== value)
            }
            else {
                if (!category.all.some(c => c.key===value)) category.all.push({ key:value })
            }
        }

        return () => {
            // unmount actions
            // +++ we should add a 'destroy' action for deleting data in addition to unmount (when required)
            setMenuContainersAnchorParent(undefined)
        }
    }, [])

    const onContainerSelected = (channelId:string, file:IFileObject, container:string) => {
        setMenuContainersAnchorParent(undefined)
        if (container==='*all') {
            launchObjectExternal(channelId, [file], EInstanceConfigView.POD, undefined, undefined)
        }
        else {
            launchObjectExternal(channelId, [file], EInstanceConfigView.CONTAINER, undefined, container)
        }
    }

    const executeCustomAction = (ca:ICustomAction) => {
        let podJson = yamlParser.load(ca.podYaml)
        // custom actions
        sendCommand(EMagnifyCommand.APPLY, [ca.podYaml])
        let url = ca.url!
        if (ca.onReady=== 'http' || ca.onReady==='https') {
            // +++ test
            if (ca.forward) url='http://localhost:3000/kwirth/port-forward/pod/default/galaga/80'
            let id = window.setInterval( async () => {
                try {
                    let x = await fetch(url)
                    if (x.status>=200 && x.status<400) {
                        clearInterval(id)
                        setMsgBox(<></>)
                    }
                }
                catch(err){
                    console.log(err)
                }
            }, 1000)
            setMsgBox (MsgBoxWaitCancel('Launch Work',`We are waiting for the ${ca.name} work to start (waiting for... ${url})...`, setMsgBox, (a:MsgBoxButtons) => {
                if (a === MsgBoxButtons.Cancel) clearInterval(id)
            }))
        }
        else if (ca.onReady === 'shell') {
            let id = window.setInterval( async () => {
                try {
                    let pod = magnifyData.files.find(p => p.class==='Pod' && p.data.origin.metadata.namespace === (podJson.metadata.namespace || 'default') && p.data.origin.metadata.name === podJson.metadata.name)
                    if (pod) {
                        let status = pod.data.origin.status.phase
                        if (status === 'Running') {
                            clearInterval(id)
                            setMsgBox(<></>)
                            launchObjectExternal('ops',[pod],EInstanceConfigView.CONTAINER, undefined, pod.data.origin.spec.containers[0].name)
                        }
                    }
                }
                catch(err){
                    console.log(err)
                }
            }, 1000)
            setMsgBox (MsgBoxWaitCancel('Launch Work',`We are waiting for the ${ca.name} work to start (waiting for shell)...`, setMsgBox, (a:MsgBoxButtons) => {
                if (a=== MsgBoxButtons.Cancel) clearInterval(id)
            }))
        }
    }

    const onMenuKubeWorksSelected = (action:string) => {
        setMenuKubeWorksAnchorParent(undefined)
        let ca = magnifyData.userPreferences.customActions.find(ca => ca.name === action)
        if (!ca)
            sendCommand(EMagnifyCommand.POD, [ 'work', action])
        else
            executeCustomAction(ca)
    }

    const onMenuKwirthWorksSelected = (action:string) => {
        let ca = magnifyData.userPreferences.customActions.find(ca => ca.name === action)
        if (ca) executeCustomAction(ca)
    }

    // *********************************************************
    // General actions fro any type of object
    // *********************************************************

    const bringWindowToFront = (id: string) => {
        magnifyData.windows.forEach(w => w.atFront = false)
        const win = magnifyData.windows.find(w => w.id === id)
        if (win) {
            win.visible = true
            win.atFront = true
            setTick(t=>t+1)
            return
        }
    }

    const onWindowChange = (id:string, isMaximized:boolean, x:number,y:number,width:number,height:number) => {
        const existingWindow = magnifyData.windows.find(w => w.id === id)
        if (!existingWindow) return
        existingWindow.isMaximized = isMaximized
        existingWindow.x = x
        existingWindow.y = y
        existingWindow.width = width
        existingWindow.height = height
    }

    const launchObjectDetails = (p:string[], currentTarget?:Element) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))

        let sections = objectSections.get(f[0].data.origin.kind)!
        if (f[0].path.startsWith('/custom/') && !f[0].path.startsWith('/custom/CustomResourceDefinition/')) sections = objectSections.get('#crdInstance#')!

        let existingWin = magnifyData.windows.find(w => w.selectedFiles.find(x => x.path === f[0].path) && w.class==='ContentDetails')  
        if (existingWin) {
            bringWindowToFront(existingWin.id)
        }
        else {
            let spc = spaces.get(f[0].data.origin.kind)
            let win:IContentWindow = {
                id: 'details-' + f[0].path + '-' + uuid(),
                class: 'ContentDetails',
                visible: true,
                atTop: false,
                atFront: true,
                title: f[0].data.origin.metadata?.name,
                isMaximized: false,
                x: 100,
                y: 50,
                width: 800,
                height: 600,
                data: {
                    source: f[0],
                    path: f[0].path,
                    sections,
                    actions: spc && spc.leftItems? spc.leftItems : [],
                    onApply: onContentDetailsApply,
                    onAction: onContentDetailsAction,
                    onLink: onMagnifyObjectDetailsLink,
                    containerSelectionOptions: new Map([['log',2],['metrics',2],['fileman',2],['trivy',0],['ops',1],['evict',0],['cordon',0],['uncordon',0],['drain',0], ['scale',0], ['restart',0], ['trigger',0], ['suspend',0], ['resume',0]  ])
                } satisfies IDetailsData,
                selectedFiles: [f[0]],
                onWindowChange: onWindowChange,
                onMinimize: onWindowMinimize,
                onTop: onWindowTop,
                onClose: onWindowClose,
            }
            magnifyData.windows.push(win)
            setTick(t => t+1)
        }

        // we request a fresh events list
        if (f[0].data.origin.metadata) {
            // objects APIResource doesn't contain metadata
            if (f[0].data.events) delete f[0].data.events
            sendCommand(EMagnifyCommand.EVENTS, ['object', f[0].data.origin.metadata.namespace, f[0].data.origin.kind, f[0].data.origin.metadata.name])
        }
    }

    const launchObjectCreate = (kind:string) => {
        let template = (templates.get(kind) || `apiVersion: v1\nKind: ${kind}\nejemplo: true`).trim()
        let winId = 'create-' + kind + '-' + uuid()
        let win:IContentWindow = {
            id: winId,
            class: 'ContentEdit',
            visible: true,
            atTop: false,
            atFront: true,
            title: 'Create ' + kind,
            isMaximized: false,
            x: 100,
            y: 50,
            width: 800,
            height: 600,
            data: {
                isInitialized: false,
                allowEdit: true,
                onOk: (code: string, source?: IFileObject): void => {
                    sendCommand(EMagnifyCommand.APPLY, [code])
                    onWindowClose(winId)
                },
                code: template,
                oldCode: undefined
            } satisfies IContentEditData,
            onWindowChange: onWindowChange,
            onTop: onWindowTop,
            onMinimize: onWindowMinimize,
            onClose: onWindowClose,
            selectedFiles: []
        }
        magnifyData.windows.push(win)
        setTick(t => t+1)
    }

    const launchObjectDelete = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        if (f.length>0) {
            if (f[0].class==='Image') {  // we just check the class of the first selected item
                setMsgBox(MsgBoxYesNo('Delete '+f[0].data.origin.kind,<Box>Are you sure you want to delete image <b>{f[0].displayName}</b>{p.length>1?` (and other ${p.length-1} items)`:''} (take into account that removing images is an asynchronous process (a DaemonSet in fact) and may take up to 30 seconds)?</Box>, setMsgBox, (a) => {
                    if (a === MsgBoxButtons.Yes) {
                        sendCommand(EMagnifyCommand.IMAGE, ['delete',...f.map(image => image.data.origin.metadata.name)])
                    }
                }))
            }
            else {
                setMsgBox(MsgBoxYesNo('Delete '+f[0].data.origin.kind,<Box>Are you sure you want to delete {f[0].data.origin.kind}<b> {f[0].displayName}</b>{p.length>1?` (and other ${p.length-1} items)`:''}?</Box>, setMsgBox, (a) => {
                    if (a === MsgBoxButtons.Yes) {
                        sendCommand(EMagnifyCommand.DELETE, f.map(o => yamlParser.dump(o.data.origin, { indent: 2 })))
                    }
                }))
            }
        }
    }

    const launchObjectEdit = (p:string[]) => launchObjectEditOrBrowse(p, true)
    const launchObjectBrowse = (p:string[]) => launchObjectEditOrBrowse(p, false)

    const launchObjectEditOrBrowse = (p:string[], allowEdit:boolean) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        let wid = (allowEdit?'edit-':'browse-') + f[0].path + '-' + uuid()
        let win:IContentWindow = {
            id: wid,
            class: allowEdit? 'ContentEdit':'ContentBrowse',
            visible: true,
            atTop: false,
            atFront: true,
            title: (allowEdit?'Edit ':'Browse ')+f[0].name,
            isMaximized: false,
            x: 100,
            y: 50,
            width: 800,
            height: 600,
            data: {
                allowEdit,
                onOk: (code: string, source?: IFileObject): void => {
                    sendCommand(EMagnifyCommand.APPLY, [code])
                    onWindowClose(wid)
                },
                isInitialized: false,
                code: undefined,
                oldCode: undefined
            } satisfies IContentEditData,
            selectedFiles: [f[0]],
            onWindowChange: onWindowChange,
            onTop: onWindowTop,
            onMinimize: onWindowMinimize,
            onClose: onWindowClose,
        }
        magnifyData.windows.push(win)
        setTick(t => t+1)
    }

    const launchObjectExternal = (channel:string, files:IFileObject[], view: EInstanceConfigView, data:any, container: string|undefined ) => {
        let width = channel==='trivy'? window.innerWidth * 0.9 : 800
        let height = channel==='trivy'? window.innerHeight * 0.9 : 600
        let win:IContentWindow = {
            id: 'external-' + channel + '-' + uuid(),
            class: 'ContentExternal',
            visible: true,
            atTop: false,
            atFront: true,
            title: files[0].data.origin.metadata.name + (container || ''),
            isMaximized: false,
            x: 100,
            y: 50,
            width,
            height,
            data: {
                isInitialized: false,
                isElectron: props.channelObject.isElectron,
                channelObject: props.channelObject,
                settings: magnifyData.userPreferences,
                channelId: channel,
                contentView: view,
                frontChannels: props.channelObject.frontChannels!,
                onNotify: onComponentNotify,
                onRefresh: onContentExternalRefresh,
                options: channel === 'ops'?
                    { autostart:true, pauseable:false, stoppable:false, configurable:false, data }
                    :
                    { autostart:true, pauseable:true, stoppable:true, configurable:(channel!=='fileman'), data}
            } satisfies IContentExternalData,
            selectedFiles: files,
            container: container,
            onWindowChange: onWindowChange,
            onTop: onWindowTop,
            onMinimize: onWindowMinimize,
            onClose: onWindowClose,
        }
        magnifyData.windows.push(win)
        setTick(t => t+1)
    }

    const launchSearch = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        let selFiles=[]
        let scope
        if (p[0]==='/cluster/overview') {
            scope = ':cluster:'
            selFiles = magnifyData.files
        }
        else {
            scope = f[0].data.origin.metadata.name
            selFiles = magnifyData.files.filter(x => x.data?.origin?.metadata.namespace === f[0].data.origin.metadata.name)
        }
        let win:IContentWindow = {
            id: 'search-' + scope + '-' + uuid(),
            class: 'ArtifactSearch',
            visible: true,
            atTop: false,
            atFront: true,
            title: 'Search...',
            isMaximized: false,
            x: 100,
            y: 50,
            width: 800,
            height: 600,
            data: {
                scope: scope,
                selectedFiles: selFiles,
                onLink: onMagnifyObjectDetailsLink,
                searchText: '',
                includeStatus: false,
                merge: true,
                matchCase: false
            } satisfies IArtifactSearchData,
            selectedFiles: [f[0]],
            onWindowChange: onWindowChange,
            onTop: onWindowTop,
            onMinimize: onWindowMinimize,
            onClose: onWindowClose,
        }
        magnifyData.windows.push(win)
        setTick(t => t+1)
    }

    // *********************************************************
    // Specific actions for some objects
    // *********************************************************

    let spcClassOverview = spaces.get('classOverview')!
    setLeftItem(spcClassOverview, 'exit', 
        (p:string[], currentTarget:Element) => {
            setMsgBox(MsgBoxYesNo('Exit cluster', 'Are you sure you leave this cluster and go back to initial cluster selection?', setMsgBox, (b:MsgBoxButtons)=> {
                if (b === MsgBoxButtons.Yes) props.channelObject.exit?.()
            }))
        },
        (name:string,currentFolder:IFileObject, selectedItems:IFileObject[]) => props.channelObject.isElectron,
        (name:string,currentFolder:IFileObject, selectedItems:IFileObject[]) => true
    )
    setLeftItem(spcClassOverview, 'kwirthworks', (p:string[],
        currentTarget:Element) => setMenuKwirthWorksAnchorParent(currentTarget),
        () => true,
        () => magnifyData.userPreferences?.customActions && magnifyData.userPreferences.customActions.filter(ca => ca.type==='kwirth').length>0 )
    setLeftItem(spcClassOverview, 'kubeworks', (p:string[], currentTarget:Element) => setMenuKubeWorksAnchorParent(currentTarget) )

    // cluster actions
    const setClusterActions = () => {
            // Node
            let spcNode = spaces.get('Node')!
            setLeftItem(spcNode,'shell', launchNodeShell)
            setLeftItem(spcNode,'cordon', launchNodeCordon)
            setLeftItem(spcNode,'uncordon', launchNodeUnCordon)
            setLeftItem(spcNode,'drain', launchNodeDrain)

            // Namespace
            let spcNamespace = spaces.get('Namespace')!
            ;['log','metrics'].map(channelid => 
                setLeftItem(spcNamespace,channelid, (p:string[]) => {
                    let f = magnifyData.files.filter(f => p.includes(f.path))
                    launchObjectExternal(channelid, f, EInstanceConfigView.NAMESPACE, undefined, undefined)
                })
            )

            // Namespace
            let spcClassNamespace = spaces.get('classNamespace')!
            setLeftItem(spcClassNamespace, 'create', (p:string[]) => {
                setInputBoxResult ( () => (name:any) => {
                    if (name) {
                        let obj = `
                            apiVersion: 'v1'
                            kind: 'Namespace'
                            metadata:
                                name: ${name}
                        `
                        sendCommand(EMagnifyCommand.CREATE, [obj])
                    }
                })
                setInputBoxMessage('Enter namespace name')
                setInputBoxTitle('Create namespace')
            })
    }

    // workload actions
    const setPodActions = () => {
        const podGroupAction = (channelId:string, p:string[], currentTarget:Element) => {
            let f = magnifyData.files.filter(x => p.includes(x.path))
            if (f.length>1) {
                launchObjectExternal(channelId, f, EInstanceConfigView.POD, undefined, undefined)
            }
            else {
                setMenuContainersChannel(channelId)
                setMenuContainersFile(f[0])
                setMenuContainersIncludeAllContainers(true)
                setMenuContainersAnchorParent(currentTarget)
            }
        }

        const podSingleAction = (action:string, p:string[], currentTarget:Element) => {
            let f = magnifyData.files.filter(x => p.includes(x.path))
            setMenuContainersChannel(action)
            setMenuContainersFile(f[0])
            setMenuContainersIncludeAllContainers(false)
            setMenuContainersAnchorParent(currentTarget)
        }

        let spcPod = spaces.get('Pod')!
        // +++ setLeftItem(spcPod,'forward', (p:string[], currentTarget:Element) => {
        //     let f = magnifyData.files.filter(x => p.includes(x.path))
        //     setMenuContainersFile(f[0])
        //     setMenuContainersIncludeAllContainers(false)
        //     setMenuContainersAnchorParent(currentTarget)
        // })

        setLeftItem(spcPod,'log', (p:string[], currentTarget:Element) => podGroupAction('log', p, currentTarget))
        setLeftItem(spcPod,'metrics', (p:string[], currentTarget:Element) => podGroupAction('metrics', p, currentTarget))
        setLeftItem(spcPod,'ops', (p:string[], currentTarget:Element) => podSingleAction('ops', p, currentTarget))
        setLeftItem(spcPod,'fileman', (p:string[], currentTarget:Element) => podGroupAction('fileman', p, currentTarget))
        setLeftItem(spcPod,'trivy', (p:string[], currentTarget:Element) => podGroupAction('trivy', p, currentTarget))

        setLeftItem(spcPod,'evict', launchPodEvict)
    }

    const launchPodEvict = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        setMsgBox(MsgBoxYesNo('Delete '+f[0].data.origin.kind,<Box>Are you sure you want to evict {f[0].data.origin.kind} <b>{f[0].data.origin.metadata.name}</b>?</Box>, setMsgBox, (a) => {
            if (a === MsgBoxButtons.Yes) {
                f.map(pod => sendCommand(EMagnifyCommand.POD, [ 'evict', pod.data.origin.metadata.namespace, pod.data.origin.metadata.name]))
            }
        }))
    }

    // controller actions
    const setControllerActions = () => {
        // Deployment
        let spcDeployment = spaces.get('Deployment')!
        setPropertyFunction(spcDeployment, 'status', showListDeploymentStatus)
        setLeftItem(spcDeployment,'scale', launchControllerScale)
        setLeftItem(spcDeployment,'restart', launchControllerRestart)
        setLeftItem(spcDeployment,'log', launchControllerLogs)
        setLeftItem(spcDeployment,'metrics', launchControllerMetrics)

        // DaemonSet
        let spcDaemonSet = spaces.get('DaemonSet')!
        setLeftItem(spcDaemonSet,'restart', launchControllerRestart)
        setLeftItem(spcDaemonSet,'log', launchControllerLogs)
        setLeftItem(spcDaemonSet,'metrics', launchControllerMetrics)

        // ReplicaSet
        let spcReplicaSet = spaces.get('ReplicaSet')!
        setLeftItem(spcReplicaSet,'scale', launchControllerScale)
        setLeftItem(spcReplicaSet,'log', launchControllerLogs)
        setLeftItem(spcReplicaSet,'metrics', launchControllerMetrics)

        // ReplicationController
        let spcReplicationController = spaces.get('ReplicationController')!
        setLeftItem(spcReplicationController,'restart', launchControllerRestart)
        setLeftItem(spcReplicationController,'scale', launchControllerScale)
        setLeftItem(spcReplicationController,'log', launchControllerLogs)
        setLeftItem(spcReplicationController,'metrics', launchControllerMetrics)

        // StatefulSet
        let spcStatefulSet = spaces.get('StatefulSet')!
        setLeftItem(spcStatefulSet,'scale', launchControllerScale)
        setLeftItem(spcStatefulSet,'restart', launchControllerRestart)
        setLeftItem(spcStatefulSet,'log', launchControllerLogs)
        setLeftItem(spcStatefulSet,'metrics', launchControllerMetrics)

        let spcJob = spaces.get('Job')!
        setLeftItem(spcJob,'log', launchJobLogs)
        
        let spcCronJob = spaces.get('CronJob')!
        setLeftItem(spcCronJob,'trigger', launchCronJobTrigger)
        setLeftItem(spcCronJob,'suspend', launchCronJobSuspend)
        setLeftItem(spcCronJob,'resume', launchCronJobResume)
    }

    const setNetworkActions = () => {
        let spcIngressClass = spaces.get('IngressClass')!
        setLeftItem(spcIngressClass,'default', launchIngressClassDefault)
    }

    const showListDeploymentStatus = (p:any) => {
        let f = magnifyData.files.find(x => p===x.path)
        if (!f || !f.data?.origin?.status) return <></>
        let status='Stalled'
        if (f.data.origin?.status?.conditions && f.data.origin.status.conditions.length>0) {
            if (f.data.origin.status.conditions.some((c:any) => c.type+c.status ==='AvailableTrue') && f.data.origin.status.conditions.some((c:any) => c.type+c.status ==='ProgressingTrue')) status='Running'
            else if (f.data.origin.status.conditions.some((c:any) => c.type+c.status ==='AvailableFalse') && f.data.origin.status.conditions.some((c:any) => c.type+c.status ==='ProgressingTrue')) status='Scaling'
        }
        return <Typography color={status==='Running'?'green':(status==='Scaling'?'orange':'red')} variant='body2'>{status}</Typography>
    }

    const setCrdActions = () => {
        const onCrdInstantiate = (p:string[], currentTarget:Element) => {
            let f = magnifyData.files.filter(x => p.includes(x.path))
            if (f.length>=1) {
                let instance = generateMinimalFromCRD(f[0].data.origin)
                let winId = 'create-' + f[0].data.origin.spec.names.kind + '-' + uuid()
                let win:IContentWindow = {
                    id: winId,
                    class: 'ContentEdit',
                    visible: true,
                    atTop: false,
                    atFront: true,
                    title: 'Create ' + f[0].data.origin.spec.names.kind,
                    isMaximized: false,
                    x: 100,
                    y: 50,
                    width: 800,
                    height: 600,
                    data: {
                        isInitialized: false,
                        allowEdit: true,
                        onOk: (code: string, source?: IFileObject): void => {
                            sendCommand(EMagnifyCommand.APPLY, [code])
                            onWindowClose(winId)
                        },
                        code: instance,
                        oldCode: undefined
                    } satisfies IContentEditData,
                    onWindowChange: onWindowChange,
                    onTop: onWindowTop,
                    onMinimize: onWindowMinimize,
                    onClose: onWindowClose,
                    selectedFiles: []
                }
                magnifyData.windows.push(win)
                setTick(t => t+1)









            }
        }
        let spcCustomResourceDefinition = spaces.get('CustomResourceDefinition')!
        setLeftItem(spcCustomResourceDefinition,'instantiate', onCrdInstantiate)
    }

    // Controller actions
    const launchControllerRestart = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))

        if (f.length===1) {
            sendCommand(EMagnifyCommand.CONTROLLER, [ 'restart', f[0].data.origin.kind, f[0].data.origin.metadata.namespace, f[0].data.origin.metadata.name])
        }
    }

    const launchControllerScale = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))

        if (f.length===1) {
            setInputBoxResult ( () => (value:any) => {
                if (value) sendCommand(EMagnifyCommand.CONTROLLER, [ 'scale', f[0].data.origin.kind, f[0].data.origin.metadata.namespace, f[0].data.origin.metadata.name, value])
            })
            setInputBoxMessage('Enter scaling value')
            setInputBoxDefault(f[0].data.origin.spec.replicas)
            setInputBoxTitle('Scale '+f[0].data.origin.kind)
        }
    }

    const launchControllerLogs = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        launchObjectExternal('log', f, EInstanceConfigView.GROUP, undefined, undefined)
    }

    const launchControllerMetrics = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        // by default, we GROUP. User can change options in ContentExternal (after data is shown)
        launchObjectExternal('metrics', f, EInstanceConfigView.GROUP, undefined, undefined)
    }

    // Job actions
    const launchJobLogs = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        launchObjectExternal('log', f, EInstanceConfigView.GROUP, undefined, undefined)
    }

    // IngressClass actions
    const launchIngressClassDefault = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        f.map( one => sendCommand(EMagnifyCommand.INGRESSCLASS, [ 'default', one.data.origin.metadata.name]))
    }

    // Image actions
    // const launchImageDelete = (p:string[]) => {
    //     let f = magnifyData.files.filter(f => p.includes(f.path))
    //     setMsgBox(MsgBoxYesNo('Delete '+f[0].data.origin.kind,<Box>Are you sure you want to delete image <b>{f[0].displayName}</b>{p.length>1?` (and other ${p.length-1} items)`:''} (take into account that removing images is an asynchronous process and may take up to 30 seconds)?</Box>, setMsgBox, (a) => {
    //         if (a === MsgBoxButtons.Yes) {
    //             sendCommand(EMagnifyCommand.IMAGE, ['delete',...f.map(image => image.data.origin.metadata.name)])
    //         }
    //     }))
    // }

    // Node actions
    const launchNodeDrain = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        sendCommand(EMagnifyCommand.NODE, ['drain',f[0].data.origin.metadata.name])
    }

    const launchNodeShell = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        let podName = 'kwirth-node-shell'+'-'+f[0].name
        let podNamespace = 'default'
        sendCommand(EMagnifyCommand.NODE, ['shell', f[0].data.origin.metadata.name, podNamespace, podName])
        let id = window.setInterval( async () => {
            try {
                let pod = magnifyData.files.find(p => p.class==='Pod' && p.data.origin.metadata.namespace === podNamespace && p.data.origin.metadata.name === podName)
                if (pod) {
                    let status = pod.data.origin.status.phase
                    if (status === 'Running') {
                        clearInterval(id)
                        setMsgBox(<></>)
                        launchObjectExternal('ops',[pod],EInstanceConfigView.CONTAINER, { nodeShell: true }, pod.data.origin.spec.containers[0].name)
                    }
                }
            }
            catch(err){
                console.log(err)
            }
        }, 1000)
        setMsgBox (MsgBoxWaitCancel('Launch Work',`We are waiting for the node shell to start (pod '${podName}' on namespace '${podNamespace}' is starting)...`, setMsgBox, (a:MsgBoxButtons) => {
            if (a=== MsgBoxButtons.Cancel) clearInterval(id)
        }))

    }

    const launchNodeCordon = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        sendCommand(EMagnifyCommand.NODE, ['cordon', f[0].data.origin.metadata.name])
    }

    const launchNodeUnCordon = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        sendCommand(EMagnifyCommand.NODE, ['uncordon', f[0].data.origin.metadata.name])
    }

    // CronJob actions
    const launchCronJobTrigger = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        sendCommand(EMagnifyCommand.CRONJOB, ['trigger', f[0].data.origin.metadata.namespace, f[0].data.origin.metadata.name])
    }

    const launchCronJobSuspend = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        sendCommand(EMagnifyCommand.CRONJOB, ['suspend', f[0].data.origin.metadata.namespace, f[0].data.origin.metadata.name])
    }

    const launchCronJobResume = (p:string[]) => {
        let f = magnifyData.files.filter(x => p.includes(x.path))
        sendCommand(EMagnifyCommand.CRONJOB, ['resume', f[0].data.origin.metadata.namespace, f[0].data.origin.metadata.name])
    }

    const onFileManagerNavigate = (dest:string) => {
        fileManagerRef.current?.changeFolder(dest)
    }

    const sendCommand = (command: EMagnifyCommand, params:string[]) => {
        if (!props.channelObject.webSocket) return

        let magnifyMessage:IMagnifyMessage = {
            flow: EInstanceMessageFlow.REQUEST,
            action: EInstanceMessageAction.COMMAND,
            channel: props.channelObject.channelId,
            type: EInstanceMessageType.DATA,
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            id: uuid(),
            command: command,
            namespace: '',
            group: '',
            pod: '',
            container: '',
            params: params,
            msgtype: 'magnifymessage'
        }
        let payload = JSON.stringify( magnifyMessage )
        props.channelObject.webSocket.send(payload)
    }

    // FileManager handlers
    const onError = (error: IError, file: IFileObject) => {
        props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR, error.message)
    }

    const onFolderChange = (folder:string) => {
        magnifyData.currentPath = folder
    }

    const onMagnifyObjectDetailsLink = (kind:string, name:string, namespace:string) => {
        let path = buildPath(kind, name, namespace)
        if (path.startsWith('//')) {
            // this may be a CRD instance, since we found no top level category
            let crd = magnifyData.files.find(f => f.class==='crdInstance' && f.data.origin.metadata.name===name && f.data.origin.kind===kind)
            if (crd) {
                let crdiPath = `/custom/${kind}/`+name+(namespace? ':'+namespace : '')
                launchObjectDetails([crdiPath], undefined)
                return
            }
        }
        else {
            let f = magnifyData.files.find(f => f.path === path)
            if (f) {
                launchObjectDetails([f.path], undefined)
                return
            }
            else {
                // no found, we loook for special resources
                if (kind==='Image') {
                    let imgName = 'docker.io/library/'+name
                    if (name.includes('/')) imgName = 'docker.io/' + name
                    let f = magnifyData.files.find(f => f.class==='Image' && f.data.origin?.names?.includes(imgName))
                    if (f) {
                        launchObjectDetails([f.path], undefined)
                        return
                    }
                    // we now try to find an image with the same SHA
                    if (name.includes('@sha256:')) {
                        let x=name.indexOf('@sha256:')
                        let sha = name.substring(x).toLowerCase()
                        let f = magnifyData.files.find(f => f.class==='Image' && f.data.origin?.names?.some((img:string) => img.toLowerCase().endsWith(sha)))
                        if (f) {
                            launchObjectDetails([f.path], undefined)
                            return
                        }
                    }                  
                }
            }
        }
        setMsgBox(MsgBoxOkError('Object details',<Box>Image '<b>{name}</b>' has not been found on artifacts database. Maybe it exist but is stored with any kind of prefix</Box>, setMsgBox))
    }

    const onContentExternalRefresh = () => setTick(t=>t+1)

    const onWindowClose = (id:string) => {
        let index = magnifyData.windows.findIndex(w => w.id === id)
        if (index<0) return
        magnifyData.windows.splice(index, 1)
        //+++ correct this in order to: bring to front the highest window THAT IS NOT MINIMIZED (not just the last)
        if (magnifyData.windows.length>0) bringWindowToFront(magnifyData.windows[magnifyData.windows.length-1].id)
        setTick(t=>t+1)
    }

    const onWindowMinimize = (id:string) => {
        let win = magnifyData.windows.find(w => w.id===id)
        if (!win) return
        win.visible = false
        win.atFront = false
        setNewFrontWindow()
        setTick(t => t+1)
    }

    const onWindowTop = (id:string) => {
        let win = magnifyData.windows.find(w => w.id===id)
        if (!win) return
        win.atTop = !win.atTop
        setTick(t => t+1)
    }

    const setNewFrontWindow = () => {
        let lastWinOpen = undefined
        for (let win of magnifyData.windows)
            if (win.visible && !win.atFront && !win.atTop) lastWinOpen = win
        if (lastWinOpen) bringWindowToFront(lastWinOpen.id)
    }

    const onWindowRestore = (id:string) => {
        let win = magnifyData.windows.find(w => w.id===id)
        if (!win) return
        if (win.visible) {
            if (win.atFront) {
                win.visible = false
                win.atFront = false
                setNewFrontWindow()
            }
            else
                bringWindowToFront(win.id)
        }
        else {
            win.visible = true
            bringWindowToFront(win.id)
        }
        setTick(t => t+1)
    }

    const onContentDetailsApply = (path:string, obj:any) => {
        console.log(path, obj)
        sendCommand(EMagnifyCommand.APPLY, [yamlParser.dump(obj, { indent: 2 })])
    }

    // actions launched from the ContentDetails
    const onContentDetailsAction = (action:string, path:string, container?:string) => {
        let file = magnifyData.files.find(f => f.path === path)
        if (!file) return
        switch (action) {
            case 'delete':
                launchObjectDelete([path])
                break
            case 'edit':
                launchObjectEdit([path])
                break
            case 'browse':
                launchObjectBrowse([path])
                break
            case 'ops':
                launchObjectExternal('ops', [file], EInstanceConfigView.CONTAINER, undefined, container)
                break
            case 'log':
            case 'metrics':
            case 'fileman':
            case 'trivy':
                if (container==='*all') {
                    launchObjectExternal(action, [file], EInstanceConfigView.POD, undefined, undefined)
                }
                else {
                    launchObjectExternal(action, [file], EInstanceConfigView.CONTAINER, undefined, container)
                }
                break
            case 'evict':
                launchPodEvict([path])
                break
            // case 'forward':
            //     //+++launchPodForward([path], container)
            //     break
            case 'cordon':
                launchNodeCordon([path])
                break
            case 'uncordon':
                launchNodeUnCordon([path])
                break
            case 'drain':
                launchNodeDrain([path])
                break
            case 'scale':
                launchControllerScale([path])
                break
            case 'restart':
                launchControllerRestart([path])
                break
            case 'trigger':
                launchCronJobTrigger([path])
                break
            case 'suspend':
                launchCronJobSuspend([path])
                break
            case 'resume':
                launchCronJobResume([path])
                break
        }
        setTick(t => t+1)
    }

    const onComponentNotify = (channel:string|undefined, level: ENotifyLevel, msg: string)  => {
        msg = 'Channel message: '+ msg
        console.log(props.channelObject)
    }

    const getContentExternalIcon = (w:IContentWindow) => {
        // +++ optimize, we should not need to instantiate a channel for getting an icon
        let channelConstructor = props.channelObject.frontChannels!.get(w.data.channelId)!
        if (!channelConstructor) {
            console.log('Inexistent channel:', w.data.channelId)
            return <></>
        }
        else {
            let ch = new channelConstructor()
            return ch.getChannelIcon()
        }
    }

    const renderWindow = (w:IContentWindow, front:boolean, top:boolean) => {
        if (w.visible && w.atFront===front && w.atTop===top) {
            switch (w.class) {
                case 'ContentDetails':
                    return  <ContentDetails key={w.id} onFocus={() => bringWindowToFront(w.id)} {...w} />
                case 'ArtifactSearch':
                    return  <ArtifactSearch key={w.id} onFocus={() => bringWindowToFront(w.id)} {...w} />
                case 'ContentBrowse':
                case 'ContentEdit':
                    return  <ContentEdit key={w.id} onFocus={() => bringWindowToFront(w.id)} {...w} />
                case 'ContentExternal':
                    return  <ContentExternal key={w.id} onFocus={() => bringWindowToFront(w.id)} {...w}/>
                default:
                    console.error('Invalid window class:', w.class)
            }
        }
    }

    return <>
        { magnifyData.started &&
            <Box ref={magnifyBoxRef} sx={{ display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden', flexGrow:1, height: `${magnifyBoxHeight}px`, ml:1, mr:1, mt:1 }}>
                <FileManager
                    ref={fileManagerRef}
                    files={magnifyData.files}
                    spaces={spaces}
                    rightItems={rightItems}
                    actions={actions}
                    icons={icons}
                    initialPath={magnifyData.currentPath}
                    layout='list'
                    enableFilePreview={false}
                    onCreateFolder={undefined}
                    onError={onError}
                    onRename={undefined}
                    onPaste={undefined}
                    onDelete={undefined}
                    onFolderChange={onFolderChange}
                    onRefresh={undefined}
                    permissions={permissions}
                    filePreviewPath='http://avoid-console-error'
                    primaryColor='#1976d2'
                    fontFamily='Roboto, Helvetica, Arial, sans-serif'
                    height='100%'
                    className='custom-fm-magnify'
                    searchMode='auto'
                    searchRegex={true}
                    searchCasing={true}
                    showContextMenu={false}
                    showRefresh={false}
                    categories={categories}
                    maxNavigationPaneLevel={2}
                    minFileActionsLevel={2}
                    openMode='none'
                />
                {
                    menuContainersAnchorParent && <MenuContainers channel={menuContainersChannel} file={menuContainersFile} onClose={() => setMenuContainersAnchorParent(undefined)} onContainerSelected={onContainerSelected} anchorParent={menuContainersAnchorParent} includeAllContainers={menuContainersIncludeAllContainers} />
                }
                {
                    menuKubeWorksAnchorParent && <MenuKubeWorks onWorkSelected={onMenuKubeWorksSelected} onClose={() => setMenuKubeWorksAnchorParent(undefined)} anchorParent={menuKubeWorksAnchorParent} customActions={magnifyData.userPreferences.customActions}/>
                }
                {
                    menuKwirthWorksAnchorParent && <MenuKwirthWorks onWorkSelected={onMenuKwirthWorksSelected} onClose={() => setMenuKwirthWorksAnchorParent(undefined)} anchorParent={menuKwirthWorksAnchorParent} customActions={magnifyData.userPreferences.customActions}/>
                }
                {
                    notificationMenuAnchorParent && <MenuNotification anchorParent={notificationMenuAnchorParent} notifications={props.channelObject.notifications!} onRefresh={() => setTick((t) => t+1)} onClose={() => setNotificationMenuAnchorParent(undefined)} channels={props.channelObject.frontChannels!}/>
                }
                <Stack direction={'row'} sx={{mt:1}}>
                    {
                        magnifyData.windows.map((w) => {
                            let extContentTitle = w.title || 'notitle'
                            let extContentTitleShort = extContentTitle
                            if (extContentTitleShort.length>20) extContentTitleShort = extContentTitleShort.substring(0,10) + '...' + extContentTitleShort.substring(extContentTitleShort.length-10)
                            const icon = ICON_WINDOW[w.class] || (w.class === 'ContentExternal' ? getContentExternalIcon(w) : null);
                            const title = w.class === 'ContentDetails' ? extContentTitle : w.title;

                            return (
                                <Tooltip key={w.id} title={title}>
                                    <Button onClick={() => onWindowRestore(w.id)}>
                                        {icon}
                                        {extContentTitleShort}
                                    </Button>
                                </Tooltip>
                            );                                
                        })
                    }
                </Stack>
            </Box>
        }

        { msgBox }
        <InputBox title={inputBoxTitle} default={inputBoxDefault} message={inputBoxMessage} onClose={() => setInputBoxTitle(undefined)} onResult={inputBoxResult} width='300px' password={true}/>

        { magnifyData.windows.map((w) => renderWindow(w, false, false)) }
        { magnifyData.windows.map((w) => renderWindow(w, true, false)) }
        { magnifyData.windows.map((w) => renderWindow(w, false, true)) }
        { magnifyData.windows.map((w) => renderWindow(w, true, true)) }
    </>
}
export { MagnifyTabContent }