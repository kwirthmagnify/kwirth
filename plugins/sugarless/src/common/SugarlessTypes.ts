import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

/*
    Contrato con el provider 'sugarless'.

    Estos tipos son un ESPEJO de providers/sugarless/src/common/Sugarless.ts. Se duplican a proposito:
    un plugin no puede importar del paquete de un provider, y publicar un paquete de tipos compartido
    para cuatro campos seria peor que la duplicacion. Si el provider cambia su contrato, esto se cambia
    a mano — por eso los tests comprueban la forma del evento y no solo que llegue algo.
*/

export enum EGlucoseUnit {
    MGDL = 'mg/dL',
    MMOLL = 'mmol/L'
}

export enum ETrendArrow {
    FALLING_FAST = 1,
    FALLING = 2,
    STABLE = 3,
    RISING = 4,
    RISING_FAST = 5
}

export interface IGlucoseSample {
    /** epoch ms, derivado del FactoryTimestamp (UTC) por el provider */
    timestamp: number
    /** en la unidad de la cuenta; no se convierte en ningun punto */
    value: number
    trend: ETrendArrow
    isHigh: boolean
    isLow: boolean
}

export enum ESugarlessPayload {
    SNAPSHOT = 'snapshot',
    SAMPLE = 'sample',
    NO_DATA = 'nodata',
    ERROR = 'error'
}

export enum ESugarlessErrorKind {
    NOT_CONFIGURED = 'notConfigured',
    AUTH_FAILED = 'authFailed',
    CLIENT_VERSION = 'clientVersion',
    WRONG_REGION = 'wrongRegion',
    NO_FOLLOWED_PATIENT = 'noFollowedPatient',
    NETWORK = 'network',
    UNEXPECTED = 'unexpected'
}

export interface ISugarlessEvent {
    payloadType: ESugarlessPayload
    unit: EGlucoseUnit
    samples?: IGlucoseSample[]
    sample?: IGlucoseSample
    errorKind?: ESugarlessErrorKind
    error?: string
    targetLow?: number
    targetHigh?: number
}

/** Lo que el back del canal manda al front: el evento del provider, tal cual. */
export interface ISugarlessMessageResponse extends IInstanceMessage {
    msgtype: 'sugarlessmessageresponse'
    event: ISugarlessEvent
}

/*
    Glifo de cada tendencia. Vive aqui y no en el componente porque los tests lo comprueban: una flecha
    equivocada en una grafica de glucosa no es un detalle estetico.
*/
export const trendArrow = (trend: ETrendArrow): string => {
    switch (trend) {
        case ETrendArrow.FALLING_FAST: return '↓'
        case ETrendArrow.FALLING: return '↘'
        case ETrendArrow.STABLE: return '→'
        case ETrendArrow.RISING: return '↗'
        case ETrendArrow.RISING_FAST: return '↑'
        default: return '→'
    }
}
