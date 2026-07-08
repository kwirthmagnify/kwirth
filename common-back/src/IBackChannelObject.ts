import { ISenderAccess, IUserInfo } from '@kwirthmagnify/kwirth-common'

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
}
