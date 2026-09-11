import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

// Tipos de la federación multi-cluster del lado BACK (back-a-back por WebSocket). Son COPIA propia del
// back: el front tiene sus equivalentes en common-front (IClusterEndpoint/ERemoteConnState/... para SU
// federación, p.ej. la vista landscape de Excubitor). No se unifican: hay canales que federan por el front
// y otros por el back, y no existe una forma única de federar. Estos viven aquí porque los consume el back.

// Endpoint de un cluster remoto al que un back abre una conexión federada. Sale de la lista de clusters
// del perfil del usuario ({name, url, accessString}); el core la lee con readUserStore. 'id' (uid del
// cluster remoto) es opcional: puede no estar resuelto todavía.
export interface IClusterEndpoint {
    name: string
    url: string
    accessString: string
    id?: string
}

// Estado de una conexión remota gestionada por el core. Nunca string literals.
export enum ERemoteConnState {
    CONNECTED = 'connected',
    RECONNECTING = 'reconnecting',
    DOWN = 'down'
}

// Callbacks que el plugin registra para consumir UNA conexión remota (versión singular: 1 bot = 1 sala =
// 1 cluster remoto = 1 handle; el plugin abre N conexiones y guarda N handles). El WS crudo NO se expone.
export interface IRemoteChannelHandlers {
    onMessage: (msg: IInstanceMessage) => void
    onState: (state: ERemoteConnState) => void
}

// Handle gestionado que devuelve openRemoteChannel: el WS crudo NO se expone (se reemplaza en reconexión).
export interface IRemoteChannelHandle {
    send: (msg: IInstanceMessage) => void   // enruta al WS vivo (rellena el instance capturado en el START)
    close: () => void                       // cierra la conexión y detiene los reintentos
}
