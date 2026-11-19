import { Router, Request, Response, raw } from 'express'
import { SenderManager } from '../tools/SenderManager'
import { ISenderConfig, ISenderStoredConfig } from '@kwirthmagnify/kwirth-common-back'
import { ELogComponent, logError, logInfo } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

export class SenderApi {
    router: Router
    private senderManager: SenderManager
    private apiKeyApi: ApiKeyApi

    constructor(senderManager: SenderManager, apiKeyApi: ApiKeyApi) {
        this.senderManager = senderManager
        this.apiKeyApi = apiKeyApi
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                res.json(await this.senderManager.listInstalled())
            } catch (err) {
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
                const meta = await this.senderManager.install(url, undefined, marketplaceId, marketplaceLabel, upgrade === true)
                logInfo(ELogComponent.CORE, `Sender installed via API: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Sender install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.senderManager.installFromBuffer(req.body)
                logInfo(ELogComponent.CORE, `Sender installed via upload: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Sender upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/export', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(this.senderManager.exportAll())
        })

        this.router.post('/import', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const data = req.body as Record<string, ISenderConfig[]>
                let count = 0
                for (const [senderId, configs] of Object.entries(data)) {
                    if (!this.senderManager.getSender(senderId)) continue
                    for (const config of configs) {
                        if ((await this.senderManager.saveConfig(senderId, config)).length === 0) count++
                    }
                }
                logInfo(ELogComponent.CORE, `Sender configs imported: ${count}`)
                res.json({ ok: true, count })
            } catch (err) {
                logError(ELogComponent.CORE, `Sender import error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                // its configuration is kept unless the confirmation's box asked otherwise (plan P5)
                await this.senderManager.uninstall(req.params.id, req.query.deleteConfig === 'true')
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/export', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(this.senderManager.getConfigs(req.params.id))
        })

        this.router.post('/:id/import', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const configs = req.body as ISenderConfig[]
                if (!Array.isArray(configs)) return void res.status(400).json({ error: 'Expected array of configs' })
                if (!this.senderManager.getSender(req.params.id)) return void res.status(404).json({ error: `Sender '${req.params.id}' not registered` })
                let count = 0
                for (const config of configs) {
                    if ((await this.senderManager.saveConfig(req.params.id, config)).length === 0) count++
                }
                logInfo(ELogComponent.CORE, `Sender '${req.params.id}' configs imported: ${count}`)
                res.json({ ok: true, count })
            } catch (err) {
                logError(ELogComponent.CORE, `Sender '${req.params.id}' import error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/front', async (req: Request, res: Response) => {
            const js = await this.senderManager.getFrontJs(req.params.id)
            if (js === undefined) return void res.status(404).send('Not found')
            res.setHeader('Content-Type', 'application/javascript')
            res.send(js)
        })

        this.router.get('/:id/schema', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(this.senderManager.getSchema(req.params.id))
        })

        this.router.get('/:id/configs', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(this.senderManager.getSenderStoredConfig(req.params.id))
        })

        this.router.put('/:id/configs', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const data = req.body as ISenderStoredConfig
                if (!data || typeof data !== 'object' || !Array.isArray(data.configs)) return void res.status(400).json({ error: 'configs array required' })
                if (!this.senderManager.getSender(req.params.id)) return void res.status(404).json({ error: `Sender '${req.params.id}' not registered` })
                // what does not fit the sender's schema is refused field by field, and nothing is saved
                const errors = await this.senderManager.setSenderStoredConfig(req.params.id, data)
                if (errors.length > 0) return void res.status(400).json({ error: errors.map(e => e.message).join('; '), fields: errors })
                logInfo(ELogComponent.CORE, `Sender '${req.params.id}' stored config updated via API`)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/:id/configs', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const config = req.body as ISenderConfig
                if (!config || typeof config !== 'object' || !config.name) return void res.status(400).json({ error: 'config.name required' })
                if (!this.senderManager.getSender(req.params.id)) return void res.status(404).json({ error: `Sender '${req.params.id}' not registered` })
                const errors = await this.senderManager.saveConfig(req.params.id, config)
                if (errors.length > 0) return void res.status(400).json({ error: errors.map(e => e.message).join('; '), fields: errors })
                logInfo(ELogComponent.CORE, `Sender '${req.params.id}' config '${config.name}' added via API`)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id/configs/:name', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const ok = await this.senderManager.removeConfig(req.params.id, req.params.name)
                if (!ok) return void res.status(404).json({ error: 'Config or sender not found' })
                logInfo(ELogComponent.CORE, `Sender '${req.params.id}' config '${req.params.name}' removed via API`)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
