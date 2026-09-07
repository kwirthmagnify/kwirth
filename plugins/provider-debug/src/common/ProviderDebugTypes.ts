import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

/**
 * Naturaleza del mensaje que el back del canal manda al front. El canal no interpreta
 * los eventos de provider, así que solo hay dos cosas que puede enviar: el catálogo de
 * providers a los que se puede enganchar, y los eventos tal cual llegan.
 */
export enum EProviderDebugPayload {
    PROVIDERS = 'providers',
    EVENT = 'event'
}

/**
 * Ayuda de suscripción que publica un provider. Es un espejo de IProviderSubscriptionHelp de
 * kwirth-common-back: se redeclara aquí porque este tipo también viaja al front por websocket, y
 * porque el método es OPCIONAL — un provider que no lo implemente simplemente no manda nada.
 */
export interface IProviderDebugSubscriptionField {
    name: string
    type: 'string' | 'number' | 'boolean' | 'string[]'
    required?: boolean
    description: string
}

export interface IProviderDebugSubscriptionHelp {
    usage: string
    example: Record<string, unknown>
    fields?: IProviderDebugSubscriptionField[]
}

/** Un provider vivo en el core, tal y como lo ve el canal. */
export interface IProviderDebugProviderInfo {
    id: string
    providesRouter: boolean
    routerAlias?: string
    /** presente solo si el provider implementa getSubscriptionHelp() */
    help?: IProviderDebugSubscriptionHelp
}

/**
 * Estado de un provider en la lista del setup. Lo dice GET /core/providers, que es la vista
 * completa del core: instalados + los de core, cada uno con si está vivo y con su ayuda de
 * suscripción. UNKNOWN solo aparece si ese endpoint no responde y hay que tirar del catálogo que
 * manda el canal por websocket.
 */
export enum EProviderDebugProviderState {
    RUNNING = 'running',          // instanciado y arrancado en el core
    NOT_RUNNING = 'notRunning',   // conocido, pero ningún canal lo requiere: suscribirse fallará
    UNKNOWN = 'unknown'           // el endpoint no respondió; no se sabe
}

/** Una entrada de la Select del setup: el provider más lo que sabemos de él. */
export interface IProviderDebugProviderOption {
    id: string
    state: EProviderDebugProviderState
    help?: IProviderDebugSubscriptionHelp
}

/** Una fila de GET /core/providers, con solo lo que a este plugin le interesa. */
export interface IProviderDebugCatalogueEntry {
    id: string
    running?: boolean
    core?: boolean
    subscriptionHelp?: IProviderDebugSubscriptionHelp
}

/** Un evento tal y como llegó a processProviderEvent, sin transformar. */
export interface IProviderDebugEvent {
    ts: number
    providerId: string
    event: unknown
}

export interface IProviderDebugMessageResponse extends IInstanceMessage {
    msgtype: 'providerdebugmessageresponse'
    payloadType: EProviderDebugPayload
    /** presente cuando payloadType === PROVIDERS */
    providers?: IProviderDebugProviderInfo[]
    /** presente cuando payloadType === EVENT */
    event?: IProviderDebugEvent
}

export interface IProviderDebugInstanceConfig {
    /** id del provider al que se suscribe la instancia; vacío = todavía ninguno */
    providerId: string
    /** payload de suscripción en crudo (JSON tecleado por el usuario); vacío = {} */
    subscriptionData: string
}
