import { Router, Request, Response, raw } from 'express'
import { SenderManager } from '../tools/SenderManager'
import { ISenderConfig } from '@kwirthmagnify/kwirth-common-back'
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
                const { url } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.senderManager.install(url)
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
                    for (const config of configs) {
                        if (this.senderManager.addConfig(senderId, config)) count++
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
                await this.senderManager.uninstall(req.params.id)
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
                let count = 0
                for (const config of configs) {
                    if (this.senderManager.addConfig(req.params.id, config)) count++
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
            res.json(this.senderManager.getConfigs(req.params.id))
        })

        this.router.post('/:id/configs', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const config = req.body as ISenderConfig
                if (!config?.name) return void res.status(400).json({ error: 'config.name required' })
                const ok = this.senderManager.addConfig(req.params.id, config)
                if (!ok) return void res.status(404).json({ error: `Sender '${req.params.id}' not registered` })
                logInfo(ELogComponent.CORE, `Sender '${req.params.id}' config '${config.name}' added via API`)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id/configs/:name', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                const ok = this.senderManager.removeConfig(req.params.id, req.params.name)
                if (!ok) return void res.status(404).json({ error: 'Config or sender not found' })
                logInfo(ELogComponent.CORE, `Sender '${req.params.id}' config '${req.params.name}' removed via API`)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
