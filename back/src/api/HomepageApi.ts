import { Router, Request, Response, raw } from 'express'
import { HomepageManager } from '../tools/HomepageManager'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

export class HomepageApi {
    router: Router
    private homepageManager: HomepageManager
    private apiKeyApi: ApiKeyApi

    constructor(homepageManager: HomepageManager, apiKeyApi: ApiKeyApi) {
        this.homepageManager = homepageManager
        this.apiKeyApi = apiKeyApi
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                res.json(await this.homepageManager.listInstalled())
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const { url } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.homepageManager.install(url)
                logInfo(ELogComponent.CORE, `Homepage installed via API: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Homepage install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '50mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.homepageManager.installFromBuffer(req.body)
                logInfo(ELogComponent.CORE, `Homepage installed via upload: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Homepage upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.homepageManager.uninstall(req.params.id)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/front', async (req: Request, res: Response) => {
            try {
                if (this.homepageManager.isDevHomepage(req.params.id)) {
                    const code = this.homepageManager.getDevFrontJs(req.params.id)
                    if (!code) return void res.status(404).json({ error: 'Dev homepage front.js not found' })
                    res.setHeader('Content-Type', 'application/javascript')
                    res.setHeader('Cache-Control', 'no-store')
                    return res.send(code)
                }
                const code = await this.homepageManager.getFrontJs(req.params.id)
                if (!code) return void res.status(404).json({ error: 'Homepage not found' })
                res.setHeader('Content-Type', 'application/javascript')
                res.send(code)
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/preview', async (req: Request, res: Response) => {
            try {
                if (this.homepageManager.isDevHomepage(req.params.id)) {
                    const buf = this.homepageManager.getDevPreviewPng(req.params.id)
                    if (!buf) return void res.status(404).end()
                    res.setHeader('Content-Type', 'image/png')
                    res.setHeader('Cache-Control', 'no-store')
                    return res.send(buf)
                }
                const buf = await this.homepageManager.getPreviewPng(req.params.id)
                if (!buf) return void res.status(404).end()
                res.setHeader('Content-Type', 'image/png')
                res.setHeader('Cache-Control', 'public, max-age=3600')
                res.send(buf)
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
