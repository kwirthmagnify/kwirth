import { IDaemonInstanceConfig, BackDaemonData, IBackDaemonRequirements } from '@kwirthmagnify/kwirth-common'

export interface IDaemon {
    readonly daemonId: string
    readonly requirements: IBackDaemonRequirements

    getDaemonData(): BackDaemonData

    startDaemon(): Promise<void>

    addObject(instanceConfig: IDaemonInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean>
    deleteObject(instanceConfig: IDaemonInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean>

    containsInstance(instanceId: string): boolean
    containsAsset(instanceId: string, podNamespace: string, podName: string, containerName: string): boolean
    stopInstance(instanceId: string): void

    processProviderEvent(providerId: string, event: unknown): void
    processCommand(instanceId: string, command: string, data: unknown): Promise<unknown>

    subscribe(instanceId: string, callback: (event: unknown) => void): () => void
}
