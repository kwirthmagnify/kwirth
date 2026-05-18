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

export interface ISenderAccess {
    send(senderId: string, configName: string, message: ISenderMessage): Promise<void>
    addConfig(senderId: string, config: ISenderConfig): boolean
    listSenders(): Array<{ id: string; configNames: string[] }>
}
