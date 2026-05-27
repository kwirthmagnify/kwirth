import { ISenderAccess } from './Sender'
import { EInstanceConfigObject, EInstanceConfigView } from './InstanceConfig'

export interface IDaemonInstanceConfig {
    id: string
    daemonId: string
    description: string
    view: EInstanceConfigView
    namespace: string
    group?: string
    pod?: string
    container?: string
    objects?: EInstanceConfigObject
    data?: unknown
    started?: boolean
    createdAt?: string
}

export interface BackDaemonData {
    id: string
    resourced: boolean
    cluster: boolean
    sources: string[]
}

export interface IBackDaemonRequirements {
    storage: boolean
    providers: string[]
}

export interface IBackDaemonObject {
    writeStorage?(id: string, secret: boolean, data: unknown): Promise<void>
    readStorage?(id: string, secret: boolean): Promise<unknown>
    logInfo?(message: unknown): void
    logTrace?(message: unknown): void
    logWarning?(message: unknown): void
    logError?(message: unknown): void
    senders?: ISenderAccess
}

export interface IDaemonEvent {
    instanceId: string
    type: string
    data: unknown
}

export interface IDaemonManager {
    createInstance(daemonId: string, instanceConfig: IDaemonInstanceConfig): Promise<void>
    stopInstance(instanceId: string): Promise<void>
    listInstances(daemonId?: string): IDaemonInstanceConfig[]
    subscribe(instanceId: string, callback: (event: IDaemonEvent) => void): () => void
    sendCommand(instanceId: string, command: string, data: unknown): Promise<unknown>
    routeAddObject(podNamespace: string, podName: string, containerName: string): Promise<void>
    directAddObject(instanceId: string, podNamespace: string, podName: string, containerName: string): Promise<void>
    routeProviderEvent(providerId: string, event: unknown): void
}
