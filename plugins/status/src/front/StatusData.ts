import { IStatusInventory } from '../common/StatusTypes'

/*
    El estado del tab. No hay historial ni acumulación: lo que se guarda es la ÚLTIMA foto recibida.

    Esto no es una simplificación temporal, es el producto: Kwirth Status enseña el ahora. Guardar
    muestras anteriores sería el primer paso hacia una serie temporal, que está explícitamente fuera.
*/
export interface IStatusData {
    inventory?: IStatusInventory
    /** Señales que hay que enseñar como texto: errores del canal, sobre todo. */
    signals: string[]
    /** El core aceptó la configuración de la instancia (respuesta al start). */
    configAccepted: boolean
    started: boolean
}

export class StatusData implements IStatusData {
    inventory?: IStatusInventory
    signals: string[] = []
    configAccepted = false
    started = false
}
