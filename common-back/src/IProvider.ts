import { KwirthData } from '@kwirthmagnify/kwirth-common'

/**
 * Minimal interface representing the channel side that providers interact with.
 * Providers only need to call processProviderEvent on their subscribers.
 */
export interface IProviderSubscriber {
    processProviderEvent(providerId: string, obj: any): void
}

/**
 * Interface that all provider plugins must implement.
 * Use 'any' for clusterInfo to avoid pulling in kubernetes/docker dependencies.
 */
export interface IProvider {
    readonly id: string
    readonly providesRouter: boolean
    readonly requiresApiKeyApi: boolean
    addSubscriber(c: IProviderSubscriber, data: any): Promise<void>
    removeSubscriber(c: IProviderSubscriber): Promise<void>
    updateSubscription?(c: IProviderSubscriber, data: any): Promise<void>
    configure?(config: Record<string, unknown>): void
    startProvider(): Promise<void>
    stopProvider(): Promise<void>
    router: any
    routerAlias: string | undefined
    apiKeyApi: any | undefined
}

export type TProviderConstructor = new (clusterInfo: any, kwirthData: KwirthData) => IProvider
