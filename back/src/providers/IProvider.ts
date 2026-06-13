import { IChannel } from "../channels/IChannel"
import { Router } from 'express'
import { ClusterInfo } from "../model/ClusterInfo"
import { KwirthData } from "@kwirthmagnify/kwirth-common"
import { ApiKeyApi } from "../api/ApiKeyApi"

export type TProviderConstructor = (new (clusterInfo:ClusterInfo, kwirthData:KwirthData) => IProvider)|undefined

export const createProviderInstance = (providerConstructor:TProviderConstructor, clusterInfo: ClusterInfo, kwirthData:KwirthData): IProvider | null => {
    if (!providerConstructor) throw  new Error('Error: providerConstructor is empty')
    return new providerConstructor(clusterInfo, kwirthData)
}

export interface IProvider {
    readonly id: string
    readonly providesRouter: boolean 
    readonly requiresApiKeyApi: boolean 
    addSubscriber: (c:IChannel, data:any) => Promise<void>
    removeSubscriber: (c:IChannel) => Promise<void>
    startProvider: () => Promise<void>
    stopProvider: () => Promise<void>
    router: Router|undefined
    routerAlias: string|undefined
    started?: boolean
    apiKeyApi: ApiKeyApi|undefined
}
