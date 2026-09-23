import { Router, Request, Response, raw } from 'express'
import { AiToolsetManager } from '../tools/AiToolsetManager'
import { listToolsetInfos, isBuiltInToolsetId, getToolset } from '@kwirthmagnify/kwirth-common-ai/back'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

// API del tipo `aitoolset` (plan: plans/ai-tools/PLAN.md, S1).
//
// Dos listados distintos a proposito:
//   GET /            → lo INSTALADO (metadatos del manager), que es lo que pinta el manager dialog
//   GET /catalog     → lo REGISTRADO y utilizable (built-in + instalado), que es lo que necesita el
//                      selector de tools para ofrecer toolsets y marcar sus tools
//
// No es lo mismo: un built-in no esta "instalado" —no se instala ni se desinstala— pero si esta
// disponible; y un instalado cuyo back.js no cargo esta en el indice y NO esta disponible.
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
        // Se enriquece con toolCount desde el REGISTRO, no desde el indice: el indice dice lo que se
        // instalo y el registro lo que de verdad se cargo. Si un back.js fallo al cargar, la tarjeta lo
        // enseña sin contador en vez de mentir con el numero que traia el paquete.
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                const metas = await this.manager.listInstalled()
                res.json(metas.map(m => ({ ...m, toolCount: getToolset(m.id)?.tools.length })))
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        // El catalogo lleva las FICHAS (IAiToolsetInfo): nombre, descripcion, efecto y sensibilidad de
        // cada tool. Nunca el inputSchema ni el execute — eso es del back y no tiene por que viajar.
        this.router.get('/catalog', async (_req: Request, res: Response) => {
            try {
                res.json(listToolsetInfos().map(t => ({ ...t, builtIn: isBuiltInToolsetId(t.id) })))
            }
            catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        // ── Concesiones: que plugins pueden usar cada toolset ───────────────────────────────────────
        //
        // El mapa entero de una lectura: la pregunta que hay que poder responder rapido es "¿quien puede
        // escribir en el cluster por IA?", y esa se contesta mirando quien tiene concedido k8s-ops.
        this.router.get('/grants', async (_req: Request, res: Response) => {
            try { res.json(await this.manager.listGrants()) }
            catch (err) { res.status(500).json({ error: String(err) }) }
        })

        // Conceder es un acto de ADMIN, no de cualquiera con una key valida: da acceso a tools que tocan
        // el cluster. Es la unica ruta de este API que exige scope de admin.
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
                // 'upgrade' es el permiso EXPLICITO para pisar una instalacion existente. Sin el, el
                // manager rechaza una id ya instalada, que es el comportamiento de siempre.
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
