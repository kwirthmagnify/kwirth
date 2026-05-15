import { Router, Request, Response, raw } from 'express'
import { ProviderManager } from '../tools/ProviderManager'
import { TProviderConstructor } from '../providers/IProvider'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

export interface IProviderApiCallbacks {
    onProviderInstalled?: (id: string) => void
    onProviderUninstalled?: (id: string) => void
}

export class ProviderApi {
    router: Router
    private providerManager: ProviderManager
    private registeredProviders: Map<string, TProviderConstructor>
    private apiKeyApi: ApiKeyApi
    private callbacks: IProviderApiCallbacks

    constructor(providerManager: ProviderManager, registeredProviders: Map<string, TProviderConstructor>, apiKeyApi: ApiKeyApi, callbacks: IProviderApiCallbacks = {}) {
        this.providerManager = providerManager
        this.registeredProviders = registeredProviders
        this.apiKeyApi = apiKeyApi
        this.callbacks = callbacks
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                res.json(await this.providerManager.listInstalled())
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
    }
}
