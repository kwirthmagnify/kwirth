import express, { Request, Response } from 'express'
import { IProvider, IProviderStorage, IProviderSubscriber, KwirthData } from '@kwirthmagnify/kwirth-common-back'
import { IHttpPullConfig, IHttpPullPushEvent, IHttpPullPushSubscription } from '../common/HttpPullPush'
import { validateConfigs } from '../common/Validation'
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

// Un suscriptor con su seleccion. 'configs' undefined = todas las habilitadas (tambien las futuras).
interface ISubscriberEntry {
    configs: Set<string> | undefined
}

export class HttpPullPushProvider implements IProvider {
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
            console.log(`[http-pull-push] ${this.configs.size} connection(s) loaded`)
        }
        catch (err) {
            console.error(`[http-pull-push] Could not load connections: ${err}`)
        }
        this.started = true
        // no se arranca ningun poller aqui: son lazy, esperan al primer suscriptor
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

    // Permite a un canal cambiar su seleccion sin desuscribirse y volver a suscribirse.
    updateSubscription = async (c: IProviderSubscriber, data: IHttpPullPushSubscription): Promise<void> => {
        if (!this.subscribers.has(c)) return
        this.subscribers.set(c, { configs: this.parseSelection(data) })
        this.warnUnknown(data)
        this.reconcile()
    }

    // ── Configuracion (capa 1) ──────────────────────────────────────────────────

    private addConfigRoutes = (): void => {
        this.configRouter.route('/configs')
            .get(async (_req: Request, res: Response) => {
                // el core ya ha validado el accessKey antes de llegar aqui
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
                    console.error(`[http-pull-push] Error saving connections: ${err}`)
                    res.status(500).json({ errors: [String(err)] })
                }
            })
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

    getConfigs = (): IHttpPullConfig[] => [...this.configs.values()]

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
                subscriber.processProviderEvent(this.id, event)
            }
            catch (err) {
                console.error(`[http-pull-push] Subscriber failed processing '${event.config}': ${err}`)
            }
        }
    }

    private parseSelection = (data: IHttpPullPushSubscription | undefined): Set<string> | undefined => {
        if (!data || data.configs === undefined) return undefined
        return new Set(data.configs)
    }

    // Suscribirse a algo que no existe (o que se borro despues) no es un error: se ignora y se deja traza.
    private warnUnknown = (data: IHttpPullPushSubscription | undefined): void => {
        if (!data?.configs) return
        for (const name of data.configs) {
            if (!this.configs.has(name)) console.log(`[http-pull-push] Subscription to unknown connection '${name}' — ignored`)
        }
    }
}

export default HttpPullPushProvider
