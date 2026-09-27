import { EAuthType, IHttpPullConfig } from './HttpPullPush'

/*
    Validation for TESTING a connection: only what it takes to fire a request. On purpose it does not
    look at the interval or its relation to the timeout, because a one-off test is not affected by that
    and it would be absurd to stop someone testing a url over an interval they have not tuned yet.
*/
export const validateForTest = (config: IHttpPullConfig): string[] => {
    const errors: string[] = []
    if (!config) return ['No connection to test']
    if (!config.url || !/^https?:\/\//i.test(config.url)) errors.push('url must start with http:// or https://')
    if (!(config.timeoutMs > 0)) errors.push('timeout must be greater than zero')

    switch (config.auth?.type) {
        case EAuthType.BASIC:
            if (!config.auth.username) errors.push('basic auth needs a username')
            break
        case EAuthType.BEARER:
            if (!config.auth.token) errors.push('bearer auth needs a token')
            break
        case EAuthType.HEADER:
            if (!config.auth.headerName) errors.push('header auth needs a header name')
            break
        default:
            break
    }
    return errors
}

/*
    Shared validation: the back end applies it on the PUT (a client can skip the dialog) and the front end
    uses it to warn before saving. It returns the list of errors; empty = valid.
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
        // the timeout must not eat the interval: if it takes longer than the cycle, pulls overlap
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
