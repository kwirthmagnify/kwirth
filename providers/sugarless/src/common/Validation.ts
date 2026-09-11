import {
    ISugarlessConfig, MIN_INTERVAL_SECONDS, REQUEST_TIMEOUT_MS
} from './Sugarless'

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VERSION_SHAPE = /^\d+(\.\d+)*$/

/*
    Validacion compartida: el back la aplica en el PUT (un cliente puede saltarse el dialogo) y el
    front la usa para avisar antes de guardar. Devuelve la lista de errores; vacia = valida.

    'password' se valida aparte con 'requirePassword': al editar una configuracion ya guardada, un
    campo de contraseña vacio significa "dejala como esta", no "borrala". Meter esa regla aqui haria
    imposible guardar un cambio de intervalo sin volver a teclear la credencial.
*/
export const validateConfig = (config: ISugarlessConfig | undefined, requirePassword: boolean): string[] => {
    const errors: string[] = []
    if (!config) return ['No configuration provided']

    const email = (config.email ?? '').trim()
    if (email === '') errors.push('Email is required')
    else if (!EMAIL_SHAPE.test(email)) errors.push('Email does not look like an email address')

    if (requirePassword && (config.password ?? '') === '') errors.push('Password is required')

    if (!Number.isFinite(config.intervalSeconds)) errors.push('Interval must be a number')
    else if (config.intervalSeconds < MIN_INTERVAL_SECONDS) errors.push(`Interval must be at least ${MIN_INTERVAL_SECONDS} seconds`)

    // El timeout es fijo, pero si se colase un intervalo mas corto los ciclos se pisarian.
    if (config.intervalSeconds * 1000 < REQUEST_TIMEOUT_MS) errors.push('Interval is shorter than the request timeout')

    if (!Number.isInteger(config.maxSamples)) errors.push('Max samples must be a whole number')
    else if (config.maxSamples < 2) errors.push('Max samples must be at least 2')
    else if (config.maxSamples > 20000) errors.push('Max samples must not exceed 20000')

    const version = (config.clientVersion ?? '').trim()
    if (version === '') errors.push('Client version is required')
    else if (!VERSION_SHAPE.test(version)) errors.push('Client version must look like 4.16.0')

    // La region, cuando se pone, va dentro de un hostname: se acota a lo que puede ser una etiqueta DNS.
    const region = (config.region ?? '').trim()
    if (region !== '' && !/^[a-z0-9-]{1,20}$/i.test(region)) errors.push('Region must be a short alphanumeric code, such as eu')

    return errors
}
