import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export interface OpsConfig {
}

export enum EOpsCommand {
    DESCRIBE = 'describe',
    EXECUTE = 'execute',
    RESTART = 'restart',
    RESTARTPOD = 'restartpod',
    RESTARTNS = 'restartns'
}

export interface IOpsMessage extends IInstanceMessage {
    msgtype: 'opsmessage'
    id: string
    accessKey: string
    instance: string
    namespace: string
    group: string
    pod: string
    container: string
    command: EOpsCommand
    params?: string[]
}

export interface IOpsMessageResponse extends IInstanceMessage {
    msgtype: 'opsmessageresponse'
    id: string
    command: EOpsCommand
    namespace: string
    group: string
    pod: string
    container: string
    data?: any
}

export interface IOpsInstanceConfig {
    sessionKeepAlive: boolean
}

