/*
    El contrato entre el back y el front de Kwirth Status.

    Vive en 'common' porque lo comparten los dos lados: si esto fueran uniones de strings sueltas en cada
    lado, un cambio en uno se descubriría en tiempo de ejecución y no al compilar.
*/

/** Qué clase de pieza es. Determina de dónde sale en ClusterInfo y cómo se pinta. */
export enum EComponentKind {
    PROVIDER = 'provider',
    PLUVIDER = 'pluvider',
    SENDER = 'sender',
    WEBHOOK = 'webhook',
    CHANNEL = 'channel'
}

/*
    Cómo está una pieza AHORA.

    El objetivo de esta enumeración es que un administrador no confunda casos que hoy se parecen: una
    extensión instalada que nunca arrancó, una que arrancó y se cayó, y una que funciona pero tiene el
    router sin montar. Los tres se ven igual desde fuera —"no va"— y se arreglan de forma distinta.

    ⚠️ ACTIVE y IDLE (instanciado con y sin consumidores) NO están todavía: distinguirlos exige preguntarle
    al provider a quién tiene dentro, y ese contrato llega en S2. Hasta entonces existe INSTANTIATED, que
    los engloba. Un estado que no se puede saber no se adivina.
*/
export enum EComponentHealth {
    /** Instanciado y corriendo. Si tiene consumidores o no, todavía no se sabe (S2). */
    INSTANTIATED = 'instantiated',
    /** Instalado, pero el core nunca lo puso en marcha. `reason` dice por qué. */
    NOT_INSTANTIATED = 'not-instantiated',
    /** Corriendo, pero algo suyo necesita un reinicio del servidor para estar disponible. */
    PENDING_RESTART = 'pending-restart',
    /** Se intentó arrancar y falló. `reason` lleva el error. */
    FAILED = 'failed',
    /** No hay forma de saberlo. Distinto de "está mal": es que el dato no existe (RNF2). */
    UNKNOWN = 'unknown'
}

/** Una pieza del inventario. */
export interface IStatusComponent {
    kind: EComponentKind
    id: string
    displayName: string
    health: EComponentHealth
    /**
     * POR QUÉ está en ese estado, en lenguaje de quien lo lee. Es el campo que justifica la pantalla
     * entera: un 'not running' a secas es lo que ya hay hoy y no resuelve nada.
     */
    reason?: string
    version?: string
    /** De dónde vino: un marketplace, 'dev', 'bundled'… lo mismo que muestran los gestores. */
    installedFrom?: string
}

/**
 * El inventario completo, tal y como viaja al front.
 *
 * `cluster` va desde el primer día aunque hoy siempre sea el mismo: el día que haya vista federada, los
 * tipos no tienen que cambiar. Cuesta un campo ahora y ahorra rehacer el front después.
 */
export interface IStatusInventory {
    cluster: string
    takenAt: number
    components: IStatusComponent[]
}

/** Qué trae un mensaje de datos de este canal. Hoy solo hay uno; el diagrama y los contadores vendrán. */
export enum EStatusPayload {
    INVENTORY = 'inventory'
}

/**
 * Mensaje de datos del back al front.
 *
 * La cabecera (msgtype, channel, action, flow, type, instance) es la que el core espera de cualquier
 * canal; lo propio de este plugin es 'payloadType' y lo que cuelga de él.
 */
export interface IStatusMessageResponse {
    msgtype: string
    channel: string
    action: string
    flow: string
    type: string
    instance: string
    payloadType: EStatusPayload
    inventory?: IStatusInventory
}

/** Lo que el front puede pedir. El inventario se manda al arrancar; esto es para volver a pedirlo. */
export enum EStatusCommand {
    REFRESH = 'refresh'
}
