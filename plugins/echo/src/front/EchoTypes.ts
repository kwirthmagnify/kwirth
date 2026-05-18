import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

export interface IEchoMessage extends IInstanceMessage {
    msgtype: 'echomessage'
    namespace: string
    pod: string
    container: string
    text: string
}

export interface IEchoMessageResponse extends IInstanceMessage {
    msgtype: 'echomessageresponse'
    text: string
}

export interface IEchoInstanceConfig {
    interval: number
}
