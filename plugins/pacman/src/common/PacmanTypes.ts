import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

/**
 * El canal Pac-Man no consume datos del cluster: la partida corre entera en el
 * front (iframe). El back existe solo para cumplir el contrato de canal de Kwirth
 * y para persistir el marcador.
 */
export interface IPacmanMessage extends IInstanceMessage {
    msgtype: 'pacmanmessage'
    text: string
}

export interface IPacmanInstanceConfig {
    /*
        Sender al que avisar cuando alguien bate el record. Opcionales: sin ellos
        no se notifica nada. Viajan al back dentro de `instanceConfig.data`.
    */
    senderId?: string
    senderConfigName?: string
}
