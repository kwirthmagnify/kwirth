import { ISenderAccess, IWebhookAccess, IUserInfo, IInstanceConfig } from '@kwirthmagnify/kwirth-common'
import { IClusterEndpoint, IRemoteChannelHandlers, IRemoteChannelHandle } from './IFederation'

// Objeto que el CORE inyecta al back de un canal (storage, logging, catálogo de usuarios, config de
// instalación, senders). Es un contrato del lado BACK, por eso vive en common-back (no en common).
export interface IBackChannelObject {
    writeStorage?(id: string, secret: boolean, data: any): Promise<void>
    readStorage?(id: string, secret: boolean): Promise<any>
    writeStorageCommon?(id: string, secret: boolean, data: any): Promise<void>
    readStorageCommon?(id: string, secret: boolean): Promise<any>
    logInfo?(message: unknown): void
    logTrace?(message: unknown): void
    logWarning?(message: unknown): void
    logError?(message: unknown): void
    // Catálogo SANEADO de usuarios Kwirth (subset IUserInfo, sin secretos). Lo provee el core;
    // los plugins lo consumen (p.ej. resolución de ownership / picker). Read-only.
    getUsers?(): Promise<IUserInfo[]>
    // Config de instalación del plugin (JSON genérico), por id de plugin. La persiste el core (ConfigMap,
    // editable desde el plugin manager) y la consume el back del plugin. Read-only. Genérica como providers.
    getPluginConfig?(pluginId: string): Promise<Record<string, unknown>>
    senders?: ISenderAccess
    // Ingesta de webhooks (contraparte inbound de senders): el consumidor se suscribe a los eventos
    // dirigidos a su target vía subscribe(); el core le entrega los ya verificados y parseados.
    webhooks?: IWebhookAccess
    // Federación multi-cluster back-a-back: abre un WS CLIENTE hacia un cluster remoto (endpoint), lo
    // arranca (START con SU accessKey, protocolo plano sin challenge) y entrega los frames por
    // handlers.onMessage. Gestiona la reconexión con backoff y captura el instance del START (para poder
    // enviar comandos referenciando un instance válido en ESE cluster). El WS crudo NO se expone: el
    // plugin usa el handle (send/close). Primitiva del FRAMEWORK, la implementa el core (no el plugin).
    openRemoteChannel?(endpoint: IClusterEndpoint, config: IInstanceConfig, handlers: IRemoteChannelHandlers): IRemoteChannelHandle
    // Lee el store de PERFIL de un usuario (ConfigMap kwirth-store-<userId>, clave '<group>-<key>') y
    // devuelve el valor ya parseado (el store guarda JSON stringificado; esto hace el JSON.parse). Ej.:
    // readUserStore(userId, 'clusters', 'list') → IClusterEndpoint[]. Clave inexistente → undefined. Read-only.
    readUserStore?(userId: string, group: string, key: string): Promise<unknown>
}
