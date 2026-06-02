import { Router, Request, Response, raw } from 'express'
import { DaemonManager } from '../tools/DaemonManager'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

export interface IDaemonApiCallbacks {
    onDaemonInstalled?: (id: string) => void
    onDaemonUninstalled?: (id: string) => void
}

export class DaemonApi {
    router: Router
    private daemonManager: DaemonManager
    private apiKeyApi: ApiKeyApi
    private callbacks: IDaemonApiCallbacks

    constructor(daemonManager: DaemonManager, apiKeyApi: ApiKeyApi, callbacks: IDaemonApiCallbacks = {}) {
        this.daemonManager = daemonManager
        this.apiKeyApi = apiKeyApi
        this.callbacks = callbacks
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                res.json(await this.daemonManager.listInstalled())
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const { url } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.daemonManager.install(url)
                this.callbacks.onDaemonInstalled?.(meta.id)
                logInfo(ELogComponent.CORE, `Daemon installed via API: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Daemon install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.daemonManager.installFromBuffer(req.body)
                this.callbacks.onDaemonInstalled?.(meta.id)
                logInfo(ELogComponent.CORE, `Daemon installed via upload: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Daemon upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.daemonManager.uninstall(req.params.id)
                this.callbacks.onDaemonUninstalled?.(req.params.id)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
