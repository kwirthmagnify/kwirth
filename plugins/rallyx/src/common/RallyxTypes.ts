import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

/**
 * The Rally-X channel does not consume cluster data: the game runs entirely in
 * the front (Phaser + iframe). The back exists only to fulfil the Kwirth channel
 * contract and to persist the high-score table.
 */
export interface IRallyxMessage extends IInstanceMessage {
    msgtype: 'rallyxmessage'
    text: string
}

export interface IRallyxInstanceConfig {
    /*
        Sender to notify when someone beats the record. Optional: without them
        no notification is sent. They travel to the back inside `instanceConfig.data`.
    */
    senderId?: string
    senderConfigName?: string
}
