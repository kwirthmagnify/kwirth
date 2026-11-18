import { Router, Request, Response, raw } from 'express'
import { RouterManager } from '../tools/RouterManager'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

/*
    API of the `router` type (plan: plans/router-extension/PLAN.md, S2), mounted at /core/routers.

    The listing carries, next to each installed router, how it is RIGHT NOW ('status': started, or why
    not): the index says what was installed, the live table what really runs.

    The config is a Secret and comes back REAL: the front shows the secret fields masked, with the eye
    (project rule). Saving it applies it at once to the live router; what the router throws is the answer.
*/
export class RouterApi {
    router: Router

    constructor(private manager: RouterManager, private apiKeyApi: ApiKeyApi, private onChanged: () => void) {
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                const metas = await this.manager.listInstalled()
                res.json(metas.map(m => ({ ...m, status: this.manager.status(m.id) })))
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                // 'upgrade' is the EXPLICIT permission to overwrite an installed one
                const { url, marketplaceId, marketplaceLabel, upgrade } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.manager.install(url, undefined, marketplaceId, marketplaceLabel, upgrade === true)
                logInfo(ELogComponent.ROUTER, `Router installed via API: ${meta.id} v${meta.version}`)
                this.onChanged()
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.ROUTER, `Router install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.manager.installFromBuffer(req.body)
                logInfo(ELogComponent.ROUTER, `Router installed via upload: ${meta.id} v${meta.version}`)
                this.onChanged()
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.ROUTER, `Router upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.manager.uninstall(req.params.id)
                this.onChanged()
                res.json({ ok: true })
            }
            catch (err) {
                logError(ELogComponent.ROUTER, `Router uninstall error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        // The fields of its dialog, as the live router declares them (empty when it is not up)
        this.router.get('/:id/schema', (req: Request, res: Response) => {
            res.json(this.manager.getSchema(req.params.id))
        })

        this.router.get('/:id/status', (req: Request, res: Response) => {
            res.json(this.manager.status(req.params.id))
        })

        this.router.get('/:id/config', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(await this.manager.getConfig(req.params.id))
        })

        this.router.put('/:id/config', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return void res.status(400).json({ error: 'Expected a JSON object' })
            try {
                // What does not fit the router's schema is the admin's to fix: a 400 naming every field, nothing saved
                const errors = await this.manager.saveConfig(req.params.id, req.body as Record<string, unknown>)
                if (errors.length > 0) return void res.status(400).json({ error: errors.map(e => e.message).join('; '), fields: errors })
                this.onChanged()
                res.json({ ok: true })
            }
            catch (err) {
                logError(ELogComponent.ROUTER, `Router '${req.params.id}' config error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
