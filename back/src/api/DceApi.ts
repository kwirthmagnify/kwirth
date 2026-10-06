import { Router, Request, Response, raw } from 'express'
import { DceManager } from '../tools/DceManager'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

/*
    API of the `dce` type (plan: plans/completed/dce/PLAN.md, S1), mounted at /core/dces.

    The listing carries, next to each installed DCE, how its back end is RIGHT NOW (`back`: loaded, or
    failed with its cause). The index says what was installed and the registry what really loaded; a
    factory that threw shows as failed here instead of as a card that looks fine.

    `/:id/front` serves the front.js with no key, like every other extension's front: a <script> tag
    cannot send headers. It carries no secrets — it is the same code the package publishes.
*/
export class DceApi {
    router: Router
    private manager: DceManager
    private apiKeyApi: ApiKeyApi

    constructor(manager: DceManager, apiKeyApi: ApiKeyApi) {
        this.manager = manager
        this.apiKeyApi = apiKeyApi
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                const metas = await this.manager.listInstalled()
                res.json(metas.map(m => ({ ...m, back: this.manager.status(m.id) })))
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/front', async (req: Request, res: Response) => {
            try {
                const code = await this.manager.getFrontJs(req.params.id)
                if (!code) return void res.status(404).json({ error: 'DCE front.js not found' })
                res.setHeader('Content-Type', 'application/javascript')
                if (this.manager.isDevDce(req.params.id)) res.setHeader('Cache-Control', 'no-store')
                res.send(code)
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                // 'upgrade' is the EXPLICIT permission to overwrite an existing installation. Without
                // it the manager rejects an already installed id, which is the behaviour of always.
                const { url, marketplaceId, marketplaceLabel, upgrade } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.manager.install(url, undefined, marketplaceId, marketplaceLabel, upgrade === true)
                logInfo(ELogComponent.CORE, `DCE installed via API: ${meta.id} v${meta.version}`)
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.CORE, `DCE install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.manager.installFromBuffer(req.body)
                logInfo(ELogComponent.CORE, `DCE installed via upload: ${meta.id} v${meta.version}`)
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.CORE, `DCE upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        // 409 and not 500 when it is in use: the caller did nothing wrong, the state refuses it.
        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.manager.uninstall(req.params.id)
                res.json({ ok: true })
            }
            catch (err) {
                const message = String(err)
                logError(ELogComponent.CORE, `DCE uninstall error: ${message}`)
                res.status(message.includes('is in use') ? 409 : 500).json({ error: message })
            }
        })
    }
}
