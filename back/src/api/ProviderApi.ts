import { Router, Request, Response, raw } from 'express'
import { ProviderManager } from '../tools/ProviderManager'
import { IProvider, IProviderFieldDef, IProviderSubscriptionHelp, TProviderConstructor } from '../providers/IProvider'
import { TPluviderChannel } from '../providers/Pluvider'
import { IProviderMeta } from '../tools/ProviderManager'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

export interface IProviderApiCallbacks {
    onProviderInstalled?: (id: string) => void
    onProviderUninstalled?: (id: string) => void
}

/**
 * Lo que este endpoint sabe de un provider ademas de su metadato de instalacion. Es informacion de
 * RUNTIME: si esta vivo y como suscribirse a el. Se sirve desde aqui a proposito, para que exista
 * un unico sitio que consultar (y un unico sitio que tocar cuando el contrato se estandarice).
 */
export interface IProviderRuntimeInfo {
    /** true si el provider esta instanciado y arrancado en esta running instance */
    running?: boolean
    /** true para los providers que el core registra en codigo, no instalados como extension */
    core?: boolean
    /** lo que el provider publica sobre como suscribirse a el; ausente si no lo implementa */
    subscriptionHelp?: IProviderSubscriptionHelp
    /**
     * nombres de las configuraciones que el provider tiene definidas; ausente si no publica
     * getConfigNames(). Solo nombres, nunca valores: alimenta el contador de la tarjeta igual que
     * 'configNames' hace en los senders.
     */
    configNames?: string[]
    /**
     * true si no es un provider sino un PLUVIDER: un plugin que ademas produce y expone su
     * informacion in-process.
     *
     * Quien CONSUME providers no necesita mirar este campo: un pluvider se lista, se suscribe y
     * entrega eventos igual que un provider, y esa transparencia es justo la gracia. El campo existe
     * para quien GESTIONA extensiones, que si tiene que distinguirlos — un pluvider no se instala ni
     * se desinstala por separado: va y viene con su plugin.
     */
    pluvider?: boolean
    /** id del canal que aloja el pluvider (el 'agora' de 'plugin:agora'). Solo en pluviders. */
    hostedBy?: string
}

export type TProviderApiEntry = IProviderMeta & IProviderRuntimeInfo

/**
 * Lo que un pluvider hereda del plugin que lo aloja. No se nombra ni se versiona aparte: va dentro de
 * su plugin y se actualiza cuando se actualiza el.
 */
export interface IPluviderHostInfo {
    name?: string
    displayName?: string
    version?: string
}

export class ProviderApi {
    router: Router
    private providerManager: ProviderManager
    private registeredProviders: Map<string, TProviderConstructor>
    private apiKeyApi: ApiKeyApi
    private callbacks: IProviderApiCallbacks
    private getRunningProviders: () => IProvider[]
    private getPluviders: () => Map<string, TPluviderChannel>
    private getPluginInfo: (pluginId: string) => Promise<IPluviderHostInfo | undefined>

    constructor(providerManager: ProviderManager, registeredProviders: Map<string, TProviderConstructor>, apiKeyApi: ApiKeyApi, callbacks: IProviderApiCallbacks = {}, getRunningProviders: () => IProvider[] = () => [], getPluviders: () => Map<string, TPluviderChannel> = () => new Map(), getPluginInfo: (pluginId: string) => Promise<IPluviderHostInfo | undefined> = async () => undefined) {
        this.providerManager = providerManager
        this.registeredProviders = registeredProviders
        this.apiKeyApi = apiKeyApi
        this.callbacks = callbacks
        this.getRunningProviders = getRunningProviders
        this.getPluviders = getPluviders
        this.getPluginInfo = getPluginInfo
        this.router = Router()
        this.addRoutes()
    }

    /**
     * getSubscriptionHelp() es OPCIONAL en IProvider: no implementarlo no es un error, y un provider
     * mal escrito que reviente al pedirsela no puede tumbar el listado de todos los demas.
     */
    private subscriptionHelpOf(provider: { getSubscriptionHelp?(): IProviderSubscriptionHelp }, id: string): IProviderSubscriptionHelp | undefined {
        if (typeof provider.getSubscriptionHelp !== 'function') return undefined
        try {
            const help = provider.getSubscriptionHelp()
            if (!help || typeof help.usage !== 'string' || typeof help.example !== 'object') return undefined
            return help
        } catch (err) {
            logError(ELogComponent.PROVIDER, `'${id}' failed to report its subscription help: ${err}`)
            return undefined
        }
    }

    /**
     * Un pluvider no tiene metadato de instalacion —no se instala: viene con su plugin—, asi que lo
     * unico que puede describirlo es su getPluviderData(). Se lee igual de a la defensiva que la
     * ayuda de suscripcion: un plugin mal escrito no puede tumbar el listado de nadie.
     */
    private pluviderDescriptionOf(pluvider: TPluviderChannel, id: string): string {
        try {
            return pluvider.getPluviderData()?.description ?? ''
        } catch (err) {
            logError(ELogComponent.PROVIDER, `Pluvider '${id}' failed to report its data: ${err}`)
            return ''
        }
    }

    /**
     * getConfigNames() es OPCIONAL igual que getSubscriptionHelp: no implementarlo no es un error, y un
     * provider que reviente al pedirselo no puede tumbar el listado de todos los demas.
     */
    private configNamesOf(provider: IProvider): string[] | undefined {
        if (typeof provider.getConfigNames !== 'function') return undefined
        try {
            const names = provider.getConfigNames()
            return Array.isArray(names) ? names.filter(n => typeof n === 'string') : undefined
        } catch (err) {
            logError(ELogComponent.PROVIDER, `Provider '${provider.id}' failed to report its config names: ${err}`)
            return undefined
        }
    }

    /**
     * getConfigSchema() es la forma ESTANDAR de que un provider declare su configuracion, la misma
     * que ISender e IWebhook. Es OPCIONAL, y un provider que reviente al pedirsela no puede tumbar el
     * listado de todos los demas.
     */
    private configSchemaOf(provider: IProvider): IProviderFieldDef[] | undefined {
        if (typeof provider.getConfigSchema !== 'function') return undefined
        try {
            const schema = provider.getConfigSchema()
            return Array.isArray(schema) && schema.length > 0 ? schema : undefined
        } catch (err) {
            logError(ELogComponent.PROVIDER, `Provider '${provider.id}' failed to report its config schema: ${err}`)
            return undefined
        }
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                const entries = new Map<string, TProviderApiEntry>()
                for (const meta of await this.providerManager.listInstalled()) entries.set(meta.id, { ...meta })

                // Los providers de core ('events', 'metrics') se registran en codigo y NO se instalan
                // como extension, asi que listInstalled() no los conoce. Se añaden desde el registro
                // para que este endpoint sea la vista completa.
                // TODO: cuando events y metrics se externalicen como providers de verdad, este bloque
                // sobra: apareceran en listInstalled() como cualquier otro.
                for (const id of this.registeredProviders.keys()) {
                    if (!entries.has(id)) entries.set(id, { id, name: id, version: 'core', description: '', core: true })
                }

                for (const provider of this.getRunningProviders()) {
                    const entry = entries.get(provider.id) ?? { id: provider.id, name: provider.id, version: 'core', description: '', core: true }
                    entry.running = true
                    entry.subscriptionHelp = this.subscriptionHelpOf(provider, provider.id)
                    entry.configNames = this.configNamesOf(provider)
                    // Un provider que declara su schema por metodo tambien tiene configuracion que
                    // ofrecer, aunque no exportara la constante 'schema' que se lee al instalarlo.
                    if (this.configSchemaOf(provider)) entry.hasSchema = true
                    entries.set(provider.id, entry)
                }

                /*
                    Los PLUVIDERS se sirven en esta misma lista, y a proposito: quien consume
                    providers —provider-debug, o cualquier plugin que quiera suscribirse— no tiene por
                    que saber que existen dos clases de productor. Pide '/core/providers', elige uno y
                    se suscribe; el prefijo del id ya lo resuelve el core por dentro.

                    Van marcados con 'pluvider' para el unico que si necesita distinguirlos: el gestor
                    de extensiones, porque un pluvider no se instala ni se desinstala por separado.
                */
                for (const [pluvId, pluv] of this.getPluviders()) {
                    // El nombre y la version son los de SU PLUGIN: un pluvider no se nombra ni se
                    // versiona aparte, va dentro del plugin que lo publica.
                    const hostedBy = pluvId.substring(pluvId.indexOf(':') + 1)
                    const host = await this.getPluginInfo(hostedBy)
                    entries.set(pluvId, {
                        id: pluvId,
                        name: host?.name ?? hostedBy,
                        displayName: host?.displayName,
                        version: host?.version ?? '',
                        description: this.pluviderDescriptionOf(pluv, pluvId),
                        pluvider: true,
                        hostedBy,
                        /*
                            Procedencia: no viene de ningun marketplace, viene de un plugin. Se marca con
                            la misma convencion que ya usa 'pack:<id>', para que el front la reconozca sin
                            inventar un campo nuevo. Sin esto caeria en el fallback y se anunciaria como
                            servida por el marketplace PUBLICO, que es falso — y con un plugin de pago,
                            ademas, lo anunciaria como OSS.
                        */
                        installedFrom: pluvId,
                        running: true,
                        subscriptionHelp: this.subscriptionHelpOf(pluv, pluvId)
                    })
                }

                res.json([...entries.values()])
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const { url, marketplaceId, marketplaceLabel } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.providerManager.install(url, this.registeredProviders, undefined, marketplaceId, marketplaceLabel)
                this.callbacks.onProviderInstalled?.(meta.id)
                logInfo(ELogComponent.CORE, `Provider installed via API: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Provider install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.providerManager.installFromBuffer(req.body, this.registeredProviders)
                this.callbacks.onProviderInstalled?.(meta.id)
                logInfo(ELogComponent.CORE, `Provider installed via upload: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Provider upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.providerManager.uninstall(req.params.id, this.registeredProviders)
                this.callbacks.onProviderUninstalled?.(req.params.id)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/front', async (req: Request, res: Response) => {
            const js = await this.providerManager.getFrontJs(req.params.id)
            if (js === undefined) return void res.status(404).send('Not found')
            res.setHeader('Content-Type', 'application/javascript')
            res.send(js)
        })

        this.router.get('/:id/schema', async (req: Request, res: Response) => {
            // Se le pregunta primero al provider VIVO, que es la via estandar. Si no hay instancia
            // -- un provider sin router al que nadie se ha suscrito no se instancia nunca -- se cae al
            // array 'schema' que el core extrajo de su back.js al instalarlo.
            const running = this.getRunningProviders().find(p => p.id === req.params.id)
            const schema = (running ? this.configSchemaOf(running) : undefined) ?? await this.providerManager.getSchemaAsync(req.params.id)
            if (!schema) return void res.status(404).json({ error: 'No schema' })
            res.json(schema)
        })

        this.router.get('/:id/config', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(await this.providerManager.getConfig(req.params.id))
        })

        this.router.put('/:id/config', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.providerManager.saveConfig(req.params.id, req.body)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
