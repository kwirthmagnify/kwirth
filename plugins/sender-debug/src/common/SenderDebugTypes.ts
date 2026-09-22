import { IInstanceMessage, ISenderMessage } from '@kwirthmagnify/kwirth-common'

/**
 * Lo que el front le pide al back. Un COMMAND del core, con este 'command' dentro.
 *
 * ⚠️ Todo comando tiene que viajar con su 'accessKey': el core los descarta ANTES de llegar al
 * plugin si no la lleva, y desde aqui solo se ve un timeout sin ninguna pista.
 */
export enum ESenderDebugCommand {
    /** devuelve el catalogo de senders, con sus configuraciones */
    LIST = 'list',
    /** entrega UN mensaje por send() */
    SEND = 'send',
    /** entrega N mensajes por sendBatch() — la ruta de lote, la que usan los destinos de log */
    SENDBATCH = 'sendbatch'
}

/** Naturaleza del mensaje que el back manda al front: o es el catalogo, o es el resultado de un envio. */
export enum ESenderDebugPayload {
    SENDERS = 'senders',
    RESULT = 'result'
}

/**
 * Que clase de sender es. Lo declara la extension en 'senderType' (opcional en ISender): un 'filter'
 * —regex, ratelimit, timed— NO entrega, encadena, asi que mandarle algo no prueba lo que parece.
 * Se marca en la lista por eso.
 */
export enum ESenderDebugKind {
    OUTPUT = 'output',
    FILTER = 'filter',
    /** la extension no lo declara: se asume salida, que es lo que es la mayoria */
    UNKNOWN = 'unknown'
}

/**
 * Nivel del mensaje. Espejo EXACTO de los valores de ISenderMessage.level, que en kwirth-common es
 * una union de literales: se redeclara como enum porque estos valores se comparan y se asignan en
 * los dos lados, y una union de strings suelta se escribe mal tarde o temprano.
 */
export enum ESenderDebugLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error'
}

/** Un sender tal y como lo ve este canal: lo instalado, mas lo que el core sabe de el ahora mismo. */
export interface ISenderDebugSenderInfo {
    id: string
    displayName?: string
    version?: string
    /** configuraciones dadas de alta para este sender */
    configNames: string[]
    /**
     * true si el core ya lo tiene instanciado. NO impide enviar: getSender() es perezoso, asi que el
     * primer envio lo instancia y lo arranca — igual que haria cualquier plugin al enviarle algo.
     */
    instantiated: boolean
    kind: ESenderDebugKind
    /** implementa sendBatch(): el lote es suyo de verdad, y no la entrega una a una que emula el core */
    supportsBatch: boolean
}

/** Una fila de GET /core/senders, con solo lo que a este plugin le interesa. */
export interface ISenderDebugCatalogueEntry {
    id: string
    displayName?: string
    version?: string
    description?: string
    configNames?: string[]
}

/** Lo que el front pide enviar. El mensaje viaja ya compuesto y validado desde el front. */
export interface ISenderDebugSendRequest {
    /** id local del envio, para casar la respuesta con su fila del historial */
    id: string
    senderId: string
    configName: string
    message: ISenderMessage
    /** solo SENDBATCH: cuantas copias del mensaje se entregan en el lote */
    count?: number
}

/** Que contesto el sender. Es el unico motivo de existir del plugin, asi que va entero. */
export interface ISenderDebugResult {
    /** el mismo id que traia la peticion */
    id: string
    ts: number
    senderId: string
    configName: string
    /** el envio fue por sendBatch() */
    batch: boolean
    /** mensajes entregados en este envio (1 si no es lote) */
    count: number
    ok: boolean
    /** lo que devolvio el sender. Ausente = devolvio void, que es lo normal en un sender de aviso */
    result?: Record<string, unknown>
    /** texto del error: la excepcion del sender, o por que no se pudo ni intentar */
    error?: string
    /**
     * Solo en lote: el sender NO implementa sendBatch(), asi que se entrego uno a uno — igual que
     * haria el core. Se marca porque no es lo mismo: no se recorrio la ruta de lote del sender.
     */
    emulated?: boolean
    /** cuanto tardo, en ms */
    elapsed: number
}

export interface ISenderDebugMessageResponse extends IInstanceMessage {
    msgtype: 'senderdebugmessageresponse'
    payloadType: ESenderDebugPayload
    /** presente cuando payloadType === SENDERS */
    senders?: ISenderDebugSenderInfo[]
    /** presente cuando payloadType === RESULT */
    result?: ISenderDebugResult
}

export interface ISenderDebugCommandMessage extends IInstanceMessage {
    msgtype: 'senderdebugmessage'
    command: ESenderDebugCommand
    data?: ISenderDebugSendRequest
}

/**
 * Preseleccion del setup. El mensaje NO vive aqui: se compone en la pestaña, porque un banco de
 * pruebas se usa enviando, mirando, corrigiendo y volviendo a enviar — y meterlo en el setup
 * obligaria a parar y rearrancar la instancia por cada cambio de texto.
 */
export interface ISenderDebugInstanceConfig {
    /** sender preseleccionado al abrir la pestaña; vacio = ninguno */
    senderId: string
    /** configuracion preseleccionada; vacio = ninguna */
    configName: string
}
