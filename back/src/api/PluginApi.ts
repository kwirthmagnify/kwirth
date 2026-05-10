import { Router, Request, Response } from 'express'
import { PluginManager } from '../tools/PluginManager'
import { TChannelConstructor } from '../channels/IChannel'
import { ELogComponent, logError, logInfo } from '../tools/Logging'

export class PluginApi {
    router: Router
    private pluginManager: PluginManager
    private registeredChannels: Map<string, TChannelConstructor>

    constructor(pluginManager: PluginManager, registeredChannels: Map<string, TChannelConstructor>) {
        this.pluginManager = pluginManager
        this.registeredChannels = registeredChannels
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                res.json(await this.pluginManager.listInstalled())
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            try {
                const { url } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.pluginManager.install(url, this.registeredChannels)
                logInfo(ELogComponent.CORE, `Plugin installed via API: ${meta.id} v${meta.version}`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Plugin install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            try {
                await this.pluginManager.uninstall(req.params.id, this.registeredChannels)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/front', async (req: Request, res: Response) => {
            try {
                const code = await this.pluginManager.getFrontJs(req.params.id)
                if (!code) return void res.status(404).json({ error: 'Plugin not found' })
                res.setHeader('Content-Type', 'application/javascript')
                res.send(code)
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
