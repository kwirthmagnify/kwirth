import { Router, Request, Response, raw } from 'express'
import { WebhookManager } from '../tools/WebhookManager'
import { IWebhookConfig, IWebhookStoredConfig } from '@kwirthmagnify/kwirth-common-back'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

export class WebhookApi {
    router: Router
    private webhookManager: WebhookManager
    private apiKeyApi: ApiKeyApi

    constructor(webhookManager: WebhookManager, apiKeyApi: ApiKeyApi) {
        this.webhookManager = webhookManager
        this.apiKeyApi = apiKeyApi
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                res.json(await this.webhookManager.listInstalled())
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const { url } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.webhookManager.install(url)
                logInfo(ELogComponent.CORE, `Webhook installed via API: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Webhook install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.webhookManager.installFromBuffer(req.body)
                logInfo(ELogComponent.CORE, `Webhook installed via upload: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Webhook upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/export', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(this.webhookManager.exportAll())
        })

        this.router.post('/import', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const data = req.body as Record<string, IWebhookConfig[]>
                let count = 0
                for (const [webhookId, configs] of Object.entries(data)) {
                    for (const config of configs) {
                        if (this.webhookManager.addConfig(webhookId, config)) count++
                    }
                }
                logInfo(ELogComponent.CORE, `Webhook configs imported: ${count}`)
                res.json({ ok: true, count })
            } catch (err) {
                logError(ELogComponent.CORE, `Webhook import error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.webhookManager.uninstall(req.params.id)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/export', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(this.webhookManager.getConfigs(req.params.id))
        })

        this.router.post('/:id/import', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const configs = req.body as IWebhookConfig[]
                if (!Array.isArray(configs)) return void res.status(400).json({ error: 'Expected array of configs' })
                let count = 0
                for (const config of configs) {
                    if (this.webhookManager.addConfig(req.params.id, config)) count++
                }
                logInfo(ELogComponent.CORE, `Webhook '${req.params.id}' configs imported: ${count}`)
                res.json({ ok: true, count })
            } catch (err) {
                logError(ELogComponent.CORE, `Webhook '${req.params.id}' import error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/front', async (req: Request, res: Response) => {
            const js = await this.webhookManager.getFrontJs(req.params.id)
            if (js === undefined) return void res.status(404).send('Not found')
            res.setHeader('Content-Type', 'application/javascript')
            res.send(js)
        })

        this.router.get('/:id/schema', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(this.webhookManager.getSchema(req.params.id))
        })

        this.router.get('/:id/configs', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(this.webhookManager.getWebhookStoredConfig(req.params.id))
        })

        this.router.put('/:id/configs', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const data = req.body as IWebhookStoredConfig
                if (!data || !Array.isArray(data.configs)) return void res.status(400).json({ error: 'configs array required' })
                const ok = this.webhookManager.setWebhookStoredConfig(req.params.id, data)
                if (!ok) return void res.status(404).json({ error: `Webhook '${req.params.id}' not registered` })
                logInfo(ELogComponent.CORE, `Webhook '${req.params.id}' stored config updated via API`)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/:id/configs', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const config = req.body as IWebhookConfig
                if (!config?.name) return void res.status(400).json({ error: 'config.name required' })
                const ok = this.webhookManager.addConfig(req.params.id, config)
                if (!ok) return void res.status(404).json({ error: `Webhook '${req.params.id}' not registered` })
                logInfo(ELogComponent.CORE, `Webhook '${req.params.id}' config '${config.name}' added via API`)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id/configs/:name', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const ok = this.webhookManager.removeConfig(req.params.id, req.params.name)
                if (!ok) return void res.status(404).json({ error: 'Config or webhook not found' })
                logInfo(ELogComponent.CORE, `Webhook '${req.params.id}' config '${req.params.name}' removed via API`)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        // Específico de webhook: la URL pública (con token opaco) que el usuario pega en el proveedor.
        this.router.get('/:id/configs/:name/url', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            const url = this.webhookManager.getUrl(req.params.id, req.params.name)
            if (!url) return void res.status(404).json({ error: 'Config not found' })
            res.json({ url })
        })

        // Rota el token → nueva URL (invalida la anterior configurada en el proveedor).
        this.router.post('/:id/configs/:name/rotate', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                if (!this.webhookManager.getConfig(req.params.id, req.params.name)) return void res.status(404).json({ error: 'Config not found' })
                this.webhookManager.rotateToken(req.params.id, req.params.name)
                const url = this.webhookManager.getUrl(req.params.id, req.params.name)
                logInfo(ELogComponent.CORE, `Webhook '${req.params.id}' config '${req.params.name}' token rotated`)
                res.json({ url })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
