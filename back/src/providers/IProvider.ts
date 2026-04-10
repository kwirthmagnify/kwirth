import { IChannel } from "../channels/IChannel"
import { Router } from 'express'

type TProviderConstructor = (new () => IProvider)|undefined

export const createProviderInstance = (providerConstructor:TProviderConstructor): IProvider | null => {
    if (!providerConstructor) throw  new Error('Error: channelConstructor is null')
    return new providerConstructor()
}

export interface IProvider {
    readonly id: string
    readonly providesRouter: boolean 
    addSubscriber: (c:IChannel, data:any) => Promise<void>
    removeSubscriber: (c:IChannel) => Promise<void>
    startProvider: () => Promise<void>
    router: Router|undefined
}
