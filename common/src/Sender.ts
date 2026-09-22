/*
    De DONDE viene una linea. Viaja en el mensaje, y no lo inventa el sender: un destino solo puede
    etiquetar lo que le llega etiquetado. Si esto se pierde por el camino, el log acaba en el destino sin
    poder filtrarse por nada — es decir, inutil.

    Todo opcional porque no todo mensaje viene de un pod: un aviso de un canal, un evento de negocio o una
    linea que entra por un recolector externo tienen orígenes distintos, y cada uno rellena lo que sabe.
*/
export interface ISenderMessageOrigin {
    /** cluster del que salio, cuando hay mas de uno en juego */
    cluster?: string
    namespace?: string
    pod?: string
    container?: string
    /** por donde ENTRO en Kwirth: el id del provider o del canal (p.ej. 'fluentbit', 'log') */
    source?: string
    /** nombre del servicio o del controlador, cuando se conoce */
    service?: string
    /** marca de tiempo original de la linea, si la traia; en ms desde epoch */
    timestamp?: number
}

export interface ISenderMessage {
    subject?: string
    body: string
    to?: string | string[]
    level?: 'debug' | 'info' | 'warning' | 'error'
    metadata?: Record<string, unknown>
    /*
        Origen de la linea. Se añade aparte de 'metadata' —que es JSON libre— porque esto SI es contrato:
        el destino necesita saber donde mirar para etiquetar, y un acuerdo tacito dentro de metadata se
        rompe en cuanto haya dos senders.
    */
    origin?: ISenderMessageOrigin
}

export interface ISenderConfig {
    name: string
    [key: string]: unknown
}

export interface ISenderStoredConfig {
    configs: ISenderConfig[]
    [key: string]: unknown
}

// Retorno OPCIONAL de un send: JSON libre que el sender puede devolver al llamante (p.ej. un sender
// de ticketing devuelve { issueKey, url } tras crear el ticket). Los senders de notificación pura
// siguen devolviendo void; el llamante decide si usa el resultado. Ver plans/webhook-extension/PLAN.md.
export interface ISenderResult {
    [key: string]: unknown
}

export interface ISenderAccess {
    send(senderId: string, configName: string, message: ISenderMessage): Promise<ISenderResult | void>
    /*
        Entrega un LOTE. Existe porque 'send' es un mensaje por llamada con su propio await, y eso sirve
        para un aviso y no para un caudal de log: un await por linea convierte el reenvio en una fila de
        idas y venidas a la red.

        Un await por LOTE mantiene el significado de la promesa —"estas N lineas entregadas"— que es lo que
        permite al llamante contar lo enviado y reaccionar a lo que falle. Si el sender no lo implementa,
        el core lo entrega mensaje a mensaje: nadie tiene que cambiar para seguir funcionando.
    */
    sendBatch?(senderId: string, configName: string, messages: ISenderMessage[]): Promise<ISenderResult | void>
    // OPCIONAL: consulta el estado actual de una entidad externa creada por el sender (p.ej. un ticket de
    // ticketing → su status). Contraparte de pull del webhook (push): permite RECONCILIAR estados perdidos
    // (core caído / sin suscriptor cuando llegó el callback). Devuelve undefined si el sender no lo soporta,
    // la config no existe, o no se pudo resolver. Ver plans/webhook-extension/PLAN.md (H3b-recon).
    fetchStatus?(senderId: string, configName: string, externalId: string): Promise<string | undefined>
    addConfig(senderId: string, config: ISenderConfig): boolean
    listSenders(): Array<{ id: string; configNames: string[] }>
    getConfig(senderId: string, configName: string): ISenderConfig | undefined
}
