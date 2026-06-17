import { IDaemonInstanceConfig, BackDaemonData, IBackDaemonRequirements } from '@kwirthmagnify/kwirth-common'

export interface IDaemon {
    readonly daemonId: string
    readonly requirements: IBackDaemonRequirements
    readonly providesRouter?: boolean
    router?: any
    routerAlias?: string

    getDaemonData(): BackDaemonData

    startDaemon(): Promise<void>
    initInstance?(instanceConfig: IDaemonInstanceConfig): Promise<void>

    addObject(instanceConfig: IDaemonInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean>
    deleteObject(instanceConfig: IDaemonInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean>

    containsInstance(instanceId: string): boolean
    containsAsset(instanceId: string, podNamespace: string, podName: string, containerName: string): boolean
    stopInstance(instanceId: string): void

    processProviderEvent(providerId: string, event: unknown): void
    getProviderSubscriptionData?(providerId: string): unknown
    processCommand(instanceId: string, command: string, data: unknown): Promise<unknown>
    processDaemonCommand?(command: string, data: unknown): Promise<unknown>

    subscribe(instanceId: string, callback: (event: unknown) => void): () => void
}
