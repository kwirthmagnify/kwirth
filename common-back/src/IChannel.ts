import { BackChannelData, IInstanceConfig, IInstanceMessage, AccessKey, EInstanceMessageAction, IBackChannelRequirements, IExtensionScope, IChannelInstances } from '@kwirthmagnify/kwirth-common'
import { Request, Response } from 'express'
import { IncomingMessage } from 'http'
import { IExtension } from './IExtension'

export interface IChannel extends IExtension {
    readonly channelId: string
    readonly requirements: IBackChannelRequirements
    getChannelData(): BackChannelData
    getChannelScopeLevel(scope: string): number
    // Catalogue of RBAC scopes the extension declares (to validate and manage permissions). Optional.
    getScopeCatalog?(): IExtensionScope[]
    /**
     * What this channel has running right now: instances started and the connections carrying them
     * (the Status channel's Plugins tab). REQUIRED since common-back 0.6.0, so a plugin that moves to it
     * cannot build without it. Plugins built against 0.5.x do not have it, and the core treats it as
     * optional at runtime: those are shown as "not reported", never as zero.
     */
    getInstances(): IChannelInstances

    startChannel(): Promise<void>
    endpointRequest(endpoint: string, req: Request, res: Response, accessKey?: AccessKey): void
    websocketRequest(newWebSocket: WebSocket, instanceId: string, instanceConfig: IInstanceConfig): void
    /*
        A raw WebSocket whose path falls under this channel's router (<rootPath>/channel/<routerAlias>/...),
        handed over as soon as it connects. Only for a channel with providesRouter + routerAlias: it is the
        websocket counterpart of that router. From then on the socket is the channel's — the core attaches
        nothing to it. 'req' is the upgrade request: full path and query, headers and remote address.
        Optional: a channel that does not implement it gets no such sockets, and they are treated as before.
    */
    pathWebsocketRequest?(webSocket: WebSocket, req: IncomingMessage): void

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
