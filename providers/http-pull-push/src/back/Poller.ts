import { EEmitMode, EResponseType, IHttpPullConfig, IHttpPullPushEvent } from '../common/HttpPullPush'
import { TFetcher } from './HttpFetcher'

/*
    Un poller = una conexion en marcha. Solo existe mientras la conexion esta habilitada Y tiene al menos
    un suscriptor (politica lazy): una conexion que nadie escucha no genera trafico ni gasta cuota.

    Cada ciclo hace UNA sola peticion, sea cual sea el numero de suscriptores; el fan-out lo hace el
    provider con el resultado.
*/

export type TEventCallback = (event: IHttpPullPushEvent) => void

/*
    Huella de los parametros que afectan al pull. Se usa para decidir si un poller en marcha sigue siendo
    valido tras guardar la configuracion: si la huella no cambia se deja vivo (y conserva el estado de
    onChange); si cambia, se recrea. Quedan fuera 'name' (identifica) y 'enabled' (lo gestiona el provider).
    Las claves se ordenan para que el mismo contenido de una cabecera de dos origenes distintos
    (el storage o el PUT del dialogo) produzca la misma huella.
*/
const fingerprint = (config: IHttpPullConfig): string => {
    const headers = Object.keys(config.headers ?? {}).sort().map(k => `${k}=${config.headers[k]}`).join('&')
    const auth = config.auth ?? {}
    return [
        config.url,
        config.method,
        headers,
        config.body ?? '',
        config.intervalSeconds,
        config.timeoutMs,
        auth.type,
        auth.username ?? '',
        auth.password ?? '',
        auth.token ?? '',
        auth.headerName ?? '',
        auth.headerValue ?? '',
        config.responseType,
        config.emitMode,
        config.retries,
        config.allowInsecureTls
    ].join('|')
}

export class Poller {
    private config: IHttpPullConfig
    private fetcher: TFetcher
    private onEvent: TEventCallback
    private timer: NodeJS.Timeout | undefined
    private lastPayload: string | undefined
    private running = false

    constructor(config: IHttpPullConfig, fetcher: TFetcher, onEvent: TEventCallback) {
        this.config = config
        this.fetcher = fetcher
        this.onEvent = onEvent
    }

    start = (): void => {
        if (this.timer) return
        // first pull immediately: whoever just subscribed should not wait a whole interval
        void this.tick()
        this.timer = setInterval(() => { void this.tick() }, this.config.intervalSeconds * 1000)
    }

    stop = (): void => {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
    }

    // Does this poller still serve the given configuration, or does it need recreating?
    matches = (config: IHttpPullConfig): boolean => fingerprint(this.config) === fingerprint(config)

    // One cycle. If the previous one is still in flight this one is skipped, so requests do not pile up
    // on a slow endpoint (the interval rules, not the latency).
    tick = async (): Promise<void> => {
        if (this.running) return
        this.running = true
        try {
            const result = await this.fetchWithRetries()
            const data = this.parse(result.body)
            if (!this.shouldEmit(result.status, result.body)) return
            this.onEvent({
                config: this.config.name,
                timestamp: Date.now(),
                status: result.status,
                data
            })
        }
        catch (err) {
            this.lastPayload = undefined   // tras un fallo, el proximo resultado bueno siempre se emite
            this.onEvent({
                config: this.config.name,
                timestamp: Date.now(),
                error: err instanceof Error ? err.message : String(err)
            })
        }
        finally {
            this.running = false
        }
    }

    private fetchWithRetries = async () => {
        let lastError: unknown
        for (let attempt = 0; attempt <= this.config.retries; attempt++) {
            try {
                return await this.fetcher(this.config)
            }
            catch (err) {
                lastError = err
            }
        }
        throw lastError
    }

    private parse = (body: string): unknown => {
        if (this.config.responseType === EResponseType.TEXT) return body
        try {
            return JSON.parse(body)
        }
        catch {
            // a response declared as json that is not: the raw text is delivered instead of losing the
            // result (the subscriber decides what to do with it)
            return body
        }
    }

    // In onChange mode the raw body is compared with the previous cycle's: it is exact and does not
    // depend on how the parsed object serialises.
    private shouldEmit = (status: number, body: string): boolean => {
        if (this.config.emitMode === EEmitMode.ALWAYS) return true
        const payload = `${status}:${body}`
        if (this.lastPayload === payload) return false
        this.lastPayload = payload
        return true
    }
}
