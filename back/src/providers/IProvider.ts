import { IChannel } from "../channels/IChannel"
import { Router } from 'express'
import { ClusterInfo } from "../model/ClusterInfo"
import { KwirthData } from "@kwirthmagnify/kwirth-common"
import {
    IProvider as IPublicProvider,
    IProviderFieldDef,
    IProviderStorage as IPublicProviderStorage,
    IProviderSubscriptionField,
    IProviderSubscriptionHelp
} from "@kwirthmagnify/kwirth-common-back"
import { ApiKeyApi } from "../api/ApiKeyApi"

/*
    Este fichero era un ESPEJO MANUAL del contrato publicado en common-back y habia empezado a
    divergir. Ahora la unica fuente del contrato es common-back: aqui solo se reexporta lo que no
    cambia y se ESTRECHA lo que el core necesita ver con tipos concretos (Router, ApiKeyApi,
    ClusterInfo, IChannel) en vez de los 'any' con los que se publica, mas los dos flags de runtime
    que gestiona el propio core y que un autor de providers no implementa.
*/

export { IProviderSubscriptionField, IProviderSubscriptionHelp, IProviderFieldDef }

/*
    Persistencia que el core inyecta al provider. Es el mismo contrato que reciben los canales
    (IBackChannelObject), pero con su propio espacio de nombres: 'kwirth-store-provider-<id>'.
    El booleano 'secret' decide el destino: true -> Secret, false -> ConfigMap.
*/
export type IProviderStorage = IPublicProviderStorage

export type TProviderConstructor = (new (clusterInfo:ClusterInfo, kwirthData:KwirthData, storage?:IProviderStorage) => IProvider)|undefined

export const createProviderInstance = (providerConstructor:TProviderConstructor, clusterInfo: ClusterInfo, kwirthData:KwirthData, storage?:IProviderStorage): IProvider | null => {
    if (!providerConstructor) throw  new Error('Error: providerConstructor is empty')
    return new providerConstructor(clusterInfo, kwirthData, storage)
}

/*
    Vista que el CORE tiene de un provider. Es el contrato publicado, con dos anadidos:

      - los suscriptores son IChannel y los routers son Router de express, no 'any': dentro del core
        si conocemos esos tipos y no queremos perderlos.
      - 'started' y 'configRouterStarted' son estado de runtime que lleva el core, no algo que
        implemente el autor del provider; por eso no forman parte del contrato publicado.
*/
export interface IProvider extends Omit<IPublicProvider, 'addSubscriber'|'removeSubscriber'|'updateSubscription'|'router'|'configRouter'|'apiKeyApi'> {
    addSubscriber: (c:IChannel, data:any) => Promise<void>
    removeSubscriber: (c:IChannel) => Promise<void>
    updateSubscription?: (c:IChannel, data:any) => Promise<void>
    router: Router|undefined
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
