import { Router, Request, Response, raw } from 'express'
import { ProviderManager } from '../tools/ProviderManager'
import { IProvider, IProviderSubscriptionHelp, TProviderConstructor } from '../providers/IProvider'
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
}

export type TProviderApiEntry = IProviderMeta & IProviderRuntimeInfo

export class ProviderApi {
    router: Router
    private providerManager: ProviderManager
    private registeredProviders: Map<string, TProviderConstructor>
    private apiKeyApi: ApiKeyApi
    private callbacks: IProviderApiCallbacks
    private getRunningProviders: () => IProvider[]

    constructor(providerManager: ProviderManager, registeredProviders: Map<string, TProviderConstructor>, apiKeyApi: ApiKeyApi, callbacks: IProviderApiCallbacks = {}, getRunningProviders: () => IProvider[] = () => []) {
        this.providerManager = providerManager
        this.registeredProviders = registeredProviders
        this.apiKeyApi = apiKeyApi
        this.callbacks = callbacks
        this.getRunningProviders = getRunningProviders
        this.router = Router()
        this.addRoutes()
    }

    /**
     * getSubscriptionHelp() es OPCIONAL en IProvider: no implementarlo no es un error, y un provider
     * mal escrito que reviente al pedirsela no puede tumbar el listado de todos los demas.
     */
    private subscriptionHelpOf(provider: IProvider): IProviderSubscriptionHelp | undefined {
        if (typeof provider.getSubscriptionHelp !== 'function') return undefined
        try {
            const help = provider.getSubscriptionHelp()
            if (!help || typeof help.usage !== 'string' || typeof help.example !== 'object') return undefined
            return help
        } catch (err) {
            logError(ELogComponent.PROVIDER, `Provider '${provider.id}' failed to report its subscription help: ${err}`)
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
                    entry.subscriptionHelp = this.subscriptionHelpOf(provider)
                    entries.set(provider.id, entry)
                }

                res.json([...entries.values()])
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const { url } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.providerManager.install(url, this.registeredProviders)
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
            const schema = await this.providerManager.getSchemaAsync(req.params.id)
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
