import {
    EGlucoseUnit, ESugarlessErrorKind, ESugarlessPayload, IGlucoseSample, ISugarlessEvent
} from '../common/SugarlessTypes'

/*
    Estado de una pestaña y la funcion que lo hace avanzar.

    El reductor vive aqui, separado del componente y sin nada de React, porque es la unica logica del
    plugin: decidir que ve el usuario cuando NO hay curva. Esos casos son cuatro y se confunden con
    facilidad, asi que se testean.
*/

export enum ESugarlessStatus {
    /** El provider no tiene credenciales: lo arregla un administrador. */
    NOT_CONFIGURED = 'notConfigured',
    /** Suscrito y esperando la primera lectura. */
    WAITING = 'waiting',
    /** Conexion buena, sin lectura actual. NO es un error. */
    NO_DATA = 'noData',
    ERROR = 'error',
    OK = 'ok'
}

export interface ISugarlessData {
    samples: IGlucoseSample[]
    unit: EGlucoseUnit
    targetLow?: number
    targetHigh?: number
    status: ESugarlessStatus
    statusMessage: string
    started: boolean
    paused: boolean
}

export class SugarlessData implements ISugarlessData {
    samples: IGlucoseSample[] = []
    unit = EGlucoseUnit.MGDL
    targetLow?: number
    targetHigh?: number
    status = ESugarlessStatus.WAITING
    statusMessage = ''
    started = false
    paused = false
}

const MESSAGES: Record<ESugarlessErrorKind, string> = {
    [ESugarlessErrorKind.NOT_CONFIGURED]: 'Sugarless has no LibreLinkUp credentials yet. An administrator sets them in Manage extensions → Providers.',
    [ESugarlessErrorKind.AUTH_FAILED]: 'LibreLinkUp rejected the credentials.',
    [ESugarlessErrorKind.CLIENT_VERSION]: 'The declared client version is too old for the API.',
    [ESugarlessErrorKind.WRONG_REGION]: 'The account lives in a different region.',
    [ESugarlessErrorKind.NO_FOLLOWED_PATIENT]: 'This account does not follow any patient: the sensor has to be shared with it from the patient app.',
    [ESugarlessErrorKind.NETWORK]: 'Could not reach LibreLinkUp.',
    [ESugarlessErrorKind.UNEXPECTED]: 'Unexpected answer from LibreLinkUp.'
}

/*
    Aplica un evento del provider al estado. Devuelve true si algo ha cambiado y hay que repintar.

    Se respeta el orden de llegada tal cual: el provider ya deduplica por marca de tiempo y solo emite
    muestras nuevas, asi que aqui no se vuelve a filtrar. Duplicar esa logica en el front seria
    tener dos sitios donde equivocarse.
*/
export const applyEvent = (data: ISugarlessData, event: ISugarlessEvent | undefined): boolean => {
    if (!event) return false

    if (event.unit) data.unit = event.unit
    if (event.targetLow !== undefined) data.targetLow = event.targetLow
    if (event.targetHigh !== undefined) data.targetHigh = event.targetHigh

    switch (event.payloadType) {
        case ESugarlessPayload.SNAPSHOT:
            data.samples = [...(event.samples ?? [])]
            // Una ventana vacia no es un error: es que el provider aun no ha leido nada.
            data.status = data.samples.length > 0 ? ESugarlessStatus.OK : ESugarlessStatus.WAITING
            data.statusMessage = ''
            return true

        case ESugarlessPayload.SAMPLE:
            if (!event.sample) return false
            data.samples = [...data.samples, event.sample]
            data.status = ESugarlessStatus.OK
            data.statusMessage = ''
            return true

        case ESugarlessPayload.NO_DATA:
            data.status = ESugarlessStatus.NO_DATA
            data.statusMessage = event.error ?? 'No current reading: the patient device has not synced recently.'
            return true

        case ESugarlessPayload.ERROR:
            // Falta de configuracion tiene estado propio: no es una averia, es que aun no se ha puesto.
            data.status = event.errorKind === ESugarlessErrorKind.NOT_CONFIGURED
                ? ESugarlessStatus.NOT_CONFIGURED
                : ESugarlessStatus.ERROR
            data.statusMessage = event.errorKind
                ? `${MESSAGES[event.errorKind]} ${event.error ?? ''}`.trim()
                : (event.error ?? 'Unknown error')
            return true

        default:
            return false
    }
}

/** La lectura mas reciente, que es la que se enseña en grande. */
export const lastSample = (data: ISugarlessData): IGlucoseSample | undefined =>
    data.samples.length > 0 ? data.samples[data.samples.length - 1] : undefined
