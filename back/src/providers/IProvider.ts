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
    This file used to be a MANUAL MIRROR of the contract published in common-back, and it had started to
    diverge. The contract's only source is now common-back: here what does not change is merely
    re-exported, and what the core needs to see is NARROWED with concrete types (Router, ApiKeyApi,
    ClusterInfo, IChannel) instead of the 'any' it is published with, plus the two runtime flags the core
    itself manages and that a provider's author does not implement.
*/

export { IProviderSubscriptionField, IProviderSubscriptionHelp, IProviderFieldDef }

/*
    The persistence the core injects into the provider. It is the same contract the channels receive
    (IBackChannelObject), but with a namespace of its own: 'kwirth-store-provider-<id>'.
    The 'secret' boolean decides the destination: true -> Secret, false -> ConfigMap.
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
    The view the CORE has of a provider. It is the published contract, with two additions:

      - the subscribers are IChannel and the routers are express Routers, not 'any': inside the core
        we do know those types and we do not want to lose them.
      - 'started' and 'configRouterStarted' are runtime state the core keeps, not something a
        provider's author implements; that is why they are not part of the published contract.
*/
export interface IProvider extends Omit<IPublicProvider, 'addSubscriber'|'removeSubscriber'|'updateSubscription'|'router'|'configRouter'|'apiKeyApi'> {
    addSubscriber: (c:IChannel, data:any) => Promise<void>
    removeSubscriber: (c:IChannel) => Promise<void>
    updateSubscription?: (c:IChannel, data:any) => Promise<void>
    router: Router|undefined
    /*
        The provider's management router (its own configuration). The core ALWAYS mounts it behind
        accessKey validation at '/core/providerconfig/<providerId>'. It is a different route from
        'router', which is public and can receive external traffic (OTLP, third-party POSTs).
    */
    configRouter?: Router
    started?: boolean
    configRouterStarted?: boolean
    apiKeyApi: ApiKeyApi|undefined
    /*
        Declared here and not taken from the published contract because 'common-back' has not been
        republished with it yet: as soon as npm serves the new version, this line is redundant. In the
        meantime the core compiles and the providers that already implement it receive their logger.
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
