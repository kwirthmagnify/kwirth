import { IChannel } from "../channels/IChannel"
import { Router } from 'express'
import { ClusterInfo } from "../model/ClusterInfo"

export type TProviderConstructor = (new (clusterInfo:ClusterInfo) => IProvider)|undefined

export const createProviderInstance = (providerConstructor:TProviderConstructor, clusterInfo: ClusterInfo): IProvider | null => {
    if (!providerConstructor) throw  new Error('Error: providerConstructor is empty')
    return new providerConstructor(clusterInfo)
}

export interface IProvider {
    readonly id: string
    readonly providesRouter: boolean 
    addSubscriber: (c:IChannel, data:any) => Promise<void>
    removeSubscriber: (c:IChannel) => Promise<void>
    startProvider: () => Promise<void>
    router: Router|undefined
}
