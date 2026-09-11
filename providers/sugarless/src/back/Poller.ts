import {
    EGlucoseUnit, ESugarlessErrorKind, ESugarlessPayload, IGlucoseSample, ISugarlessConfig, ISugarlessEvent
} from '../common/Sugarless'
import { LibreClient, SugarlessError } from './LibreClient'

/*
    El poller: un temporizador, un historico en memoria y la deduplicacion.

    A diferencia de http-pull-push, el polling NO es lazy: mientras el provider este arrancado y
    configurado, consulta. Es deliberado y es lo contrario de lo que hace el provider generico. La
    razon es que aqui el historico es el producto: si solo se consultara mientras hay una pestaña
    abierta, al abrirla habria que empezar la grafica de cero y no habria historico que mostrar.

    Sin credenciales configuradas no se hace ni una peticion.
*/

export type TEventCallback = (event: ISugarlessEvent) => void

export class Poller {
    private config: ISugarlessConfig
    private client: LibreClient
    private onEvent: TEventCallback
    private timer: NodeJS.Timeout | undefined
    private running = false

    // El historico. La muestra mas reciente es la ultima.
    private samples: IGlucoseSample[] = []
    private unit = EGlucoseUnit.MGDL
    private targetLow: number | undefined
    private targetHigh: number | undefined

    /*
        Ultimo estado que no era una muestra (sin lectura, o error). Se guarda por dos motivos: para
        no repetirlo en cada ciclo mientras no cambie, y para poder contarselo a una pestaña que se
        acaba de abrir sin que tenga que esperar un intervalo entero.
    */
    private lastStatus: ISugarlessEvent | undefined

    constructor(config: ISugarlessConfig, client: LibreClient, onEvent: TEventCallback) {
        this.config = config
        this.client = client
        this.onEvent = onEvent
    }

    start = (): void => {
        if (this.timer) return
        // Primer pull inmediato: nadie deberia esperar un intervalo entero para ver el primer valor.
        void this.tick()
        this.timer = setInterval(() => { void this.tick() }, this.config.intervalSeconds * 1000)
    }

    stop = (): void => {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
    }

    /** La ventana completa, para enviarsela a quien se acaba de suscribir. */
    snapshotEvent = (): ISugarlessEvent => ({
        payloadType: ESugarlessPayload.SNAPSHOT,
        unit: this.unit,
        samples: [...this.samples],
        targetLow: this.targetLow,
        targetHigh: this.targetHigh
    })

    /** El estado pendiente (sin lectura o error), si el ultimo ciclo acabo en uno. */
    statusEvent = (): ISugarlessEvent | undefined => this.lastStatus

    sampleCount = (): number => this.samples.length

    /*
        Un ciclo. Si el anterior sigue en vuelo se salta este: el intervalo marca el ritmo, no la
        latencia de la API.
    */
    tick = async (): Promise<void> => {
        if (this.running) return
        this.running = true
        try {
            const reading = await this.client.read()
            this.unit = reading.unit
            this.targetLow = reading.targetLow
            this.targetHigh = reading.targetHigh

            if (!reading.sample) {
                this.publishStatus({
                    payloadType: ESugarlessPayload.NO_DATA,
                    unit: this.unit,
                    error: 'The connection is fine, but there is no current reading: the patient device has not synced recently.',
                    targetLow: this.targetLow,
                    targetHigh: this.targetHigh
                })
                return
            }

            this.lastStatus = undefined
            if (!this.append(reading.sample)) return

            this.onEvent({
                payloadType: ESugarlessPayload.SAMPLE,
                unit: this.unit,
                sample: reading.sample,
                targetLow: this.targetLow,
                targetHigh: this.targetHigh
            })
        }
        catch (err) {
            const kind = err instanceof SugarlessError ? err.kind : ESugarlessErrorKind.UNEXPECTED
            this.publishStatus({
                payloadType: ESugarlessPayload.ERROR,
                unit: this.unit,
                errorKind: kind,
                error: err instanceof Error ? err.message : String(err)
            })
        }
        finally {
            this.running = false
        }
    }

    /*
        Añade al historico si la muestra es nueva. Devuelve false si no lo era.

        El sensor produce un valor cada ~15 minutos pero se le pregunta cada minuto, asi que la
        mayoria de los ciclos devuelven la MISMA lectura. Se compara por marca de tiempo, que es lo
        unico fiable: dos lecturas distintas pueden tener el mismo valor de glucosa.

        La comparacion es '<=' y no '!=' a proposito: asi descarta de paso una lectura mas antigua
        que la ultima, que dejaria el historico desordenado y la grafica con un zigzag.
    */
    private append = (sample: IGlucoseSample): boolean => {
        const last = this.samples[this.samples.length - 1]
        if (last && sample.timestamp <= last.timestamp) return false

        this.samples.push(sample)
        while (this.samples.length > this.config.maxSamples) this.samples.shift()
        return true
    }

    // Emite un estado solo si ha cambiado: repetirlo cada ciclo no aporta nada y llena el log.
    private publishStatus = (event: ISugarlessEvent): void => {
        const previous = this.lastStatus
        this.lastStatus = event
        if (previous && previous.payloadType === event.payloadType && previous.error === event.error) return
        this.onEvent(event)
    }
}
