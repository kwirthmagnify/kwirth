import { MircClient } from './MircClient'

export interface IMircData {
    client?: MircClient
    nick: string
    started: boolean
    // current open conversation
    selectedPeer?: string
    selectedClusterName?: string
}

export class MircData implements IMircData {
    client?: MircClient = undefined
    nick = ''
    started = false
    selectedPeer?: string = undefined
    selectedClusterName?: string = undefined
}
