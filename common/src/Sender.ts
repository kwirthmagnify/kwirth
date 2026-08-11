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
    addConfig(senderId: string, config: ISenderConfig): boolean
    listSenders(): Array<{ id: string; configNames: string[] }>
    getConfig(senderId: string, configName: string): ISenderConfig | undefined
}
