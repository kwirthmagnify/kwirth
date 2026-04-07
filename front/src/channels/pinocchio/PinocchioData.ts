import { IInstanceMessage } from "@kwirthmagnify/kwirth-common"

export interface IPinocchioMessage extends IInstanceMessage {
    msgtype: 'pinocchiomessageresponse'
    namespace: string
    pod: string
    container: string
    text: string
}

export interface IPinocchioData {
    lines: string[]
    paused:boolean
    started:boolean
}

export class PinocchioData implements IPinocchioData {
    lines: string[] = []
    paused = false
    started = false
}
