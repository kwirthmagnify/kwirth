import { Router, Request, Response } from 'express'
import { IConfigBundle } from '@kwirthmagnify/kwirth-common'
import { ConfigBundleManager, validateBundle } from '../tools/ConfigBundleManager'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ELogComponent, logError } from '../tools/Logging'

/*
    The configuration portability routes.

    Everything goes through `validKey`: a bundle can carry credentials inside and, when imported, it
    rewrites the whole installation's configuration. It is not just any read.

    The export/import routes `idp`, `sender` and `webhook` already have are NOT touched: they remain
    valid for taking a single extension away. This is added on top, for the whole set.
*/
export class ConfigBundleApi {
    router: Router
    private manager: ConfigBundleManager
    private apiKeyApi: ApiKeyApi

    constructor(manager: ConfigBundleManager, apiKeyApi: ApiKeyApi) {
        this.manager = manager
        this.apiKeyApi = apiKeyApi
        this.router = Router()
        this.addRoutes()
    }

    private addRoutes(): void {
        // What there is to export and what state each thing is in: what the export dialog draws.
        this.router.get('/exportable', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                res.json(await this.manager.listExportable())
            }
            catch (err) {
                logError(ELogComponent.CORE, `Config bundle exportable error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/export', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                // `include` arrives as a comma-separated list; without it, everything available goes in.
                const include = typeof req.query.include === 'string' && req.query.include.length > 0
                    ? req.query.include.split(',')
                    : undefined
                const bundle = await this.manager.export({
                    include,
                    includeCredentials: req.query.credentials === 'true',
                    source: typeof req.query.source === 'string' ? req.query.source : undefined
                })
                res.json(bundle)
            }
            catch (err) {
                logError(ELogComponent.CORE, `Config bundle export error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        // What the import would do, without doing it. What is seen here is what is going to happen.
        this.router.post('/preview', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            const problema = validateBundle(req.body)
            if (problema) return void res.status(400).json({ error: problema })
            try {
                res.json(await this.manager.preview(req.body as IConfigBundle))
            }
            catch (err) {
                logError(ELogComponent.CORE, `Config bundle preview error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/import', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            // The file is editable by hand — and that is desirable — so what arrives is not to be
            // trusted. The wrapper is validated here; each extension validates its own content.
            const problema = validateBundle(req.body?.bundle)
            if (problema) return void res.status(400).json({ error: problema })
            try {
                const include = Array.isArray(req.body.include) ? req.body.include as string[] : undefined
                res.json(await this.manager.import({ bundle: req.body.bundle as IConfigBundle, include }))
            }
            catch (err) {
                logError(ELogComponent.CORE, `Config bundle import error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
