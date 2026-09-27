import { EEmitMode, EResponseType, IHttpPullConfig, IHttpPullPushEvent } from '../common/HttpPullPush'
import { TFetcher } from './HttpFetcher'

/*
    One poller = one running connection. It only exists while the connection is enabled AND has at least
    one subscriber (a lazy policy): a connection nobody listens to generates no traffic and spends no quota.

    Every cycle makes ONE single request, whatever the number of subscribers; the fan-out is done by the
    provider with the result.
*/

export type TEventCallback = (event: IHttpPullPushEvent) => void

/*
    A fingerprint of the parameters that affect the pull. It is used to decide whether a running poller is
    still valid after saving the configuration: if the fingerprint does not change it is left alive (and
    keeps onChange's state); if it changes, it is recreated. 'name' (which identifies) and 'enabled'
    (which the provider manages) are left out. The keys are sorted so that the same header content coming
    from two different origins (the storage or the dialog's PUT) produces the same fingerprint.
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
