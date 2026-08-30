export interface ISenderMessage {
    subject?: string
    body: string
    to?: string | string[]
    level?: 'debug' | 'info' | 'warning' | 'error'
    metadata?: Record<string, unknown>
}

export interface ISenderConfig {
    name: string
    [key: string]: unknown
}

export interface ISenderStoredConfig {
    configs: ISenderConfig[]
    [key: string]: unknown
}

// Retorno OPCIONAL de un send: JSON libre que el sender puede devolver al llamante (p.ej. un sender
// de ticketing devuelve { issueKey, url } tras crear el ticket). Los senders de notificación pura
// siguen devolviendo void; el llamante decide si usa el resultado. Ver plans/webhook-extension/PLAN.md.
export interface ISenderResult {
    [key: string]: unknown
}

export interface ISenderAccess {
    send(senderId: string, configName: string, message: ISenderMessage): Promise<ISenderResult | void>
    // OPCIONAL: consulta el estado actual de una entidad externa creada por el sender (p.ej. un ticket de
    // ticketing → su status). Contraparte de pull del webhook (push): permite RECONCILIAR estados perdidos
    // (core caído / sin suscriptor cuando llegó el callback). Devuelve undefined si el sender no lo soporta,
    // la config no existe, o no se pudo resolver. Ver plans/webhook-extension/PLAN.md (H3b-recon).
    fetchStatus?(senderId: string, configName: string, externalId: string): Promise<string | undefined>
    addConfig(senderId: string, config: ISenderConfig): boolean
    listSenders(): Array<{ id: string; configNames: string[] }>
    getConfig(senderId: string, configName: string): ISenderConfig | undefined
}
