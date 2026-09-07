/*
    Tipos compartidos entre el back y el front del provider.

    Hay DOS capas de configuracion que no se mezclan:
      - capa 1, conexiones : IHttpPullConfig[]. Son del provider, se persisten y existen aunque no haya
                             ningun canal instalado. Son las que hacen el pull.
      - capa 2, suscripcion: IHttpPullPushSubscription. La declara cada canal al suscribirse, vive en
                             memoria y solo dice QUE conexiones quiere recibir.
*/

export enum EHttpMethod {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    PATCH = 'PATCH',
    DELETE = 'DELETE'
}

export enum EAuthType {
    NONE = 'none',
    BASIC = 'basic',
    BEARER = 'bearer',
    HEADER = 'header'
}

export enum EResponseType {
    JSON = 'json',
    TEXT = 'text'
}

export enum EEmitMode {
    ALWAYS = 'always',
    ON_CHANGE = 'onChange'
}

/*
    Credenciales de una conexion. Los campos marcados como secreto NO se guardan junto al resto de la
    configuracion: el provider los separa y los manda a un Secret (ver ConfigStore).
*/
export interface IHttpAuth {
    type: EAuthType
    username?: string
    password?: string      // secreto (basic)
    token?: string         // secreto (bearer)
    headerName?: string
    headerValue?: string   // secreto (header)
}

/*
    Una conexion: un endpoint remoto que se consulta cada 'intervalSeconds'.
    'enabled' en false = creada pero no operativa (se persiste y se lista, pero no genera trafico).
*/
export interface IHttpPullConfig {
    name: string
    enabled: boolean
    url: string
    method: EHttpMethod
    headers: Record<string, string>
    body?: string
    intervalSeconds: number
    timeoutMs: number
    auth: IHttpAuth
    responseType: EResponseType
    emitMode: EEmitMode
    retries: number
    allowInsecureTls: boolean
}

/*
    Lo que un canal pasa en addSubscriber().
      - configs con nombres : recibe solo esas
      - configs vacio ([])   : no recibe nada
      - configs ausente      : recibe todas las habilitadas, incluidas las que se creen despues
*/
export interface IHttpPullPushSubscription {
    configs?: string[]
}

/*
    Lo que el provider entrega al suscriptor. El envoltorio existe porque processProviderEvent() solo
    lleva el id del provider: sin el campo 'config' un canal suscrito a varias conexiones no podria
    distinguir de cual viene cada evento.
*/
export interface IHttpPullPushEvent {
    config: string
    timestamp: number
    status?: number
    data?: unknown
    error?: string
}

export const DEFAULT_INTERVAL_SECONDS = 60
export const DEFAULT_TIMEOUT_MS = 10000

export const newHttpPullConfig = (name: string): IHttpPullConfig => ({
    name,
    enabled: true,
    url: '',
    method: EHttpMethod.GET,
    headers: {},
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    auth: { type: EAuthType.NONE },
    responseType: EResponseType.JSON,
    emitMode: EEmitMode.ALWAYS,
    retries: 0,
    allowInsecureTls: false
})
