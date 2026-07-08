import { IChannel, IBackChannelObject } from '@kwirthmagnify/kwirth-common-back'
import { ClusterInfo } from '../model/ClusterInfo'

export { IChannel }

export type TChannelConstructor = (new (clusterInfo:ClusterInfo, backChannelObject:IBackChannelObject) => IChannel)|undefined

export const createChannelInstance = (channelConstructor:TChannelConstructor, clusterInfo: ClusterInfo, backChannelObject:IBackChannelObject): IChannel | null => {
    if (!channelConstructor) throw  new Error('Error: channelConstructor is empty')
    return new channelConstructor(clusterInfo, backChannelObject)
}
