import { useEffect, useRef, useState } from 'react'
import { IChannelObject } from '../IChannel'
import { EFilemanCommand, IFilemanMessage, IFilemanData } from './FilemanData'
import { Box, Typography } from '@mui/material'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@jfvilas/kwirth-common'
import { IError, IFileManagerHandle, IFileObject } from '@jfvilas/react-file-manager'
import { FileManager } from '@jfvilas/react-file-manager'
import { v4 as uuid } from 'uuid'
import { addGetAuthorization } from '../../tools/AuthorizationManagement'
import { MsgBoxOk } from '../../tools/MsgBox'
import { ENotifyLevel } from '../../tools/Global'
// @ts-ignore
import '@jfvilas/react-file-manager/dist/style.css'
// @ts-ignore
import './custom-fm-fileman.css'
import { getIconFromKind } from '../../tools/Constants-React'

interface IContentProps {
    webSocket?: WebSocket
    channelObject: IChannelObject
}

const FilemanTabContent: React.FC<IContentProps> = (props:IContentProps) => {
    const filemanBoxRef = useRef<HTMLDivElement | null>(null)
    const fileManagerRef = useRef<IFileManagerHandle>(null)
    const [logBoxTop, setLogBoxTop] = useState(0)
    const [msgBox, setMsgBox] =useState(<></>)

    let filemanData:IFilemanData = props.channelObject.data
    let permissions={
        create: true,
        delete: true,
        download: true,
        copy: true,
        move: true,
        rename: true,
        upload: true
    }

    useEffect( () => {
        filemanData.unlock = fileManagerRef.current?.unlock
    }, [fileManagerRef.current])

    let icons = new Map()
    icons.set('namespace', { open:getIconFromKind('Namespace', 18), closed:getIconFromKind('Namespace', 18), grid:getIconFromKind('Namespace', 50), list:getIconFromKind('Namespace', 18), default:getIconFromKind('Namespace', 18) })
    icons.set('pod', { open:getIconFromKind('Pod', 18), closed:getIconFromKind('Pod', 18), grid:getIconFromKind('Pod', 50), list:getIconFromKind('Pod', 18), default:getIconFromKind('Pod', 18) })
    icons.set('container', { open:getIconFromKind('Container', 18), closed:getIconFromKind('Container', 18), grid:getIconFromKind('Container', 44), list:getIconFromKind('Container', 16), default:getIconFromKind('Container', 16)})

    let actions = new Map()
    actions.set('namespace', [
        {
            title: 'Namespace details',
            icon: <Typography color='green' fontWeight={600}>V</Typography>,
            onClick: async (files : IFileObject[]) => {
                let namespace = files[0].name
                let data = await((await fetch(`${props.channelObject.clusterUrl}/config/${namespace}/groups`, addGetAuthorization(props.channelObject.accessString!))).json())
                let info = `Controllers inside ${namespace} namespace:<br/><br/>` + data.map((ns:any) => '<b>-</b> '+ ns.name + '<br/>').join('')
                setMsgBox(MsgBoxOk('Namespace info', info, setMsgBox))
            }
        },
    ])
    actions.set('file', [
        {
            title: 'File details',
            icon: <Typography color='blue' fontWeight={600}>D</Typography>,
            onClick: async (files : IFileObject[]) => {
                let info = `Details of file '${files[0].name}':<br/><br/><b>Name</b>: ${files[0].name}<br/><b>Path</b>: ${files[0].path}<br/><b>Last update</b>: ${files[0].data.updatedAt}<br/><b>Size (bytes)</b>: ${files[0].data.size}`
                setMsgBox(MsgBoxOk('File info', info, setMsgBox))
            }
        }
    ])


    let level = filemanData.currentPath.split('/').length - 1
    if (level<3) {
        permissions = {
            create: false,
            delete: false,
            download: false,
            copy: false,
            move: false,
            rename: false,
            upload: false
        }
    }

    useEffect(() => {
        if (filemanBoxRef.current) setLogBoxTop(filemanBoxRef.current.getBoundingClientRect().top)
    })

    interface IFileUploadConfig  { 
        url: string
        method?: "POST" | "PUT"
        headers?: { [key: string]: string }
    }

    let fileUploadConfig:IFileUploadConfig = {
        url: `${props.channelObject.clusterUrl}/${filemanData.ri}/channel/fileman/upload?key=${props.channelObject.instanceId}`,
        method:'POST',
        headers: {
            'Authorization': 'Bearer '+ props.channelObject.accessString
        }
    }

    const onDelete = (files: IFileObject[]) => {
        for (let file of files) {
            let [namespace,pod,container] = file.path.split('/').slice(1)
            filemanData.files = filemanData.files.filter(f => f.path !== file.path)
            sendCommand(EFilemanCommand.DELETE, namespace, pod, container, [file.path])
        }
    }

    const onCreateFolder = async (name: string, parentFolder: IFileObject) => {
        let [namespace,pod,container] = parentFolder.path.split('/').slice(1)
        sendCommand(EFilemanCommand.CREATE, namespace, pod, container, [parentFolder.path + '/' + name])
    }

    const onDownload = async (files: IFileObject[]) => {
        for (let file of files) {
            const url = `${props.channelObject.clusterUrl}/${filemanData.ri}/channel/fileman/download?key=${props.channelObject.instanceId}&filename=${file.path}`
            
            try {
                const response = await fetch(url, addGetAuthorization(props.channelObject.accessString || 'have-no-access-string'))

                if (response.ok) {
                    const blob = await response.blob()

                    const link = document.createElement('a')
                    link.href = URL.createObjectURL(blob)
                    link.download = file.path.split('/').slice(-1)[0]
                    if (file.isDirectory) link.download += '.tar.gz'
                    document.body.appendChild(link)
                    link.click()
                    document.body.removeChild(link)
                    URL.revokeObjectURL(link.href)
                }
                else {
                    console.error(`Error downloading file: ${file.path}`)
                    props.channelObject.notify?.(undefined, ENotifyLevel.ERROR, `Error downloading file ${file.path}: (${response.status}) ${await response.text()}`)
                }
            }
            catch (error) {
                console.error(`Error downloading file: ${file.path}`, error)
                props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR, `Error downloading file ${file.path}: ${error}`)
            }
        }
    }

    const onPaste = (files: IFileObject[], destFolder:IFileObject, operation:string) => {
        let command = operation==='move'? EFilemanCommand.MOVE : EFilemanCommand.COPY
        for (let file of files) {
            let [namespace,pod,container] = file.path.split('/').slice(1)
            sendCommand(command, namespace, pod, container, [file.path, destFolder.path])
        }        
    }

    const onError = (error: IError, file: IFileObject) => {
        props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR, error.message)
    }

    const onRename	= (file: IFileObject, newName: string) => {
        let [namespace,pod,container] = file.path.split('/').slice(1)
        filemanData.files = filemanData.files.filter (f => f.path!==file.path)
        sendCommand(EFilemanCommand.RENAME, namespace, pod, container, [file.path, newName])
    }

    const onRefresh = () => {
        if (level >= 3) {
            filemanData.files = filemanData.files.filter ( f => !f.path.startsWith(filemanData.currentPath+'/'))
            getLocalDir(filemanData.currentPath+'/')
        }
        else {
            sendCommand(EFilemanCommand.HOME, '', '', '', [])
        }

    }

    const sendCommand = (command: EFilemanCommand, namespace:string, pod:string, container:string,  params:string[]) => {
        if (!props.channelObject.webSocket) return
        
        let filemanMessage:IFilemanMessage = {
            flow: EInstanceMessageFlow.REQUEST,
            action: EInstanceMessageAction.COMMAND,
            channel: 'fileman',
            type: EInstanceMessageType.DATA,
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            id: uuid(),
            command: command,
            namespace: namespace,
            group: '',
            pod: pod,
            container: container,
            params: params,
            msgtype: 'filemanmessage'
        }
        let payload = JSON.stringify( filemanMessage )
        props.channelObject.webSocket.send(payload)
    }

    const getLocalDir = (folder:string) => {
        let [namespace,pod,container] = folder.split('/').slice(1)
        let filemanMessage:IFilemanMessage = {
            flow: EInstanceMessageFlow.REQUEST,
            action: EInstanceMessageAction.COMMAND,
            channel: 'fileman',
            type: EInstanceMessageType.DATA,
            accessKey: props.channelObject.accessString!,
            instance: props.channelObject.instanceId,
            id: uuid(),
            command: EFilemanCommand.DIR,
            namespace: namespace,
            group: '',
            pod: pod,
            container: container,
            params: [folder],
            msgtype: 'filemanmessage'
        }
        let payload = JSON.stringify( filemanMessage )
        if (props.channelObject.webSocket) props.channelObject.webSocket.send(payload)
    }

    const onFolderChange = (folder:string) => {
        filemanData.currentPath = folder
        folder +='/'
        let level = folder.split('/').length - 1
        if (level > 3) {
            fileManagerRef.current?.lock()
            getLocalDir(folder)
        }
    }

    const onFileUploading = (file: IFileObject, parentFolder: IFileObject) => { 
        return { filename: filemanData.currentPath + '/' + file.name }
    }

    const onFileUploaded = () => { 
    }

    const onFileUploadError = (file: IFileObject, parentFolder: IFileObject) => { 
        return { filename: filemanData.currentPath + '/' + file.name }
    }

    return <>
        { filemanData.started &&
            <Box ref={filemanBoxRef} sx={{ display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden', flexGrow:1, height: `calc(100vh - ${logBoxTop}px - 16px)`, paddingLeft: '5px', paddingRight:'5px', marginTop:'8px'}}>
                <FileManager
                    ref={fileManagerRef}
                    files={filemanData.files}
                    actions={actions}
                    icons={icons}
                    initialPath={filemanData.currentPath}
                    enableFilePreview={false}
                    onCreateFolder={onCreateFolder}
                    onError={onError}
                    onRename={onRename}
                    onPaste={onPaste}
                    onDelete={onDelete}
                    onFolderChange={onFolderChange}
                    onRefresh={onRefresh}
                    onFileUploading={onFileUploading}
                    onFileUploaded={onFileUploaded}
                    onFileUploadError={onFileUploadError}
                    onDownload={onDownload}
                    permissions={permissions}
                    fileUploadConfig={fileUploadConfig}
                    filePreviewPath='http://avoid-console-error'
                    primaryColor='#1976d2'
                    fontFamily='Roboto, Helvetica, Arial, sans-serif'
                    height='100%'
                    className='custom-fm-fileman'
                    searchMode='auto'
                    showBreadcrumb={true}
                    maxNavigationPaneLevel={3}
                    minFileActionsLevel={3}
                    openMode='none'
                />
                { msgBox }
            </Box>
        }
    </>
}
export { FilemanTabContent }