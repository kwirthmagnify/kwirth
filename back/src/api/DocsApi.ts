import { Router, Request, Response, NextFunction, raw } from 'express'
import express from 'express'
import { DocsManager } from '../tools/DocsManager'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ELogComponent, logError, logInfo } from '../tools/Logging'

export class DocsApi {
    router: Router
    private docsManager: DocsManager
    private apiKeyApi: ApiKeyApi
    private docsifyPath: string

    constructor(docsManager: DocsManager, apiKeyApi: ApiKeyApi, docsifyPath: string) {
        this.docsManager = docsManager
        this.apiKeyApi = apiKeyApi
        this.docsifyPath = docsifyPath
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                res.json(await this.docsManager.listInstalled())
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
                const meta = await this.docsManager.install(url)
                logInfo(ELogComponent.CORE, `Docs installed via API: ${meta.targetType}/${meta.id} v${meta.version}`)
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.CORE, `Docs install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '200mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.docsManager.installFromBuffer(req.body)
                logInfo(ELogComponent.CORE, `Docs installed via upload: ${meta.targetType}/${meta.id} v${meta.version}`)
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.CORE, `Docs upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:targetType/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.docsManager.uninstall(req.params.targetType, req.params.id)
                res.json({ ok: true })
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        // docsify shared assets — must be declared BEFORE the /:targetType/:id wildcard
        this.router.use('/docsify', (_req: Request, res: Response, next: NextFunction) => {
            if (!this.docsifyPath) {
                res.status(503).json({ error: 'Docsify assets not configured — run npm install and copy-docsify script' })
                return
            }
            next()
        }, express.static(this.docsifyPath))

        // doc static files — wildcard; must be last
        this.router.use('/:targetType/:id', (req: Request, res: Response, next: NextFunction) => {
            const docsDir = this.docsManager.getDocsDir(req.params.targetType, req.params.id)
            if (!docsDir) {
                res.status(404).json({ error: `Docs '${req.params.targetType}/${req.params.id}' not installed` })
                return
            }
            express.static(docsDir)(req, res, next)
        })
    }
}
