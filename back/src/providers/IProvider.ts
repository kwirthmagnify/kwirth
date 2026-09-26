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
import { IComponentLogger, providerLogger } from "../tools/Logging"

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

/*
    Every provider in this Kwirth is born here, which is why the logger is handed over here and
    nowhere else.

    A provider used to get nothing to log with — channels get a backChannelObject, providers got
    nothing — so the only thing left was console.log: no timestamp, no level, no component, and an
    error looking exactly like an informational line. Now it receives one that already knows its id,
    so the line comes out as '[provider] [ERROR] [longhorn] ...' and the provider writes the message
    and nothing else.

    Optional on purpose: a provider built before this exists simply does not get called, and keeps
    writing wherever it was writing. Nothing to coordinate, no minimum version to demand.
*/
export const createProviderInstance = (providerConstructor:TProviderConstructor, clusterInfo: ClusterInfo, kwirthData:KwirthData, storage?:IProviderStorage): IProvider | null => {
    if (!providerConstructor) throw  new Error('Error: providerConstructor is empty')
    const instance = new providerConstructor(clusterInfo, kwirthData, storage)
    instance.setLogger?.(providerLogger(instance.id))
    return instance
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
    /*
        Declarado aqui y no tomado del contrato publicado porque 'common-back' todavia no se ha
        republicado con el: en cuanto npm sirva la version nueva, esta linea sobra. Mientras tanto el
        core compila y los providers que ya lo implementen reciben su logger.
    */
    setLogger?: (logger: IComponentLogger) => void
    /*
        Called once, after EVERY provider is registered and started, so that a provider which consumes
        another one can subscribe knowing its producer exists.

        It is not a nicety: whether a producer is already in 'clusterInfo.providers' during someone
        else's startProvider() depends on which of the two startup loops instantiated it — one pushes
        before starting and the other after — and on the order within the loop. Subscribing from
        startProvider() therefore works or not for reasons the author cannot see.

        A dependency graph was deliberately NOT built, the same call already made for pluviders: the
        order within a phase is not guaranteed and that is assumed. This hook makes the ONE thing that
        needed determinism deterministic, and nothing else.

        Optional, like setLogger: a provider built before this exists is simply never called.
    */
    onProvidersReady?: () => void | Promise<void>
    /*
        The providers this one consumes; the core instantiates them even when no channel asks for
        them (see Consumer.ts, resolveConsumedProviders). Declared here for the same reason as
        setLogger: the installed 'common-back' predates it.
    */
    requirements?: IProviderRequirements
}

/* Mirror of IProviderRequirements in common-back, until the installed version carries it. */
export interface IProviderRequirements {
    providers: string[]
}
