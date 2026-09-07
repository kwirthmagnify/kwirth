import { IProviderDebugEvent, IProviderDebugProviderInfo } from '../common/ProviderDebugTypes'

export interface IProviderDebugData {
    /** eventos crudos recibidos, recortados a maxEvents */
    events: IProviderDebugEvent[]
    /** catálogo de providers en marcha, tal cual lo manda el back al arrancar la instancia */
    providers: IProviderDebugProviderInfo[]
    /** señales del canal (suscripción ok, provider inexistente, JSON inválido...) */
    signals: string[]
    paused: boolean
    started: boolean
}

export class ProviderDebugData implements IProviderDebugData {
    events: IProviderDebugEvent[] = []
    providers: IProviderDebugProviderInfo[] = []
    signals: string[] = []
    paused = false
    started = false
}
