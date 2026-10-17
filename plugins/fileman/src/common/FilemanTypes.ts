import { IExtensionScope, IInstanceMessage } from "@kwirthmagnify/kwirth-common"

/*
    The RBAC scopes File Manager declares. Three, because the channel does three separable things and
    being able to do one says nothing about the others: opening a container's tree is not reading its
    files, and reading them is not rewriting them.

    They were missing until 2026-10-17, and the absence was not only cosmetic. The ladder existed and
    the endpoints never consulted it, so anybody who could open the channel could write anywhere; and
    since there was no catalogue, nobody could be GRANTED 'fileman$read' either, so the only people who
    could open File Manager at all were 'cluster' and 'admin'. Declaring the catalogue is what makes the
    three grantable, and therefore what makes the gates mean something.
*/
export enum EFilemanScope {
    USER = 'fileman$user',
    READ = 'fileman$read',
    WRITE = 'fileman$write'
}

export const FILEMAN_SCOPES: IExtensionScope[] = [
    { scope: EFilemanScope.USER,  label: 'File Manager · User',  description: 'Open File Manager and browse a container filesystem' },
    { scope: EFilemanScope.READ,  label: 'File Manager · Read',  description: 'Open and download files' },
    { scope: EFilemanScope.WRITE, label: 'File Manager · Write', description: 'Create, edit, rename, move, copy, delete and upload files' }
]

/*
    Ladder: a higher scope grants the lower ones, and a scope the ladder does not know is -1 (indexOf),
    so it grants nothing.

    'cluster' and 'admin' stay ABOVE write on purpose: they are the only ones who can open File Manager
    today —there was no way to grant the others— and dropping them would lock out every current user the
    day this ships. It is the risk §5 of plans/completed/channel-start-rbac/PLAN.md warns about.
*/
export const FILEMAN_SCOPE_LADDER: string[] = ['', EFilemanScope.USER, EFilemanScope.READ, EFilemanScope.WRITE, 'cluster', 'admin']

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
