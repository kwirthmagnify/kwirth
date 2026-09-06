import { KwirthData } from '@kwirthmagnify/kwirth-common'

/**
 * Minimal interface representing the channel side that providers interact with.
 * Providers only need to call processProviderEvent on their subscribers.
 */
export interface IProviderSubscriber {
    processProviderEvent(providerId: string, obj: any): void
}

/**
 * Persistencia que el core inyecta al provider (mismo mecanismo que reciben los canales).
 * El booleano 'secret' decide el destino: true -> Secret de Kubernetes, false -> ConfigMap.
 * Las variantes 'Common' escriben en el almacen compartido entre extensiones.
 */
export interface IProviderStorage {
    writeStorage(id: string, secret: boolean, data: any): Promise<void>
    readStorage(id: string, secret: boolean): Promise<any>
    writeStorageCommon(id: string, secret: boolean, data: any): Promise<void>
    readStorageCommon(id: string, secret: boolean): Promise<any>
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
    /**
     * @deprecated El core deja de alimentar este metodo: un provider es dueño de su propia
     * configuracion y la sirve por 'configRouter'. Se mantiene por compatibilidad con providers
     * de terceros que aun usen la config gestionada por el core.
     */
    configure?(config: Record<string, unknown>): void
    startProvider(): Promise<void>
    stopProvider(): Promise<void>
    router: any
    routerAlias: string | undefined
    /**
     * Router de gestion del provider (su propia configuracion). El core lo monta SIEMPRE detras de
     * validacion de accessKey, igual que hace con los endpoints de un canal, en la ruta
     * '/core/providerconfig/<providerId>'. Es una via distinta de 'router', que es publica y puede
     * recibir trafico externo (OTLP, POSTs de terceros) y por tanto no puede exigir accessKey.
     */
    configRouter?: any
    apiKeyApi: any | undefined
}

export type TProviderConstructor = new (clusterInfo: any, kwirthData: KwirthData, storage?: IProviderStorage) => IProvider
