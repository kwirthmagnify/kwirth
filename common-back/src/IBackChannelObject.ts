import { ISenderAccess, IWebhookAccess, IUserInfo, IInstanceConfig } from '@kwirthmagnify/kwirth-common'
import { IClusterEndpoint, IRemoteChannelHandlers, IRemoteChannelHandle } from './IFederation'

// The object the CORE injects into a channel's back end (storage, logging, user catalogue, install
// config, senders). It is a BACK-side contract, which is why it lives in common-back (not in common).
export interface IBackChannelObject {
    writeStorage?(id: string, secret: boolean, data: any): Promise<void>
    readStorage?(id: string, secret: boolean): Promise<any>
    writeStorageCommon?(id: string, secret: boolean, data: any): Promise<void>
    readStorageCommon?(id: string, secret: boolean): Promise<any>
    logInfo?(message: unknown): void
    logTrace?(message: unknown): void
    logWarning?(message: unknown): void
    logError?(message: unknown): void
    // SANITISED catalogue of Kwirth users (an IUserInfo subset, no secrets). The core provides it;
    // plugins consume it (for ownership resolution or a picker, say). Read-only.
    getUsers?(): Promise<IUserInfo[]>
    // The plugin's install config (generic JSON), by plugin id. The core persists it (a ConfigMap,
    // editable from the plugin manager) and the plugin's back end consumes it. Read-only. Generic, as
    // with providers.
    getPluginConfig?(pluginId: string): Promise<Record<string, unknown>>
    senders?: ISenderAccess
    // Webhook ingestion (the inbound counterpart of senders): the consumer subscribes through
    // subscribe() to the events aimed at its target; the core hands over the verified and parsed ones.
    webhooks?: IWebhookAccess
    // Back-to-back multi-cluster federation: opens a CLIENT WS towards a remote cluster (endpoint),
    // starts it (START with ITS accessKey, plain protocol with no challenge) and delivers the frames
    // through handlers.onMessage. It handles reconnection with backoff and captures the instance from
    // the START (so commands can reference an instance valid in THAT cluster). The raw WS is NOT
    // exposed: the plugin uses the handle (send/close). A FRAMEWORK primitive, implemented by the core
    // and not by the plugin.
    openRemoteChannel?(endpoint: IClusterEndpoint, config: IInstanceConfig, handlers: IRemoteChannelHandlers): IRemoteChannelHandle
    // Reads a user's PROFILE store (ConfigMap kwirth-store-<userId>, key '<group>-<key>') and returns
    // the value already parsed (the store keeps stringified JSON; this does the JSON.parse). E.g.:
    // readUserStore(userId, 'clusters', 'list') → IClusterEndpoint[]. Missing key → undefined. Read-only.
    readUserStore?(userId: string, group: string, key: string): Promise<unknown>
}
