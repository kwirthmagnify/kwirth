import { IChannel } from "../channels/IChannel"
import { Router } from 'express'
import { ClusterInfo } from "../model/ClusterInfo"
import { KwirthData } from "@kwirthmagnify/kwirth-common"
import { ApiKeyApi } from "../api/ApiKeyApi"

/*
    Persistencia que el core inyecta al provider. Es el mismo contrato que reciben los canales
    (IBackChannelObject), pero con su propio espacio de nombres: 'kwirth-store-provider-<id>'.
    El booleano 'secret' decide el destino: true -> Secret, false -> ConfigMap.
*/
export interface IProviderStorage {
    writeStorage: (id: string, secret: boolean, data: any) => Promise<void>
    readStorage: (id: string, secret: boolean) => Promise<any>
    writeStorageCommon: (id: string, secret: boolean, data: any) => Promise<void>
    readStorageCommon: (id: string, secret: boolean) => Promise<any>
}

export type TProviderConstructor = (new (clusterInfo:ClusterInfo, kwirthData:KwirthData, storage?:IProviderStorage) => IProvider)|undefined

export const createProviderInstance = (providerConstructor:TProviderConstructor, clusterInfo: ClusterInfo, kwirthData:KwirthData, storage?:IProviderStorage): IProvider | null => {
    if (!providerConstructor) throw  new Error('Error: providerConstructor is empty')
    return new providerConstructor(clusterInfo, kwirthData, storage)
}

/*
    Un campo del payload de suscripcion, descrito para que un consumidor pueda pintar un formulario
    en vez de exigir JSON a mano. Solo tiene sentido declararlos cuando el payload es plano; si es
    anidado, basta con 'usage' y 'example'. Espejo de IProviderSubscriptionField de common-back.
*/
export interface IProviderSubscriptionField {
    name: string
    type: 'string' | 'number' | 'boolean' | 'string[]'
    required?: boolean
    description: string
}

/*
    Ayuda que un provider publica sobre COMO SUSCRIBIRSE a el, es decir sobre el argumento 'data' de
    addSubscriber. No confundir con el 'schema' que un provider exporta desde su back.js, que
    describe la configuracion del propio provider (configure/configRouter).
*/
export interface IProviderSubscriptionHelp {
    usage: string
    example: Record<string, unknown>
    fields?: IProviderSubscriptionField[]
}

export interface IProvider {
    readonly id: string
    readonly providesRouter: boolean
    readonly requiresApiKeyApi: boolean
    addSubscriber: (c:IChannel, data:any) => Promise<void>
    removeSubscriber: (c:IChannel) => Promise<void>
    /*
        Ayuda de suscripcion. OPCIONAL: quien escriba un provider la añade si quiere. Sin ella el
        consumidor sigue funcionando, simplemente no tiene nada que enseñarle al usuario sobre que
        payload escribir.
    */
    getSubscriptionHelp?: () => IProviderSubscriptionHelp
    /*
        Nombres de las configuraciones definidas en el provider (equivalente a ISender.getConfigNames).
        OPCIONAL: solo tiene sentido en un provider dueño de su configuracion. El gestor de extensiones
        lo usa para el contador de la tarjeta. No expone valores, solo nombres.
    */
    getConfigNames?: () => string[]
    /*
        @deprecated El core deja de alimentar este metodo: un provider es dueño de su propia
        configuracion y la sirve por 'configRouter'. Se mantiene por compatibilidad con providers
        de terceros que aun usen la config gestionada por el core.
    */
    configure?(config: Record<string, unknown>): void
    startProvider: () => Promise<void>
    stopProvider: () => Promise<void>
    router: Router|undefined
    routerAlias: string|undefined
    /*
        Router de gestion del provider (su propia configuracion). El core lo monta SIEMPRE detras de
        validacion de accessKey en '/core/providerconfig/<providerId>'. Es una via distinta de 'router',
        que es publica y puede recibir trafico externo (OTLP, POSTs de terceros).
    */
    configRouter?: Router
    started?: boolean
    configRouterStarted?: boolean
    apiKeyApi: ApiKeyApi|undefined
}
