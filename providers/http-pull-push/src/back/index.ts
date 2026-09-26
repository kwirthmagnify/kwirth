import express, { Request, Response } from 'express'
import { IProvider, IProviderStorage, IProviderSubscriber, IProviderSubscriptionHelp, KwirthData } from '@kwirthmagnify/kwirth-common-back'
import { IHttpPullConfig, IHttpPullPushEvent, IHttpPullPushSubscription, IHttpPullTestResult, TEST_PREVIEW_CHARS } from '../common/HttpPullPush'
import { validateConfigs, validateForTest } from '../common/Validation'
import { ConfigStore } from './ConfigStore'
import { httpFetcher, TFetcher } from './HttpFetcher'
import { Poller } from './Poller'

/*
    Provider http-pull-push: consulta endpoints HTTP remotos con la periodicidad que se le diga y empuja
    cada resultado a los canales suscritos.

    Es dueño de su configuracion: la sirve y la guarda por su propio 'configRouter' (que el core monta
    SIEMPRE detras de validacion de accessKey en /core/providerconfig/http-pull-push) y la persiste con el
    storage que el core le inyecta, mandando las credenciales a un Secret. No usa configure().

    Dos capas independientes:
      - conexiones  : persistidas, con enabled, existen sin suscriptores
      - suscripcion : en memoria, cada canal dice que conexiones quiere
*/

// A subscriber with its selection. An undefined 'configs' means all the enabled ones (future ones too).
interface ISubscriberEntry {
    configs: Set<string> | undefined
}

/*
    What the core lends the provider to write its log with. Declared here structurally instead of
    imported from kwirth-common-back, so this provider does not depend on a particular version of
    that package. Once the contract is published this interface can go.
*/
interface IExtensionLogger {
    info(message: unknown): void
    warning(message: unknown): void
    error(message: unknown): void
}

export class HttpPullPushProvider implements IProvider {
    /*
        Starts writing to the console — what it did before — and the core replaces it as soon as the
        provider is built. With an older core nobody calls setLogger and everything stays as it was.
    */
    private log: IExtensionLogger = {
        info: (message: unknown) => console.log(`[http-pull-push] ${message}`),
        warning: (message: unknown) => console.warn(`[http-pull-push] ${message}`),
        error: (message: unknown) => console.error(`[http-pull-push] ${message}`)
    }
    setLogger = (logger: IExtensionLogger): void => { this.log = logger }
    public readonly id = 'http-pull-push'
    public readonly providesRouter = false
    public router = undefined
    public routerAlias = undefined
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined
    public configRouter = express.Router()

    private store: ConfigStore
    private fetcher: TFetcher
    private configs = new Map<string, IHttpPullConfig>()
    private subscribers = new Map<IProviderSubscriber, ISubscriberEntry>()

    /*
        Lo que este provider sabe de si mismo: cuantos consumidores tiene AHORA. El contrato
        (IProvider.getStats, opcional desde kwirth-common-back 0.5.50) pide que sea BARATO — se devuelve
        lo que ya se tiene, no se calcula —, y de aqui sale que kwirth pueda decir si esto esta siendo
        consumido o emitiendo para nadie.
    */
    /*
        Entregas desde que arranco: una por llamada a un suscriptor. Filtra por configuracion antes de entregar.
    */
    private deliveries = 0

    getStats = () => ({ subscribers: this.subscribers.size, events: this.deliveries })

    private pollers = new Map<string, Poller>()
    private started = false

    constructor(_clusterInfo: unknown, _kwirthData: KwirthData, storage?: IProviderStorage, fetcher: TFetcher = httpFetcher) {
        this.store = new ConfigStore(storage)
        this.fetcher = fetcher
        this.addConfigRoutes()
    }

    // ── IProvider ───────────────────────────────────────────────────────────────

    startProvider = async (): Promise<void> => {
        try {
            const configs = await this.store.load()
            this.configs = new Map(configs.map(c => [c.name, c]))
            this.log.info(`${this.configs.size} connection(s) loaded`)
        }
        catch (err) {
            this.log.error(`Could not load connections: ${err}`)
        }
        this.started = true
        // no poller is started here: they are lazy, they wait for the first subscriber
        this.reconcile()
    }

    stopProvider = async (): Promise<void> => {
        for (const poller of this.pollers.values()) poller.stop()
        this.pollers.clear()
        this.subscribers.clear()
        this.started = false
    }

    addSubscriber = async (c: IProviderSubscriber, data: IHttpPullPushSubscription): Promise<void> => {
        this.subscribers.set(c, { configs: this.parseSelection(data) })
        this.warnUnknown(data)
        this.reconcile()
    }

    removeSubscriber = async (c: IProviderSubscriber): Promise<void> => {
        this.subscribers.delete(c)
        this.reconcile()
    }

    // Lets a channel change its selection without unsubscribing and subscribing again.
    updateSubscription = async (c: IProviderSubscriber, data: IHttpPullPushSubscription): Promise<void> => {
        if (!this.subscribers.has(c)) return
        this.subscribers.set(c, { configs: this.parseSelection(data) })
        this.warnUnknown(data)
        this.reconcile()
    }

    /*
        Ayuda para quien se suscribe. Merece la pena declararla porque la semantica de 'configs' no se
        adivina: un array VACIO no significa "todo", significa "nada"; y las conexiones las crea un
        administrador en el dialogo del provider, asi que hay que decir sus nombres.
    */
    getSubscriptionHelp = (): IProviderSubscriptionHelp => ({
        usage:
            'Subscribe by CONNECTION NAME. The connections are created by an administrator in this ' +
            'provider\'s dialog (gear in Manage extensions > Providers), so their names are the ones ' +
            'listed there.\n\n' +
            'Selection semantics:\n' +
            '  - configs: ["a","b"]  -> only those connections\n' +
            '  - configs: []         -> NOTHING is delivered (an empty array is not "everything")\n' +
            '  - configs absent      -> every enabled connection, including ones created later\n\n' +
            'Each event arrives wrapped, so a subscriber to several connections can tell them apart:\n' +
            '  success: { config, timestamp, status, data }   data = parsed body (json) or raw text\n' +
            '  failure: { config, timestamp, error }          no data, no status\n\n' +
            'Gotchas:\n' +
            '  - Polling is LAZY: a connection is only polled while at least one subscriber wants it, ' +
            'so nothing happens until you subscribe (and the first pull is immediate).\n' +
            '  - A DISABLED connection delivers nothing even if you name it explicitly.\n' +
            '  - Naming a connection that does not exist is ignored and logged, never an error.\n' +
            '  - With emitMode=onChange the connection stays quiet while the answer is identical.',
        example: { configs: ['stocks', 'rss'] },
        fields: [
            {
                name: 'configs',
                type: 'string[]',
                description: 'Connection names to receive. Empty array = nothing; omit the field = all enabled connections.'
            }
        ]
    })

    // ── Configuracion (capa 1) ──────────────────────────────────────────────────

    private addConfigRoutes = (): void => {
        this.configRouter.route('/configs')
            .get(async (_req: Request, res: Response) => {
                // the core has already validated the accessKey before reaching here
                res.status(200).json([...this.configs.values()])
            })
            .put(async (req: Request, res: Response) => {
                try {
                    const incoming = req.body as IHttpPullConfig[] | undefined
                    if (!Array.isArray(incoming)) {
                        res.status(400).json({ errors: ['Body must be an array of connections'] })
                        return
                    }
                    const errors = validateConfigs(incoming)
                    if (errors.length > 0) {
                        res.status(400).json({ errors })
                        return
                    }
                    await this.applyConfigs(incoming)
                    res.status(200).json({ ok: true })
                }
                catch (err) {
                    this.log.error(`Error saving connections: ${err}`)
                    res.status(500).json({ errors: [String(err)] })
                }
            })

        /*
            Prueba puntual de una conexion, tal y como la tenga el usuario en el dialogo (no hace falta
            haberla guardado). Responde 200 tambien cuando la peticion remota falla: el 'ok' del cuerpo
            distingue "la prueba se hizo y fallo" de "la llamada al provider fallo".
        */
        this.configRouter.route('/test')
            .post(async (req: Request, res: Response) => {
                try {
                    const result = await this.testConnection(req.body as IHttpPullConfig)
                    res.status(200).json(result)
                }
                catch (err) {
                    this.log.error(`Error testing connection: ${err}`)
                    res.status(500).json({ ok: false, durationMs: 0, error: String(err) })
                }
            })
    }

    /*
        Prueba una conexion HACIENDO LA PETICION DE VERDAD, una sola vez y sin persistir nada.

        La ejecuta el back a proposito: es el back quien tiene la red del cluster, los certificados y la
        identidad con los que se hara el pull real, asi que probar desde el navegador no demostraria nada
        (otra red, otro almacen de CAs, otras reglas de salida).

        Se ignoran los reintentos: en una prueba interesa el primer resultado, no la insistencia.
    */
    testConnection = async (config: IHttpPullConfig): Promise<IHttpPullTestResult> => {
        const errors = validateForTest(config)
        if (errors.length > 0) return { ok: false, durationMs: 0, error: errors.join('; ') }

        const started = Date.now()
        try {
            const result = await this.fetcher({ ...config, retries: 0 })
            const body = result.body ?? ''
            let jsonParsed = false
            try {
                JSON.parse(body)
                jsonParsed = true
            }
            catch { /* no es json: se refleja en jsonParsed, no es un fallo de la prueba */ }

            return {
                ok: true,
                status: result.status,
                durationMs: Date.now() - started,
                bytes: Buffer.byteLength(body, 'utf8'),
                preview: body.slice(0, TEST_PREVIEW_CHARS),
                jsonParsed
            }
        }
        catch (err) {
            return {
                ok: false,
                durationMs: Date.now() - started,
                error: err instanceof Error ? err.message : String(err)
            }
        }
    }

    /*
        Guarda y aplica en caliente: no hay que reiniciar Kwirth para que una conexion nueva empiece a
        consultarse, ni para que una que se deshabilita deje de hacerlo.
    */
    applyConfigs = async (configs: IHttpPullConfig[]): Promise<void> => {
        await this.store.save(configs)
        this.configs = new Map(configs.map(c => [c.name, c]))
        this.reconcile()
    }

    /*
        ── Portabilidad de configuracion (IExtension) ──────────────────────────────────────────────

        Las conexiones SON la configuracion de este provider: nombres, urls, intervalos, cabeceras y
        credenciales. No guarda nada mas —lo que sondea no se persiste, se emite—, asi que aqui no hay
        que separar configuracion de datos: viaja todo.

        Lo que si hay que separar son las CREDENCIALES, y el store ya las tiene partidas en dos
        almacenes; aqui solo hay que vaciarlas cuando no se piden. Se vacian, no se omiten: quien
        importe tiene que poder ver que esa conexion necesita una contraseña.
    */
    exportConfig = async (options: { includeCredentials: boolean }): Promise<unknown> => {
        const configs = this.getConfigs()
        if (options.includeCredentials) return { configs }
        return {
            configs: configs.map(c => ({
                ...c,
                ...(c.auth ? { auth: {
                    ...c.auth,
                    ...(c.auth.password !== undefined ? { password: '' } : {}),
                    ...(c.auth.token !== undefined ? { token: '' } : {}),
                    ...(c.auth.headerValue !== undefined ? { headerValue: '' } : {})
                } } : {})
            }))
        }
    }

    importConfig = async (data: unknown): Promise<{ applied: number, skipped: number, warnings: string[] }> => {
        const warnings: string[] = []
        const entrantes = (data as { configs?: unknown })?.configs
        if (!Array.isArray(entrantes)) return { applied: 0, skipped: 0, warnings: ['no configs array in the imported data'] }

        const errores = validateConfigs(entrantes as IHttpPullConfig[])
        if (errores.length > 0) return { applied: 0, skipped: entrantes.length, warnings: errores }

        /*
            Un fichero exportado SIN credenciales trae los secretos vacios, y aplicarlos tal cual
            borraria los que ya hay. Si la conexion existe y lo que llega no trae secreto, se conserva
            el actual; si es nueva, se avisa de que hay que rellenarlo.
        */
        const conservarSecretos = (entrante: IHttpPullConfig): IHttpPullConfig => {
            const actual = this.configs.get(entrante.name)
            if (!entrante.auth) return entrante
            const heredar = (campo: 'password' | 'token' | 'headerValue') => {
                const valor = entrante.auth?.[campo]
                if (valor) return { [campo]: valor }
                const previo = actual?.auth?.[campo]
                if (previo) return { [campo]: previo }
                if (valor === '') warnings.push(`connection '${entrante.name}' needs its ${campo} to be set`)
                return {}
            }
            return { ...entrante, auth: { ...entrante.auth, ...heredar('password'), ...heredar('token'), ...heredar('headerValue') } }
        }

        const resultado = new Map(this.configs)
        for (const entrante of entrantes as IHttpPullConfig[]) resultado.set(entrante.name, conservarSecretos(entrante))

        // applyConfigs saves AND applies hot: imported connections start being polled without
        // restarting anything.
        await this.applyConfigs([...resultado.values()])
        return { applied: entrantes.length, skipped: 0, warnings }
    }

    getConfigs = (): IHttpPullConfig[] => [...this.configs.values()]

    // Names only: it feeds the counter on the card in the extension manager.
    getConfigNames = (): string[] => [...this.configs.keys()]

    // ── Reconciliacion de pollers ───────────────────────────────────────────────

    /*
        Deja los pollers en marcha exactamente iguales a lo que dicen la configuracion y las suscripciones:
        arranca los que faltan, para los que sobran y recrea los que han cambiado de parametros.
    */
    private reconcile = (): void => {
        if (!this.started) return

        for (const [name, poller] of this.pollers) {
            const config = this.configs.get(name)
            if (!config || !this.shouldRun(config)) {
                poller.stop()
                this.pollers.delete(name)
            }
        }

        for (const config of this.configs.values()) {
            if (!this.shouldRun(config)) continue
            const existing = this.pollers.get(config.name)
            if (existing) {
                if (!existing.matches(config)) {
                    existing.stop()
                    this.pollers.delete(config.name)
                }
                else {
                    continue
                }
            }
            const poller = new Poller(config, this.fetcher, event => this.dispatch(event))
            this.pollers.set(config.name, poller)
            poller.start()
        }
    }

    private shouldRun = (config: IHttpPullConfig): boolean => {
        if (!config.enabled) return false
        return this.countListeners(config.name) > 0
    }

    private countListeners = (name: string): number => {
        let count = 0
        for (const entry of this.subscribers.values()) {
            if (entry.configs === undefined || entry.configs.has(name)) count++
        }
        return count
    }

    // ── Entrega (capa 2) ────────────────────────────────────────────────────────

    private dispatch = (event: IHttpPullPushEvent): void => {
        for (const [subscriber, entry] of this.subscribers) {
            if (entry.configs !== undefined && !entry.configs.has(event.config)) continue
            try {
                this.deliveries++
                subscriber.processProviderEvent(this.id, event)
            }
            catch (err) {
                this.log.error(`Subscriber failed processing '${event.config}': ${err}`)
            }
        }
    }

    private parseSelection = (data: IHttpPullPushSubscription | undefined): Set<string> | undefined => {
        if (!data || data.configs === undefined) return undefined
        return new Set(data.configs)
    }

    // Subscribing to something that does not exist (or was deleted later) is not an error: it is ignored and traced.
    private warnUnknown = (data: IHttpPullPushSubscription | undefined): void => {
        if (!data?.configs) return
        for (const name of data.configs) {
            if (!this.configs.has(name)) this.log.warning(`Subscription to unknown connection '${name}' — ignored`)
        }
    }
}

export default HttpPullPushProvider
