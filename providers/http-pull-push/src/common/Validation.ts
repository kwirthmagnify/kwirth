import { EAuthType, IHttpPullConfig } from './HttpPullPush'

/*
    Validacion compartida: el back la aplica en el PUT (un cliente puede saltarse el dialogo) y el front
    la usa para avisar antes de guardar. Devuelve la lista de errores; vacia = valido.
*/
export const validateConfigs = (configs: IHttpPullConfig[]): string[] => {
    const errors: string[] = []
    const seen = new Set<string>()

    for (const config of configs) {
        const name = (config.name ?? '').trim()
        if (!name) {
            errors.push('A connection has no name')
            continue
        }
        if (seen.has(name)) errors.push(`Duplicated connection name: '${name}'`)
        seen.add(name)

        if (!config.url || !/^https?:\/\//i.test(config.url)) errors.push(`'${name}': url must start with http:// or https://`)
        if (!(config.intervalSeconds > 0)) errors.push(`'${name}': interval must be greater than zero`)
        if (!(config.timeoutMs > 0)) errors.push(`'${name}': timeout must be greater than zero`)
        if (config.retries < 0) errors.push(`'${name}': retries cannot be negative`)
        // el timeout no puede comerse el intervalo: si tarda mas de lo que dura el ciclo, los pulls se pisan
        if (config.timeoutMs > config.intervalSeconds * 1000) errors.push(`'${name}': timeout is longer than the polling interval`)

        switch (config.auth?.type) {
            case EAuthType.BASIC:
                if (!config.auth.username) errors.push(`'${name}': basic auth needs a username`)
                break
            case EAuthType.BEARER:
                if (!config.auth.token) errors.push(`'${name}': bearer auth needs a token`)
                break
            case EAuthType.HEADER:
                if (!config.auth.headerName) errors.push(`'${name}': header auth needs a header name`)
                break
            case EAuthType.NONE:
            case undefined:
                break
            default:
                errors.push(`'${name}': unknown auth type`)
        }
    }
    return errors
}
