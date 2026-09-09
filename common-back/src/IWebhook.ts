import { IWebhookEvent, IWebhookConfig, IWebhookAccess, IWebhookConsumer, IWebhookStoredConfig, TConfigFieldType, IConfigFieldDef, IExtensionNodeMeta } from '@kwirthmagnify/kwirth-common'

export { IWebhookEvent, IWebhookConfig, IWebhookAccess, IWebhookConsumer, IWebhookStoredConfig }

/** @deprecated usa TConfigFieldType, comun a todas las extensiones. */
export type WebhookFieldType = TConfigFieldType

/** Campo de configuracion de un webhook. Es el contrato comun IConfigFieldDef, sin nada propio. */
export type IWebhookFieldDef = IConfigFieldDef

/** @deprecated usa IExtensionNodeMeta, comun a todas las extensiones. */
export type IWebhookNodeMeta = IExtensionNodeMeta

export interface IWebhook {
    readonly id: string
    // Verifica autenticidad a partir del cuerpo CRUDO + headers + la config resuelta (con secretos).
    // LA AUTH LA IMPLEMENTA CADA WEBHOOK: el core es agnóstico. Jira compara headers.authorization con
    // config.apiKey; GitHub calcula un HMAC sobre rawBody con config.hmacSecret; cada artefacto decide.
    verify(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, config: IWebhookConfig): boolean
    // Parsea el cuerpo crudo en el evento normalizado (tras pasar verify). El artefacto NO conoce su `configName`
    // (lo resuelve el core por el token de la URL) → lo omite; el receptor lo estampa antes de entregar.
    parse(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Omit<IWebhookEvent, 'configName'> | null
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
