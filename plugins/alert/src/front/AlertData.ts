import { EAlertSeverity } from "./AlertTypes"
import { EInstanceMessageType } from "@kwirthmagnify/kwirth-common"

export interface FiredAlert {
    timestamp: number
    severity: EAlertSeverity
    text: string
    namespace?: string
    group?: string
    pod?: string
    container?: string
    type?: string
}

export interface IAlertData {
    firedAlerts: FiredAlert[]
    paused: boolean
    started: boolean
}

export class AlertData implements IAlertData {
    firedAlerts: FiredAlert[] = []
    paused = false
    started = false
}
