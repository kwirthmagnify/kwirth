import http from 'http'
import https from 'https'
import { EAuthType, EHttpMethod, IHttpPullConfig } from '../common/HttpPullPush'

/*
    El pull se hace con los modulos http/https nativos y no con fetch() a proposito: asi se controla el
    timeout por peticion y, sobre todo, 'allowInsecureTls' (rejectUnauthorized), que con el fetch de Node
    obligaria a manipular el dispatcher de undici. Cero dependencias.

    El Poller recibe el fetcher por parametro, de modo que los tests inyectan uno de mentira y no tocan red.
*/

export interface IFetchResult {
    status: number
    body: string
}

export type TFetcher = (config: IHttpPullConfig) => Promise<IFetchResult>

const METHODS_WITH_BODY = [EHttpMethod.POST, EHttpMethod.PUT, EHttpMethod.PATCH]

// Cabeceras de la conexion mas las que impone el modo de autenticacion elegido.
export const buildHeaders = (config: IHttpPullConfig): Record<string, string> => {
    const headers: Record<string, string> = { ...(config.headers ?? {}) }
    const auth = config.auth
    if (!auth) return headers

    switch (auth.type) {
        case EAuthType.BASIC:
            headers['Authorization'] = 'Basic ' + Buffer.from(`${auth.username ?? ''}:${auth.password ?? ''}`, 'utf8').toString('base64')
            break
        case EAuthType.BEARER:
            headers['Authorization'] = `Bearer ${auth.token ?? ''}`
            break
        case EAuthType.HEADER:
            if (auth.headerName) headers[auth.headerName] = auth.headerValue ?? ''
            break
        case EAuthType.NONE:
            break
    }
    return headers
}

export const httpFetcher: TFetcher = (config: IHttpPullConfig): Promise<IFetchResult> => {
    return new Promise<IFetchResult>((resolve, reject) => {
        let url: URL
        try {
            url = new URL(config.url)
        }
        catch {
            reject(new Error(`invalid url '${config.url}'`))
            return
        }

        const isHttps = url.protocol === 'https:'
        const transport = isHttps ? https : http
        const headers = buildHeaders(config)
        const hasBody = METHODS_WITH_BODY.includes(config.method) && config.body !== undefined
        if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

        const request = transport.request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method: config.method,
            headers,
            ...(isHttps && config.allowInsecureTls ? { rejectUnauthorized: false } : {})
        }, response => {
            const chunks: Buffer[] = []
            response.on('data', (chunk: Buffer) => chunks.push(chunk))
            response.on('end', () => {
                resolve({
                    status: response.statusCode ?? 0,
                    body: Buffer.concat(chunks).toString('utf8')
                })
            })
        })

        request.setTimeout(config.timeoutMs, () => {
            request.destroy(new Error(`timeout after ${config.timeoutMs}ms`))
        })
        request.on('error', err => reject(err))
        if (hasBody) request.write(config.body)
        request.end()
    })
}
