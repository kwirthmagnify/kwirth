import { IProviderDebugEvent, IProviderDebugProviderInfo } from '../common/ProviderDebugTypes'

export interface IProviderDebugData {
    /** eventos crudos recibidos, recortados a maxEvents */
    events: IProviderDebugEvent[]
    /** catálogo de providers en marcha, tal cual lo manda el back al arrancar la instancia */
    providers: IProviderDebugProviderInfo[]
    /** señales que quedan por mostrar como texto: errores (provider caído, JSON inválido...) */
    signals: string[]
    /** el core aceptó la configuración de la instancia (respuesta al start) */
    configAccepted: boolean
    /** el canal confirmó la suscripción al provider */
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
