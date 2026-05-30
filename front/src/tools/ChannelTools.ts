import { TChannelConstructor, IChannel } from "../channels/IChannel"

const createChannelInstance = (channelConstructor:TChannelConstructor): IChannel | null => {
    if (!channelConstructor) return null
    return new channelConstructor()
}

export { createChannelInstance }