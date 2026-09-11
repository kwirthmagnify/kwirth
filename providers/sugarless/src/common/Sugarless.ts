/*
    Tipos compartidos entre el back, el front (dialogo de configuracion) y los canales suscritos.

    A diferencia de http-pull-push, aqui NO hay dos capas de configuracion: hay UNA sola cuenta de
    LibreLinkUp. Eso simplifica el contrato de suscripcion hasta hacerlo vacio: quien se suscribe no
    elige nada, recibe la unica serie que hay.
*/

export enum EGlucoseUnit {
    /** GlucoseUnits / uom = 1. Confirmado: en la lectura de referencia Value == ValueInMgPerDl. */
    MGDL = 'mg/dL',
    MMOLL = 'mmol/L'
}

/*
    Flecha de tendencia tal como la entrega la API. Se modela como enum para no comparar numeros
    sueltos por el codigo, y porque el front necesita mapearla a un glifo.
    El valor 3 (STABLE) esta confirmado sobre una lectura real; el resto del dominio es la
    interpretacion habitual de la API y esta pendiente de observarse.
*/
export enum ETrendArrow {
    FALLING_FAST = 1,
    FALLING = 2,
    STABLE = 3,
    RISING = 4,
    RISING_FAST = 5
}

export interface IGlucoseSample {
    /**
     * Epoch ms. Se deriva SIEMPRE del FactoryTimestamp, que viene en UTC.
     * Nunca del Timestamp, que es hora local sin offset: ambigua por definicion y rota en los
     * cambios de hora, con el agravante de que falla dibujando mal, no lanzando.
     */
    timestamp: number
    /** Valor en la unidad de la cuenta. No se convierte en ningun punto del flujo. */
    value: number
    trend: ETrendArrow
    /** Los calcula Abbott. No se recalculan en el front. */
    isHigh: boolean
    isLow: boolean
}

export enum ESugarlessPayload {
    /** Ventana completa. Se envia a cada suscriptor en el momento de suscribirse. */
    SNAPSHOT = 'snapshot',
    /** Una muestra nueva, ya deduplicada. */
    SAMPLE = 'sample',
    /** Conexion correcta pero sin lectura actual. NO es un error, ver README. */
    NO_DATA = 'nodata',
    ERROR = 'error'
}

/*
    Motivo del error, separado del mensaje. El canal suscrito necesita poder distinguir "esto lo
    arregla el administrador" de "esto se arregla solo en el siguiente ciclo", y un string libre no
    sirve para eso.
*/
export enum ESugarlessErrorKind {
    NOT_CONFIGURED = 'notConfigured',
    AUTH_FAILED = 'authFailed',
    CLIENT_VERSION = 'clientVersion',
    WRONG_REGION = 'wrongRegion',
    NO_FOLLOWED_PATIENT = 'noFollowedPatient',
    NETWORK = 'network',
    UNEXPECTED = 'unexpected'
}

/*
    Lo que el provider entrega al suscriptor. No lleva envoltorio de 'config' como http-pull-push
    porque no hay varias conexiones que distinguir.
*/
export interface ISugarlessEvent {
    payloadType: ESugarlessPayload
    unit: EGlucoseUnit
    /** SNAPSHOT: la ventana entera, de la mas antigua a la mas reciente. */
    samples?: IGlucoseSample[]
    /** SAMPLE: la muestra nueva. */
    sample?: IGlucoseSample
    /** ERROR */
    errorKind?: ESugarlessErrorKind
    error?: string
    /** Rango objetivo del paciente, en la unidad de la cuenta. Viene de la API, no se configura. */
    targetLow?: number
    targetHigh?: number
}

/*
    Configuracion del provider. Es UNA, no una lista.

    'password' es el unico campo secreto, y secreto significa UNA sola cosa: que el ConfigStore lo
    separa y lo persiste en un Secret en vez de en el ConfigMap. Por lo demas se trata como cualquier
    otro campo — viaja entero al dialogo, que lo pinta enmascarado con un ojo para revelarlo.
*/
export interface ISugarlessConfig {
    /** Credenciales de la cuenta SEGUIDORA de LibreLinkUp, no las del paciente. Ver README. */
    email: string
    password: string
    /** Vacio = derivar del claim 'region' del token. Con valor, manda sobre el claim. */
    region: string
    intervalSeconds: number
    maxSamples: number
    /** Version de cliente que se declara a Abbott. Configurable porque su minimo sube con el tiempo. */
    clientVersion: string
}

/** Resultado de probar las credenciales. La prueba la ejecuta el BACK, que es quien tiene la red. */
export interface ISugarlessTestResult {
    ok: boolean
    durationMs: number
    /** Region efectiva que se ha usado (la configurada, o la derivada del token). */
    region?: string
    /** Pacientes que sigue la cuenta. Cero es el fallo mas probable: falta compartir el sensor. */
    connections?: number
    /** true si ademas de conectar hay una lectura actual disponible. */
    hasReading?: boolean
    unit?: EGlucoseUnit
    errorKind?: ESugarlessErrorKind
    error?: string
}

export const DEFAULT_INTERVAL_SECONDS = 60
export const DEFAULT_MAX_SAMPLES = 240
export const DEFAULT_CLIENT_VERSION = '4.16.0'
export const MIN_INTERVAL_SECONDS = 30
export const REQUEST_TIMEOUT_MS = 15000

/*
    Intervalo minimo por cortesia con una API que no es oficial: un polling agresivo no aporta nada
    (el sensor produce un valor cada ~15 min) y es la via rapida a que corten el acceso.
*/

export const newSugarlessConfig = (): ISugarlessConfig => ({
    email: '',
    password: '',
    region: '',
    intervalSeconds: DEFAULT_INTERVAL_SECONDS,
    maxSamples: DEFAULT_MAX_SAMPLES,
    clientVersion: DEFAULT_CLIENT_VERSION
})
