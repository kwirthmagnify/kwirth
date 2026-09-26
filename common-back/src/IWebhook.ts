import { IWebhookEvent, IWebhookConfig, IWebhookAccess, IWebhookConsumer, IWebhookStoredConfig, TConfigFieldType, IConfigFieldDef, IExtensionNodeMeta } from '@kwirthmagnify/kwirth-common'
import { IExtension } from './IExtension'

export { IWebhookEvent, IWebhookConfig, IWebhookAccess, IWebhookConsumer, IWebhookStoredConfig }

/** @deprecated use TConfigFieldType, common to every extension. */
export type WebhookFieldType = TConfigFieldType

/** A webhook's configuration field. It is the common contract IConfigFieldDef, with nothing of its own. */
export type IWebhookFieldDef = IConfigFieldDef

/** @deprecated use IExtensionNodeMeta, common to every extension. */
export type IWebhookNodeMeta = IExtensionNodeMeta

export interface IWebhook extends IExtension {
    readonly id: string
    // Verifies authenticity from the RAW body + headers + the resolved config (secrets included).
    // EACH WEBHOOK IMPLEMENTS ITS OWN AUTH: the core is agnostic. Jira compares headers.authorization
    // with config.apiKey; GitHub computes an HMAC over rawBody with config.hmacSecret; each one decides.
    verify(rawBody: Buffer, headers: Record<string, string | string[] | undefined>, config: IWebhookConfig): boolean
    // Parses the raw body into the normalised event (after passing verify). The artifact does NOT know
    // its `configName` (the core resolves it from the URL token) → it omits it; the receiver stamps it
    // in before delivering.
    parse(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): Omit<IWebhookEvent, 'configName'> | null
    addConfig(config: IWebhookConfig): void
    removeConfig(name: string): void
    hasConfig(name: string): boolean
    getConfigNames(): string[]
    // The artifact declares ITS OWN config fields (apiKey, HMAC secret, and so on); the core renders
    // them generically and stores them, without knowing what they mean.
    getConfigSchema?(): IWebhookFieldDef[]
    getNodeMeta?(): IWebhookNodeMeta
    startWebhook?(access: IWebhookAccess): Promise<void>
    stopWebhook?(): Promise<void>
}

export type TWebhookConstructor = new () => IWebhook
