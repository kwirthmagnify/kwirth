import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

/**
 * Nature of the message the channel.s back end sends the front end. The channel does not interpret
 * provider events, so there are only two things it can send: the catalogue of providers it can hook
 * onto, and the events exactly as they arrive.
 */
export enum EProviderDebugPayload {
    PROVIDERS = 'providers',
    EVENT = 'event'
}

/**
 * Subscription help a provider publishes. It mirrors IProviderSubscriptionHelp from
 * kwirth-common-back: it is redeclared here because this type also travels to the front end over the
 * websocket, and because the method is OPTIONAL — a provider that does not implement it sends nothing.
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

/** A producer alive in the core (provider or pluvider), exactly as the channel sees it. */
export interface IProviderDebugProviderInfo {
    id: string
    providesRouter: boolean
    routerAlias?: string
    /** present only when the producer implements getSubscriptionHelp() */
    help?: IProviderDebugSubscriptionHelp
    /**
     * true when it is not a provider but a PLUVIDER: a plugin that also produces and exposes its
     * information in-process. Its id carries the 'plugin:' prefix and it cannot be installed or
     * uninstalled separately — it goes with its plugin.
     */
    pluvider?: boolean
    /** What it produces, in one line. Only pluviders carry it (from their getPluviderData). */
    description?: string
}

/**
 * State of a provider in the setup.s list. GET /core/providers says it, and that is the core.s
 * complete view: installed ones plus the core.s own, each with whether it is alive and with its
 * subscription help. UNKNOWN only shows up when that endpoint does not answer and the catalogue the
 * channel sends over the websocket has to be used instead.
 */
export enum EProviderDebugProviderState {
    RUNNING = 'running',          // instanciado y arrancado en el core
    NOT_RUNNING = 'notRunning',   // conocido, pero ningún canal lo requiere: suscribirse fallará
    UNKNOWN = 'unknown'           // el endpoint no respondió; no se sabe
}

/** One entry of the setup.s Select: the producer plus what we know about it. */
export interface IProviderDebugProviderOption {
    id: string
    state: EProviderDebugProviderState
    help?: IProviderDebugSubscriptionHelp
    /** true when it is a pluvider: a plugin that also produces. */
    pluvider?: boolean
    /** what it produces, in one line. Only pluviders carry it. */
    description?: string
}

/** One row of GET /core/providers, with only what this plugin cares about. */
export interface IProviderDebugCatalogueEntry {
    id: string
    running?: boolean
    core?: boolean
    subscriptionHelp?: IProviderDebugSubscriptionHelp
    /**
     * true when the row is not a provider but a PLUVIDER. The endpoint serves them in the same list on
     * purpose — whoever consumes need not know there are two classes — but here they are flagged, so
     * whoever debugs can see where each one comes from.
     */
    pluvider?: boolean
    description?: string
}

/** An event exactly as it reached processProviderEvent, untransformed. */
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
    /** id of the provider the instance subscribes to; empty = none yet */
    providerId: string
    /** raw subscription payload (JSON typed by the user); empty = {} */
    subscriptionData: string
}
