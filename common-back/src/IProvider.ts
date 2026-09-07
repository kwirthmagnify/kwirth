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
 * Un campo del payload de suscripcion, descrito para que un consumidor pueda pintar un formulario
 * en vez de exigir JSON a mano. Solo tiene sentido declararlos cuando el payload es plano; si es
 * anidado (p.ej. otel, con 'spaces'), basta con 'usage' y 'example'.
 */
export interface IProviderSubscriptionField {
    name: string
    type: 'string' | 'number' | 'boolean' | 'string[]'
    required?: boolean
    description: string
}

/**
 * Ayuda que un provider publica sobre COMO SUSCRIBIRSE a el, es decir sobre el argumento 'data' de
 * addSubscriber. No confundir con el 'schema' que un provider exporta desde su back.js, que
 * describe la configuracion del propio provider (configure/configRouter).
 *
 * La consume provider-debug para explicarle al usuario que escribir, pero cualquier canal que
 * ofrezca elegir provider puede usarla.
 */
export interface IProviderSubscriptionHelp {
    /** Como se usa, en prosa: que entrega, que hace falta para recibir algo, gotchas. */
    usage: string
    /** Payload de ejemplo, listo para pasar tal cual a addSubscriber. */
    example: Record<string, unknown>
    /** Descripcion campo a campo. Opcional: solo para payloads planos. */
    fields?: IProviderSubscriptionField[]
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
    /**
     * Ayuda de suscripcion. OPCIONAL: quien escriba un provider la añade si quiere. Sin ella el
     * consumidor sigue funcionando, simplemente no tiene nada que enseñarle al usuario sobre que
     * payload escribir.
     */
    getSubscriptionHelp?(): IProviderSubscriptionHelp
    /**
     * Nombres de las configuraciones que el provider tiene definidas (equivalente a
     * ISender.getConfigNames). OPCIONAL: solo tiene sentido en un provider que sea dueño de su
     * configuracion. El gestor de extensiones lo usa para mostrar cuantas hay en la tarjeta, igual
     * que hace con los senders. No expone valores, solo nombres.
     */
    getConfigNames?(): string[]
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
