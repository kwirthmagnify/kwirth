/*
    Types shared between the provider's back end and front end.

    There are TWO layers of configuration that do not mix:
      - layer 1, connections : IHttpPullConfig[]. They belong to the provider, they are persisted and
                               they exist even with no channel installed. They are what does the pull.
      - layer 2, subscription: IHttpPullPushSubscription. Each channel declares it on subscribing, it
                               lives in memory and it only says WHICH connections it wants to receive.
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
    A connection's credentials. The fields marked as secret are NOT stored alongside the rest of the
    configuration: the provider separates them and sends them to a Secret (see ConfigStore).
*/
export interface IHttpAuth {
    type: EAuthType
    username?: string
    password?: string      // secret (basic)
    token?: string         // secret (bearer)
    headerName?: string
    headerValue?: string   // secret (header)
}

/*
    A connection: a remote endpoint queried every 'intervalSeconds'.
    'enabled' false = created but not operational (it is persisted and listed, but generates no traffic).
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
    What a channel passes in addSubscriber().
      - configs with names : it receives only those
      - configs empty ([]) : it receives nothing
      - configs absent     : it receives every enabled one, including those created later
*/
export interface IHttpPullPushSubscription {
    configs?: string[]
}

/*
    What the provider delivers to the subscriber. The wrapper exists because processProviderEvent() only
    carries the provider's id: without the 'config' field a channel subscribed to several connections
    could not tell which one each event comes from.
*/
export interface IHttpPullPushEvent {
    config: string
    timestamp: number
    status?: number
    data?: unknown
    error?: string
}

/*
    The result of testing a connection. The BACK END runs the test, not the browser: it is the back end
    that has the network, the certificates and the identity the real pull will be made with, so testing
    from the front end would prove nothing.

    'ok' false means the test ran and failed (timeout, DNS, TLS...), not that the request to the provider
    failed. A 4xx/5xx from the remote endpoint is ok=true with its 'status', just as in the polling.
*/
export interface IHttpPullTestResult {
    ok: boolean
    status?: number
    durationMs: number
    bytes?: number
    /** first characters of the body, trimmed; only so the user recognises the response */
    preview?: string
    /** true when the body could be parsed as JSON (relevant with responseType=json) */
    jsonParsed?: boolean
    error?: string
}

export const DEFAULT_INTERVAL_SECONDS = 60
export const DEFAULT_TIMEOUT_MS = 10000
export const TEST_PREVIEW_CHARS = 1500

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
