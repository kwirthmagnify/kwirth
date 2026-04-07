import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"
import { IFileObject } from "@jfvilas/react-file-manager"

export interface IFilemanData {
    paused: boolean
    started: boolean
    files: IFileObject[]
    currentPath: string
    ri: string|undefined
    unlock?: () => void
}

export class FilemanData implements IFilemanData {
    paused = false
    started = false
    files = []
    currentPath = '/'
    ri = undefined
}

export enum EFilemanCommand {
    HOME = 'home',
    DIR = 'dir',
    CREATE = 'create',
    RENAME = 'rename',
    DELETE = 'delete',
    MOVE = 'move',
    COPY = 'copy',
    UPLOAD = 'upload',
    DOWNLOAD = 'download'
}

export interface IFilemanMessage extends IInstanceMessage {
    msgtype: 'filemanmessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: EFilemanCommand
    params?: string[]
}

export interface IFilemanMessageResponse extends IInstanceMessage {
    msgtype: 'filemanmessageresponse'
    id: string
    command: EFilemanCommand
    namespace: string
    group: string
    pod: string
    container: string
    data?: any
}
