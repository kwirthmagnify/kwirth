import { IProviderDebugEvent, IProviderDebugProviderInfo } from '../common/ProviderDebugTypes'

export interface IProviderDebugData {
    /** eventos crudos recibidos, recortados a maxEvents */
    events: IProviderDebugEvent[]
    /** catalogue of running providers, exactly as the back end sends it when the instance starts */
    providers: IProviderDebugProviderInfo[]
    /** signals still to be shown as text: errors (provider down, invalid JSON...) */
    signals: string[]
    /** the core accepted the instance's configuration (the reply to the start) */
    configAccepted: boolean
    /** the channel confirmed the subscription to the provider */
    subscribed: boolean
    paused: boolean
    started: boolean
}

export class ProviderDebugData implements IProviderDebugData {
    events: IProviderDebugEvent[] = []
    providers: IProviderDebugProviderInfo[] = []
    signals: string[] = []
    configAccepted = false
    subscribed = false
    paused = false
    started = false
}
