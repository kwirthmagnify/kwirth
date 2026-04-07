import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export enum ETrivyCommand {
    RESCAN = 'rescan'
}

export interface ITrivyMessage extends IInstanceMessage {
    msgtype: 'trivymessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: ETrivyCommand
    params?: string[]
}

export interface ITrivyMessageResponse extends IInstanceMessage {
    msgtype: 'trivymessageresponse'
    id: string
    namespace: string
    group: string
    pod: string
    container: string
    msgsubtype?: string
    data?: any
}

export interface IUnknown {
    name: string
    namespace: string
    container: string
    statusCode: number
    statusMessage: string
}

export interface IKnown {
    name: string
    namespace: string
    container: string
    report: any
}
