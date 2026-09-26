/*
    De DONDE viene una linea. Viaja en el mensaje, y no lo inventa el sender: un destino solo puede
    etiquetar lo que le llega etiquetado. Si esto se pierde por el camino, el log acaba en el destino sin
    poder filtrarse por nada — es decir, inutil.

    Todo opcional porque no todo mensaje viene de un pod: un aviso de un canal, un evento de negocio o una
    linea que entra por un recolector externo tienen orígenes distintos, y cada uno rellena lo que sabe.
*/
export interface ISenderMessageOrigin {
    /** the cluster it came from, when more than one is in play */
    cluster?: string
    namespace?: string
    pod?: string
    container?: string
    /** where it ENTERED Kwirth: the id of the provider or the channel (e.g. 'fluentbit', 'log') */
    source?: string
    /** name of the service or the controller, where known */
    service?: string
    /** the line's original timestamp, if it carried one; in ms since the epoch */
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

// OPTIONAL return of a send: free-form JSON the sender may give back to the caller (a ticketing sender,
// for instance, returns { issueKey, url } after creating the ticket). Pure notification senders keep
// returning void; the caller decides whether to use the result. See plans/webhook-extension/PLAN.md.
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
    // OPTIONAL: queries the current state of an external entity created by the sender (a ticketing
    // ticket → its status, say). The pull counterpart of the webhook (push): it allows lost states to be
    // RECONCILED (core down, or no subscriber when the callback arrived). Returns undefined when the
    // sender does not support it, the config does not exist, or it could not be resolved. See
    // plans/webhook-extension/PLAN.md (H3b-recon).
    fetchStatus?(senderId: string, configName: string, externalId: string): Promise<string | undefined>
    addConfig(senderId: string, config: ISenderConfig): boolean
    listSenders(): Array<{ id: string; configNames: string[] }>
    getConfig(senderId: string, configName: string): ISenderConfig | undefined
}
