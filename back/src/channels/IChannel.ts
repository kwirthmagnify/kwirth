import { IChannel, IBackChannelObject } from '@kwirthmagnify/kwirth-common-back'
import { ClusterInfo } from '../model/ClusterInfo'
import { componentLogger, ELogComponent } from '../tools/Logging'

export { IChannel }

export type TChannelConstructor = (new (clusterInfo:ClusterInfo, backChannelObject:IBackChannelObject) => IChannel)|undefined

/*
    The very same 'backChannelObject' is lent to EVERY channel, so when one of them writes to the log
    the core cannot tell which one spoke: the line read '[channel] [INFO] <message>' and you were left
    guessing. That is why each plugin invented a prefix of its own — '[excubitor]', '[AGORA-INFRA]',
    '[situs 94pf58]' — each in its own shape, while the ones that did not bother stayed anonymous
    forever.

    Here every channel gets ITS object, with the id put in front by the core. Whatever a plugin wants
    to add after that — its subsystem, its instance — still works and reads behind the id.

    The prefix is not repeated when the message already opens with exactly the channel id: some plugins
    have been writing it by hand for a long time, and '[excubitor] [excubitor] ...' helps nobody.
*/
const withChannelId = (backChannelObject: IBackChannelObject, channelId: string): IBackChannelObject => {
    const log = componentLogger(ELogComponent.CHANNEL, channelId)
    const alreadySaysIt = (message: unknown): boolean => typeof message === 'string' && message.startsWith(`[${channelId}]`)
    return {
        ...backChannelObject,
        logInfo: (message: unknown) => alreadySaysIt(message) ? backChannelObject.logInfo?.(message) : log.info(message),
        logTrace: (message: unknown) => alreadySaysIt(message) ? backChannelObject.logTrace?.(message) : log.trace(message),
        logWarning: (message: unknown) => alreadySaysIt(message) ? backChannelObject.logWarning?.(message) : log.warning(message),
        logError: (message: unknown) => alreadySaysIt(message) ? backChannelObject.logError?.(message) : log.error(message)
    }
}

export const createChannelInstance = (channelConstructor:TChannelConstructor, clusterInfo: ClusterInfo, backChannelObject:IBackChannelObject, channelId?: string): IChannel | null => {
    if (!channelConstructor) throw  new Error('Error: channelConstructor is empty')
    return new channelConstructor(clusterInfo, channelId ? withChannelId(backChannelObject, channelId) : backChannelObject)
}
