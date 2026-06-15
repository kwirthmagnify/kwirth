import React, { useEffect, useRef, useState } from 'react'
import { IChannelObject, ENotifyLevel, MsgBoxOk } from '@kwirthmagnify/kwirth-common-front'
import { EFilemanCommand, IFilemanMessage, IFilemanData } from './FilemanData'
import { Box } from '@mui/material'
import { AccountTree, Edit, InfoOutlined, Visibility, AccountTreeOutlined, HexagonOutlined, DataObjectOutlined } from '@mui/icons-material'
import { EInstanceMessageAction, EInstanceMessageFlow, EInstanceMessageType } from '@kwirthmagnify/kwirth-common'
import { IError, IFileManagerHandle, IFileObject } from '@jfvilas/react-file-manager'
import { FileManager } from '@jfvilas/react-file-manager'
import { v4 as uuid } from 'uuid'
import { FileEditDialog } from './FileEditDialog'

// ─── Inline auth helpers ────────────────────────────────────────────────────
const addGetAuthorization = (accessString: string) => ({
    headers: { 'Authorization': 'Bearer ' + accessString }
})
const addPostAuthorization = (accessString: string, body: string) => ({
    method: 'POST' as const,
    headers: { 'Authorization': 'Bearer ' + accessString, 'Content-Type': 'application/json' },
    body
})

// ─── Inline icons for K8s kinds ────────────────────────────────────────────
const makeIcon = (kind: string, size: number): JSX.Element => {
    const sx = { fontSize: size }
    if (kind === 'Namespace') return <AccountTreeOutlined sx={sx} />
    if (kind === 'Pod') return <HexagonOutlined sx={sx} />
    if (kind === 'Container') return <DataObjectOutlined sx={sx} />
    return <HexagonOutlined sx={sx} />
}

interface IContentProps {
    webSocket?: WebSocket
    channelObject: IChannelObject
}

const FilemanTabContent: React.FC<IContentProps> = (props: IContentProps) => {
    const filemanBoxRef = useRef<HTMLDivElement | null>(null)
    const fileManagerRef = useRef<IFileManagerHandle>(null)
    const [logBoxTop, setLogBoxTop] = useState(0)
    const [msgBox, setMsgBox] = useState(<></>)
    const [editDialog, setEditDialog] = useState<React.ReactNode>(null)

    let filemanData: IFilemanData = props.channelObject.data
    let permissions = { create: true, delete: true, download: true, copy: true, move: true, rename: true, upload: true }

    useEffect(() => {
        filemanData.unlock = fileManagerRef.current?.unlock
    }, [fileManagerRef.current])

    let icons = new Map()
    icons.set('namespace', { open: makeIcon('Namespace', 24), closed: makeIcon('Namespace', 24), grid: makeIcon('Namespace', 50), list: makeIcon('Namespace', 24), default: makeIcon('Namespace', 24) })
    icons.set('pod', { open: makeIcon('Pod', 24), closed: makeIcon('Pod', 24), grid: makeIcon('Pod', 50), list: makeIcon('Pod', 24), default: makeIcon('Pod', 24) })
    icons.set('container', { open: makeIcon('Container', 24), closed: makeIcon('Container', 24), grid: makeIcon('Container', 44), list: makeIcon('Container', 24), default: makeIcon('Container', 24) })

    let actions = new Map()
    actions.set('namespace', [
        {
            title: 'Namespace details',
            icon: <AccountTree fontSize='small' color='success' />,
            onClick: async (files: IFileObject[]) => {
                let namespace = files[0].name
                let data = await ((await fetch(`${props.channelObject.clusterUrl}/config/${namespace}/groups`, addGetAuthorization(props.channelObject.accessString!))).json())
                let info = `Controllers inside ${namespace} namespace:<br/><br/>` + data.map((ns: any) => '<b>-</b> ' + ns.name + '<br/>').join('')
                setMsgBox(MsgBoxOk('Namespace info', info, setMsgBox))
            }
        },
    ])

    const fetchFileContent = async (file: IFileObject): Promise<string | null> => {
        const url = `${props.channelObject.clusterUrl}/${filemanData.ri}/channel/fileman/read?key=${props.channelObject.instanceId}&filename=${encodeURIComponent(file.path)}`
        const response = await fetch(url, addGetAuthorization(props.channelObject.accessString || ''))
        if (!response.ok) {
            props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR, `Cannot read file ${file.path}: (${response.status}) ${await response.text()}`)
            return null
        }
        return response.text()
    }

    actions.set('file', [
        {
            title: 'File details',
            icon: <InfoOutlined fontSize='small' color='info' />,
            onClick: async (files: IFileObject[]) => {
                let info = `Details of file '${files[0].name}':<br/><br/><b>Name</b>: ${files[0].name}<br/><b>Path</b>: ${files[0].path}<br/><b>Last update</b>: ${files[0].data.updatedAt}<br/><b>Size (bytes)</b>: ${files[0].data.size}`
                setMsgBox(MsgBoxOk('File info', info, setMsgBox))
            }
        },
        {
            title: 'View file',
            icon: <Visibility fontSize='small' color='action' />,
            onClick: async (files: IFileObject[]) => {
                const file = files[0]
                try {
                    const content = await fetchFileContent(file)
                    if (content === null) return
                    setEditDialog(<FileEditDialog filename={file.path} content={content} readOnly onSave={async () => { }} onClose={() => setEditDialog(null)} />)
                } catch (error) {
                    props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR, `Error reading file ${file.path}: ${error}`)
                }
            }
        },
        {
            title: 'Edit file',
            icon: <Edit fontSize='small' color='primary' />,
            onClick: async (files: IFileObject[]) => {
                const file = files[0]
                try {
                    const content = await fetchFileContent(file)
                    if (content === null) return
                    const onSave = async (newContent: string) => {
                        const writeUrl = `${props.channelObject.clusterUrl}/${filemanData.ri}/channel/fileman/write?key=${props.channelObject.instanceId}&filename=${encodeURIComponent(file.path)}`
                        const res = await fetch(writeUrl, addPostAuthorization(props.channelObject.accessString || '', JSON.stringify({ content: newContent })))
                        if (!res.ok) {
                            props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR, `Cannot write file ${file.path}: (${res.status}) ${await res.text()}`)
                            throw new Error(`Write failed: ${res.status}`)
                        }
                        const entry = filemanData.files.find(f => f.path === file.path)
                        if (entry?.data) {
                            entry.data.size = new Blob([newContent]).size
                            entry.data.updatedAt = new Date().toISOString()
                        }
                    }
                    setEditDialog(<FileEditDialog filename={file.path} content={content} onSave={onSave} onClose={() => setEditDialog(null)} />)
                } catch (error) {
                    props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR, `Error reading file ${file.path}: ${error}`)
                }
            }
        }
    ])

    let level = filemanData.currentPath.split('/').length - 1
    if (level < 3) {
        permissions = { create: false, delete: false, download: false, copy: false, move: false, rename: false, upload: false }
    }

    useEffect(() => {
        if (filemanBoxRef.current) setLogBoxTop(filemanBoxRef.current.getBoundingClientRect().top)
    })

    interface IFileUploadConfig {
        url: string
        method?: 'POST' | 'PUT'
        headers?: { [key: string]: string }
    }

    let fileUploadConfig: IFileUploadConfig = {
        url: `${props.channelObject.clusterUrl}/${filemanData.ri}/channel/fileman/upload?key=${props.channelObject.instanceId}`,
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + props.channelObject.accessString }
    }

    const onDelete = (files: IFileObject[]) => {
        for (let file of files) {
            let [namespace, pod, container] = file.path.split('/').slice(1)
            filemanData.files = filemanData.files.filter(f => f.path !== file.path)
            sendCommand(EFilemanCommand.DELETE, namespace, pod, container, [file.path])
        }
    }

    const onCreateFolder = async (name: string, parentFolder: IFileObject) => {
        let [namespace, pod, container] = parentFolder.path.split('/').slice(1)
        sendCommand(EFilemanCommand.CREATE, namespace, pod, container, [parentFolder.path + '/' + name])
    }

    const onDownload = async (files: IFileObject[]) => {
        for (let file of files) {
            const url = `${props.channelObject.clusterUrl}/${filemanData.ri}/channel/fileman/download?key=${props.channelObject.instanceId}&filename=${file.path}`
            try {
                const response = await fetch(url, addGetAuthorization(props.channelObject.accessString || ''))
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
                } else {
                    props.channelObject.notify?.(undefined, ENotifyLevel.ERROR, `Error downloading file ${file.path}: (${response.status}) ${await response.text()}`)
                }
            } catch (error) {
                props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR, `Error downloading file ${file.path}: ${error}`)
            }
        }
    }

    const onPaste = (files: IFileObject[], destFolder: IFileObject, operation: string) => {
        let command = operation === 'move' ? EFilemanCommand.MOVE : EFilemanCommand.COPY
        for (let file of files) {
            let [namespace, pod, container] = file.path.split('/').slice(1)
            sendCommand(command, namespace, pod, container, [file.path, destFolder.path])
        }
    }

    const onError = (error: IError, _file: IFileObject) => {
        props.channelObject.notify?.(props.channelObject.channelId, ENotifyLevel.ERROR, error.message)
    }

    const onRename = (file: IFileObject, newName: string) => {
        let [namespace, pod, container] = file.path.split('/').slice(1)
        filemanData.files = filemanData.files.filter(f => f.path !== file.path)
        sendCommand(EFilemanCommand.RENAME, namespace, pod, container, [file.path, newName])
    }

    const onRefresh = () => {
        if (level >= 3) {
            filemanData.files = filemanData.files.filter(f => !f.path.startsWith(filemanData.currentPath + '/'))
            getLocalDir(filemanData.currentPath + '/')
        } else {
            sendCommand(EFilemanCommand.HOME, '', '', '', [])
        }
    }

    const sendCommand = (command: EFilemanCommand, namespace: string, pod: string, container: string, params: string[]) => {
        if (!props.channelObject.webSocket) return
        let filemanMessage: IFilemanMessage = {
            flow: EInstanceMessageFlow.REQUEST, action: EInstanceMessageAction.COMMAND, channel: 'fileman',
            type: EInstanceMessageType.DATA, accessKey: props.channelObject.accessString!, instance: props.channelObject.instanceId,
            id: uuid(), command, namespace, group: '', pod, container, params, msgtype: 'filemanmessage'
        }
        props.channelObject.webSocket.send(JSON.stringify(filemanMessage))
    }

    const getLocalDir = (folder: string) => {
        let [namespace, pod, container] = folder.split('/').slice(1)
        let filemanMessage: IFilemanMessage = {
            flow: EInstanceMessageFlow.REQUEST, action: EInstanceMessageAction.COMMAND, channel: 'fileman',
            type: EInstanceMessageType.DATA, accessKey: props.channelObject.accessString!, instance: props.channelObject.instanceId,
            id: uuid(), command: EFilemanCommand.DIR, namespace, group: '', pod, container, params: [folder], msgtype: 'filemanmessage'
        }
        if (props.channelObject.webSocket) props.channelObject.webSocket.send(JSON.stringify(filemanMessage))
    }

    const onFolderChange = (folder: string) => {
        filemanData.currentPath = folder
        folder += '/'
        let level = folder.split('/').length - 1
        if (level > 3) {
            fileManagerRef.current?.lock()
            getLocalDir(folder)
        }
    }

    const onFileUploading = (file: IFileObject, _parentFolder: IFileObject) => {
        return { filename: filemanData.currentPath + '/' + file.name }
    }

    const onFileUploaded = () => { }

    const onFileUploadError = (file: IFileObject, _parentFolder: IFileObject) => {
        return { filename: filemanData.currentPath + '/' + file.name }
    }

    return <>
        {filemanData.started &&
            <Box ref={filemanBoxRef} sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', flexGrow: 1, height: `calc(100vh - ${logBoxTop}px - 16px)`, px: 0.625, mt: 1 }}>
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
                {msgBox}
                {editDialog}
            </Box>
        }
    </>
}

export { FilemanTabContent }
