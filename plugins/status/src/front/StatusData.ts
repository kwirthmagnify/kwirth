import { IStatusComponent, IStatusInventory } from '../common/StatusTypes'

/*
    El estado del tab: la última foto y la anterior, y nada más.

    DOS y no una porque con dos se puede dar una tasa, y una tasa es lo que distingue un provider que
    está moviendo datos ahora de uno que los movió hace tres días. DOS y no más porque guardar una
    tercera ya es una serie temporal, que está explícitamente fuera del producto — esta pantalla enseña
    el ahora, no la historia.
*/
export interface IStatusData {
    /**
     * Tabla o grafo. Vive aqui y no en el componente porque al cambiar de pestaña este se desmonta: en
     * un useState, volver al tab te devolvia siempre a la tabla aunque estuvieras mirando el grafo.
     */
    view: 'table' | 'graph'
    /** Lo tecleado en el filtro, por el mismo motivo. */
    filter: string
    /**
     * Cada cuantos SEGUNDOS pedir una foto nueva. 0 = solo a mano, y es el valor por defecto.
     *
     * Vive aqui para sobrevivir al cambio de pestaña, como los demas. Que arranque en 0 no es timidez:
     * el producto es "echar un ojo", y quien quiera vigilar lo enciende sabiendo que lo enciende.
     */
    autoRefresh: number
    inventory?: IStatusInventory
    /**
     * La foto anterior, y solo ella.
     *
     * Con dos fotos se puede dar una tasa —entregas por segundo entre una y otra—, que es lo que de
     * verdad dice si algo se mueve: un acumulado de siete millones no distingue un provider a tope de
     * uno que estuvo a tope hace tres días. Guardar MÁS de una sería empezar una serie temporal, que
     * está explícitamente fuera del producto.
     */
    previous?: IStatusInventory
    /** Señales que hay que enseñar como texto: errores del canal, sobre todo. */
    signals: string[]
    /** El core aceptó la configuración de la instancia (respuesta al start). */
    configAccepted: boolean
    started: boolean
}

/*
    How many consumers the core did NOT broker: what the producer acknowledges minus what the core
    registered.

    It exists because the graph is drawn from what the core saw go by, and subscribing without going
    through the core is possible — you call the provider's 'addSubscriber' and that is it — and some
    do. When that number is not zero the graph is INCOMPLETE and it has to be said: keeping quiet
    turns a partial drawing into a false claim ("nobody is consuming") precisely when someone is.

    A component that does not report one of the two figures is skipped: 'undefined' is not zero, and
    subtracting with a hole in it produces an invented number. The result is clamped at zero, because
    the opposite mismatch — the core knowing more than the provider — is an unsubscribe the provider
    has not applied yet, not an anonymous consumer.
*/
export const countUnbrokeredConsumers = (components: IStatusComponent[]): number =>
    components.reduce((n, c) => {
        if (c.subscribers === undefined || c.knownConsumers === undefined) return n
        return n + Math.max(0, c.subscribers - c.knownConsumers)
    }, 0)

export class StatusData implements IStatusData {
    view: 'table' | 'graph' = 'table'
    filter = ''
    autoRefresh = 0
    inventory?: IStatusInventory
    previous?: IStatusInventory
    signals: string[] = []
    configAccepted = false
    started = false
}
