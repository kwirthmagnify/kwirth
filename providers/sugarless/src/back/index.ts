import express, { Request, Response } from 'express'
import {
    IProvider, IProviderStorage, IProviderSubscriber, IProviderSubscriptionHelp, KwirthData
} from '@kwirthmagnify/kwirth-common-back'
import {
    EGlucoseUnit, ESugarlessErrorKind, ESugarlessPayload, ISugarlessConfig, ISugarlessEvent,
    ISugarlessTestResult, newSugarlessConfig
} from '../common/Sugarless'
import { validateConfig } from '../common/Validation'
import { ConfigStore } from './ConfigStore'
import { httpFetcher, LibreClient, SugarlessError, TFetcher } from './LibreClient'
import { Poller } from './Poller'

/*
    Provider sugarless: lee glucosa de LibreLinkUp y la empuja a los canales suscritos.

    Existe como provider propio, en vez de como una conexion de http-pull-push, porque el flujo de
    LibreLinkUp no es una peticion sino una sesion con un valor CALCULADO en medio (la cabecera
    Account-Id es el SHA-256 del id de usuario). Ver el PRD, seccion 3.

    Es dueño de su configuracion: la sirve y la guarda por su propio 'configRouter', que el core monta
    siempre detras de validacion de accessKey en /core/providerconfig/sugarless, y la persiste con el
    storage inyectado mandando la contraseña a un Secret. No usa configure().
*/

export class SugarlessProvider implements IProvider {
    public readonly id = 'sugarless'
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined
    public configRouter = express.Router()

    private store: ConfigStore
    private fetcher: TFetcher
    private config: ISugarlessConfig = newSugarlessConfig()
    private client: LibreClient | undefined
    private poller: Poller | undefined
    private subscribers = new Set<IProviderSubscriber>()

    constructor(_clusterInfo: unknown, _kwirthData: KwirthData, storage?: IProviderStorage, fetcher: TFetcher = httpFetcher) {
        this.store = new ConfigStore(storage)
        this.fetcher = fetcher
        this.addConfigRoutes()
    }

    // ── IProvider ───────────────────────────────────────────────────────────────

    startProvider = async (): Promise<void> => {
        try {
            this.config = await this.store.load()
        }
        catch (err) {
            console.error(`[sugarless] Could not load configuration: ${err}`)
        }

        if (!this.configured()) {
            console.log('[sugarless] No credentials configured: not polling')
            return
        }
        this.startPolling()
    }

    stopProvider = async (): Promise<void> => {
        this.poller?.stop()
        this.poller = undefined
        this.client = undefined
        this.subscribers.clear()
    }

    /*
        Cada canal registra su propio suscriptor, uno por pestaña, y recibe la ventana entera en el
        acto. Es lo que evita que una pestaña recien abierta muestre una grafica vacia hasta el
        siguiente ciclo: con un intervalo de un minuto, eso pareceria una averia.
    */
    addSubscriber = async (c: IProviderSubscriber): Promise<void> => {
        this.subscribers.add(c)
        if (!this.poller) {
            this.deliver(c, {
                payloadType: ESugarlessPayload.ERROR,
                unit: EGlucoseUnit.MGDL,
                errorKind: ESugarlessErrorKind.NOT_CONFIGURED,
                error: 'Sugarless has no credentials configured yet. Set them in Manage extensions > Providers.'
            })
            return
        }
        this.deliver(c, this.poller.snapshotEvent())
        const status = this.poller.statusEvent()
        if (status) this.deliver(c, status)
    }

    removeSubscriber = async (c: IProviderSubscriber): Promise<void> => {
        this.subscribers.delete(c)
    }

    /*
        No hay nada que elegir al suscribirse: hay una sola cuenta y una sola serie. Se declara la
        ayuda igualmente porque lo que SI hay que explicar es la forma de los eventos y, sobre todo,
        que NO_DATA no es un error.
    */
    getSubscriptionHelp = (): IProviderSubscriptionHelp => ({
        usage:
            'No subscription payload: there is a single LibreLinkUp account and a single series, so ' +
            'pass an empty object.\n\n' +
            'What a subscriber receives (every event carries "unit", plus "targetLow"/"targetHigh" ' +
            'as reported by the API for the patient):\n' +
            '  snapshot : { samples: [...] }  the whole in-memory window, oldest first. Sent to each ' +
            'subscriber the moment it subscribes, so a freshly opened tab draws a full chart at once.\n' +
            '  sample   : { sample }          one new reading, already de-duplicated.\n' +
            '  nodata   : the connection is fine but there is no current reading.\n' +
            '  error    : { errorKind, error }\n\n' +
            'Gotchas:\n' +
            '  - NODATA IS NOT AN ERROR. LibreLinkUp does not read the sensor, it reads what the ' +
            'patient app uploaded to the cloud, so a device that has not synced recently yields no ' +
            'current reading. Painting an alarm for this would flag the normal case.\n' +
            '  - The sensor produces a value every ~15 minutes, so most polls return the SAME reading. ' +
            'De-duplication is by timestamp and happens in the provider: a subscriber only sees new ones.\n' +
            '  - Timestamps are epoch ms derived from the UTC field, never from the local one.\n' +
            '  - Values are in the account unit and are never converted, "unit" says which one.\n' +
            '  - Polling is NOT lazy: it runs while the provider is configured, with or without ' +
            'subscribers, because the history is the point.',
        example: {},
        fields: []
    })

    /** Alimenta el contador de la tarjeta en el gestor de extensiones. No expone el email. */
    getConfigNames = (): string[] => this.configured() ? ['account'] : []

    // ── Configuracion ───────────────────────────────────────────────────────────

    private addConfigRoutes = (): void => {
        this.configRouter.route('/config')
            .get(async (_req: Request, res: Response) => {
                // El core ya ha validado el accessKey antes de llegar aqui. Se devuelve la
                // configuracion COMPLETA, contraseña incluida: el dialogo la pinta enmascarada con un
                // ojo para revelarla, igual que el resto del front de kwirth.
                res.status(200).json(this.config)
            })
            .put(async (req: Request, res: Response) => {
                try {
                    const incoming = req.body as ISugarlessConfig | undefined
                    if (!incoming || typeof incoming !== 'object') {
                        res.status(400).json({ errors: ['Body must be a configuration object'] })
                        return
                    }
                    // Se persiste lo que llega, sin merges: el dialogo manda la configuracion entera.
                    const errors = validateConfig(incoming)
                    if (errors.length > 0) {
                        res.status(400).json({ errors })
                        return
                    }
                    await this.applyConfig(incoming)
                    res.status(200).json({ ok: true })
                }
                catch (err) {
                    console.error(`[sugarless] Error saving configuration: ${err}`)
                    res.status(500).json({ errors: [String(err)] })
                }
            })

        /*
            Prueba las credenciales tal y como estan en el dialogo, sin persistir nada. Responde 200
            tambien cuando la prueba falla: el 'ok' del cuerpo distingue "se probo y fallo" de "la
            llamada al provider fallo".
        */
        this.configRouter.route('/test')
            .post(async (req: Request, res: Response) => {
                try {
                    const result = await this.testConfig(req.body as ISugarlessConfig)
                    res.status(200).json(result)
                }
                catch (err) {
                    console.error(`[sugarless] Error testing credentials: ${err}`)
                    res.status(500).json({ ok: false, durationMs: 0, error: String(err) })
                }
            })
    }

    testConfig = async (incoming: ISugarlessConfig | undefined): Promise<ISugarlessTestResult> => {
        if (!incoming) return { ok: false, durationMs: 0, error: 'No configuration to test' }

        const errors = validateConfig(incoming)
        if (errors.length > 0) return { ok: false, durationMs: 0, error: errors.join('; ') }

        const started = Date.now()
        const client = new LibreClient(incoming, this.fetcher)
        try {
            const reading = await client.read()
            return {
                ok: true,
                durationMs: Date.now() - started,
                region: reading.region === '' ? 'global' : reading.region,
                connections: reading.connections,
                hasReading: reading.sample !== undefined,
                unit: reading.unit
            }
        }
        catch (err) {
            return {
                ok: false,
                durationMs: Date.now() - started,
                errorKind: err instanceof SugarlessError ? err.kind : ESugarlessErrorKind.UNEXPECTED,
                error: err instanceof Error ? err.message : String(err)
            }
        }
    }

    /*
        Guarda y aplica en caliente. Rearranca el polling desde cero, lo que VACIA el historico: unas
        credenciales nuevas apuntan a otra cuenta, y mezclar dos pacientes en la misma grafica seria
        peor que perder la ventana.
    */
    applyConfig = async (config: ISugarlessConfig): Promise<void> => {
        await this.store.save(config)
        this.config = config
        this.poller?.stop()
        this.poller = undefined
        this.client = undefined

        if (!this.configured()) {
            console.log('[sugarless] Configuration saved without credentials: not polling')
            return
        }
        this.startPolling()
    }

    getConfig = (): ISugarlessConfig => this.config

    // ── Polling y reparto ───────────────────────────────────────────────────────

    private configured = (): boolean =>
        (this.config.email ?? '').trim() !== '' && (this.config.password ?? '') !== ''

    private startPolling = (): void => {
        this.client = new LibreClient(this.config, this.fetcher)
        this.poller = new Poller(this.config, this.client, event => this.dispatch(event))
        this.poller.start()
        console.log(`[sugarless] Polling every ${this.config.intervalSeconds}s, keeping up to ${this.config.maxSamples} samples`)
    }

    private dispatch = (event: ISugarlessEvent): void => {
        for (const subscriber of this.subscribers) this.deliver(subscriber, event)
    }

    /*
        Un suscriptor que revienta no puede tumbar el reparto a los demas ni el ciclo de polling.
    */
    private deliver = (subscriber: IProviderSubscriber, event: ISugarlessEvent): void => {
        try {
            subscriber.processProviderEvent(this.id, event)
        }
        catch (err) {
            console.error(`[sugarless] A subscriber threw while receiving an event: ${err}`)
        }
    }
}

export default SugarlessProvider
