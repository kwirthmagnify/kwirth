import { Router, Request, Response, raw } from 'express'
import { AiToolsetManager } from '../tools/AiToolsetManager'
import { listToolsetInfos, isBuiltInToolsetId, getToolset } from '@kwirthmagnify/kwirth-common-ai/back'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

// API of the `aitoolset` type (plan: plans/ai-tools/PLAN.md, S1).
//
// Two different listings, on purpose:
//   GET /            → what is INSTALLED (the manager's metadata), which is what the manager dialog draws
//   GET /catalog     → what is REGISTERED and usable (built-in + installed), which is what the tool
//                      selector needs in order to offer toolsets and mark their tools
//
// They are not the same: a built-in is not "installed" — it is neither installed nor uninstalled — but it
// is available; and an installed one whose back.js did not load is in the index and is NOT available.
export class AiToolsetApi {
    router: Router
    private manager: AiToolsetManager
    private apiKeyApi: ApiKeyApi

    constructor(manager: AiToolsetManager, apiKeyApi: ApiKeyApi) {
        this.manager = manager
        this.apiKeyApi = apiKeyApi
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        // It is enriched with toolCount from the REGISTRY, not from the index: the index says what was
        // installed and the registry what really loaded. Should a back.js have failed to load, the card
        // shows it with no counter instead of lying with the number the package carried.
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                const metas = await this.manager.listInstalled()
                res.json(metas.map(m => ({ ...m, toolCount: getToolset(m.id)?.tools.length })))
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        // The catalogue carries the CARDS (IAiToolsetInfo): every tool's name, description, effect and
        // sensitivity. Never the inputSchema or the execute — those belong to the back end and have no
        // reason to travel.
        this.router.get('/catalog', async (_req: Request, res: Response) => {
            try {
                res.json(listToolsetInfos().map(t => ({ ...t, builtIn: isBuiltInToolsetId(t.id) })))
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        // ── Grants: which plugins may use each toolset ──────────────────────────────────────────────
        //
        // The whole map in one read: the question one has to be able to answer fast is "who can write to
        // the cluster through AI?", and that is answered by looking at who has been granted k8s-ops.
        this.router.get('/grants', async (_req: Request, res: Response) => {
            try { res.json(await this.manager.listGrants()) }
            catch (err) { res.status(500).json({ error: String(err) }) }
        })

        // Granting is an ADMIN act, not one for anybody with a valid key: it gives access to tools that
        // touch the cluster. It is the only route of this API demanding the admin scope.
        this.router.put('/grants/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
            try {
                const plugins = req.body?.plugins
                if (!Array.isArray(plugins) || plugins.some(p => typeof p !== 'string')) {
                    return void res.status(400).json({ error: 'plugins must be an array of plugin ids' })
                }
                res.json({ toolsetId: req.params.id, plugins: await this.manager.setGrants(req.params.id, plugins) })
            }
            catch (err) { res.status(400).json({ error: String(err) }) }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                // 'upgrade' is the EXPLICIT permission to overwrite an existing installation. Without
                // it the manager rejects an already installed id, which is the behaviour of always.
                const { url, marketplaceId, marketplaceLabel, upgrade } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.manager.install(url, undefined, marketplaceId, marketplaceLabel, upgrade === true)
                logInfo(ELogComponent.CORE, `AI toolset installed via API: ${meta.id} v${meta.version}`)
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.CORE, `AI toolset install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.manager.installFromBuffer(req.body)
                logInfo(ELogComponent.CORE, `AI toolset installed via upload: ${meta.id} v${meta.version}`)
                res.json(meta)
            }
            catch (err) {
                logError(ELogComponent.CORE, `AI toolset upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.manager.uninstall(req.params.id)
                res.json({ ok: true })
            }
            catch (err) {
                logError(ELogComponent.CORE, `AI toolset uninstall error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
