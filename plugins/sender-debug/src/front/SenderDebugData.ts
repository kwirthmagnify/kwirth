import { ESenderDebugLevel, ISenderDebugResult, ISenderDebugSendRequest, ISenderDebugSenderInfo } from '../common/SenderDebugTypes'

/**
 * Una linea del historial: lo que se PIDIO enviar y lo que contesto el sender.
 *
 * Las dos mitades viven juntas porque en un banco de pruebas valen lo mismo: saber que contesto el
 * destino no sirve de nada si hay que reconstruir de memoria que se le mando. La peticion ademas no
 * vuelve del back — la tiene el front, que es quien la compuso —, asi que este es el unico sitio
 * donde pueden estar las dos.
 */
export interface ISenderDebugHistoryEntry {
    /** ausente solo si llegase una respuesta sin su peticion (una sesion anterior, un rearranque) */
    request?: ISenderDebugSendRequest
    /** ausente mientras el envio esta EN VUELO: la fila ya se ve, y se completa al contestar */
    result?: ISenderDebugResult
    /**
     * El canal se paro con este envio todavia en vuelo, asi que su respuesta ya no va a llegar. Es un
     * dato del FRONT, no del sender: por eso no se inventa un resultado — no se sabe si llego o no.
     */
    abandoned?: boolean
}

/**
 * El mensaje que se esta componiendo, en crudo (tal y como se teclea). Vive en el data del canal y no
 * en el estado de React porque la pestaña se desmonta al cambiar de pestaña, y perder un cuerpo
 * escrito a mano por ir a mirar otra cosa es exactamente lo que no puede pasar en un banco de pruebas.
 */
export interface ISenderDebugForm {
    senderId: string
    configName: string
    subject: string
    body: string
    /** destinatarios separados por comas; que signifique cada uno lo decide el sender */
    to: string
    level: ESenderDebugLevel
    /** JSON libre; vacio = sin metadata */
    metadata: string
    /** entregar por sendBatch() en vez de por send() */
    batch: boolean
    count: number
}

export interface ISenderDebugData {
    /** catalogo que manda el back al arrancar la instancia y en cada LIST */
    senders: ISenderDebugSenderInfo[]
    /** envios de la sesion, el mas reciente primero, recortado a maxHistory */
    history: ISenderDebugHistoryEntry[]
    /** señales que quedan por mostrar como texto (registro no disponible, instancia perdida...) */
    signals: string[]
    /** el core acepto la configuracion de la instancia (respuesta al start) */
    configAccepted: boolean
    started: boolean
    form: ISenderDebugForm
}

export class SenderDebugData implements ISenderDebugData {
    senders: ISenderDebugSenderInfo[] = []
    history: ISenderDebugHistoryEntry[] = []
    signals: string[] = []
    configAccepted = false
    started = false
    form: ISenderDebugForm = {
        senderId: '',
        configName: '',
        subject: 'Kwirth sender debug',
        body: 'Test message sent from the Sender Debug channel.',
        to: '',
        level: ESenderDebugLevel.INFO,
        metadata: '',
        batch: false,
        count: 3
    }
}
