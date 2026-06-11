import { Router, Request, Response, raw } from 'express'
import { ThemeManager } from '../tools/ThemeManager'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

export class ThemeApi {
    router: Router
    private themeManager: ThemeManager
    private apiKeyApi: ApiKeyApi

    constructor(themeManager: ThemeManager, apiKeyApi: ApiKeyApi) {
        this.themeManager = themeManager
        this.apiKeyApi = apiKeyApi
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                res.json(await this.themeManager.listInstalled())
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const { url } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.themeManager.install(url)
                logInfo(ELogComponent.CORE, `Theme installed via API: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Theme install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '50mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.themeManager.installFromBuffer(req.body)
                logInfo(ELogComponent.CORE, `Theme installed via upload: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Theme upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.themeManager.uninstall(req.params.id)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/front', async (req: Request, res: Response) => {
            try {
                if (this.themeManager.isDevTheme(req.params.id)) {
                    const code = this.themeManager.getDevFrontJs(req.params.id)
                    if (!code) return void res.status(404).json({ error: 'Dev theme front.js not found' })
                    res.setHeader('Content-Type', 'application/javascript')
                    res.setHeader('Cache-Control', 'no-store')
                    return res.send(code)
                }
                const code = await this.themeManager.getFrontJs(req.params.id)
                if (!code) return void res.status(404).json({ error: 'Theme not found' })
                res.setHeader('Content-Type', 'application/javascript')
                res.send(code)
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/preview', async (req: Request, res: Response) => {
            try {
                if (this.themeManager.isDevTheme(req.params.id)) {
                    const buf = this.themeManager.getDevPreviewPng(req.params.id)
                    if (!buf) return void res.status(404).end()
                    res.setHeader('Content-Type', 'image/png')
                    res.setHeader('Cache-Control', 'no-store')
                    return res.send(buf)
                }
                const buf = await this.themeManager.getPreviewPng(req.params.id)
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
