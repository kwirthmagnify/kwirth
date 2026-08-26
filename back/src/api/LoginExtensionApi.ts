import { Router, Request, Response, raw } from 'express'
import { LoginManager } from '../tools/LoginManager'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

export class LoginExtensionApi {
    router: Router
    private loginManager: LoginManager
    private apiKeyApi: ApiKeyApi

    constructor(loginManager: LoginManager, apiKeyApi: ApiKeyApi) {
        this.loginManager = loginManager
        this.apiKeyApi = apiKeyApi
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                res.json(await this.loginManager.listInstalled())
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const { url } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.loginManager.install(url)
                logInfo(ELogComponent.CORE, `Login extension installed via API: ${meta.id} v${meta.version}`)
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.CORE, `Login extension install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '50mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.loginManager.installFromBuffer(req.body)
                logInfo(ELogComponent.CORE, `Login extension installed via upload: ${meta.id} v${meta.version}`)
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.CORE, `Login extension upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.loginManager.uninstall(req.params.id)
                res.json({ ok: true })
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/config', async (req: Request, res: Response) => {
            try {
                const result = await this.loginManager.getConfigWithMeta(req.params.id)
                if (!result) return void res.status(404).json({ error: 'Login extension not found' })
                res.json(result)
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.put('/:id/config', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.loginManager.updateConfig(req.params.id, req.body)
                res.json({ ok: true })
            }
            catch (err) {
                logError(ELogComponent.CORE, `Login extension '${req.params.id}' config update error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/background', async (req: Request, res: Response) => {
            try {
                const buf = await this.loginManager.getBackground(req.params.id)
                if (!buf) return void res.status(404).end()
                res.setHeader('Content-Type', 'image/png')
                res.setHeader('Cache-Control', 'public, max-age=3600')
                res.send(buf)
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
