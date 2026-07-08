import { BackChannelData, IInstanceConfig, IInstanceMessage, AccessKey, EInstanceMessageAction, IBackChannelRequirements, IExtensionScope } from '@kwirthmagnify/kwirth-common'
import { Request, Response } from 'express'

export interface IChannel {
    readonly channelId: string
    readonly requirements: IBackChannelRequirements
    getChannelData(): BackChannelData
    getChannelScopeLevel(scope: string): number
    // Catálogo de scopes RBAC que declara la extensión (para validar/gestionar permisos). Opcional.
    getScopeCatalog?(): IExtensionScope[]

    startChannel(): Promise<void>
    endpointRequest(endpoint: string, req: Request, res: Response, accessKey?: AccessKey): void
    websocketRequest(newWebSocket: WebSocket, instanceId: string, instanceConfig: IInstanceConfig): void

    processProviderEvent(providerId: string, obj: any): void

    addObject(webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean>
    deleteObject(webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean>

    pauseContinueInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void
    modifyInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig): void
    containsInstance(instanceId: string): boolean
    containsAsset(webSocket: WebSocket, podNamespace: string, podName: string, containerName: string): boolean
    stopInstance(webSocket: WebSocket, instanceConfig: IInstanceConfig): void
    removeInstance(webSocket: WebSocket, instanceId: string): void

    processCommand(webSocket: WebSocket, instanceMessage: IInstanceMessage, podNamespace?: string, podName?: string, containerName?: string): Promise<boolean>

    containsConnection(webSocket: WebSocket): boolean
    removeConnection(webSocket: WebSocket): void
    refreshConnection(webSocket: WebSocket): boolean
    updateConnection(webSocket: WebSocket, instanceId: string): boolean
}
