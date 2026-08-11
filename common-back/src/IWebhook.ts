import { IWebhookEvent, IWebhookConfig, IWebhookAccess, IWebhookConsumer, IWebhookStoredConfig } from '@kwirthmagnify/kwirth-common'

export { IWebhookEvent, IWebhookConfig, IWebhookAccess, IWebhookConsumer, IWebhookStoredConfig }

export type WebhookFieldType = 'text' | 'number' | 'boolean' | 'password' | 'select' | 'json'

export interface IWebhookFieldDef {
    name: string
    label: string
    type?: WebhookFieldType
    required?: boolean
    options?: string[]
    common?: boolean
}

export interface IWebhookNodeMeta {
    label: string
    icon?: string
    description?: string
}

export interface IWebhook {
    readonly id: string
    // Verifica autenticidad a partir del cuerpo CRUDO + headers + la config resuelta (con secretos).
    // LA AUTH LA IMPLEMENTA CADA WEBHOOK: el core es agnóstico. Jira compara headers.authorization con
    // config.apiKey; GitHub calcula un HMAC sobre rawBody con config.hmacSecret; cada artefacto decide.
    verify(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, config: IWebhookConfig): boolean
    // Parsea el cuerpo crudo en el evento normalizado (tras pasar verify).
    parse(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): IWebhookEvent | null
    addConfig(config: IWebhookConfig): void
    removeConfig(name: string): void
    hasConfig(name: string): boolean
    getConfigNames(): string[]
    // El artefacto declara SUS propios campos de config (apiKey, secreto HMAC, etc.); el core los
    // renderiza genéricamente y los almacena, sin conocer su significado.
    getConfigSchema?(): IWebhookFieldDef[]
    getNodeMeta?(): IWebhookNodeMeta
    startWebhook?(access: IWebhookAccess): Promise<void>
    stopWebhook?(): Promise<void>
}

export type TWebhookConstructor = new () => IWebhook
