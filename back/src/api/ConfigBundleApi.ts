import { Router, Request, Response } from 'express'
import { IConfigBundle } from '@kwirthmagnify/kwirth-common'
import { ConfigBundleManager, validateBundle } from '../tools/ConfigBundleManager'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ELogComponent, logError } from '../tools/Logging'

/*
    Las rutas de la portabilidad de configuracion.

    Todo pasa por `validKey`: un bundle puede llevar credenciales dentro y, al importar, reescribe la
    configuracion de la instalacion entera. No es una lectura cualquiera.

    Las rutas de export/import que ya tienen `idp`, `sender` y `webhook` NO se tocan: siguen valiendo
    para llevarse una extension suelta. Esto se suma por encima, para el conjunto.
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
        // Que hay para exportar y en que estado esta cada cosa: lo que pinta el dialogo de export.
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
                // `include` llega como lista separada por comas; sin el, entra todo lo disponible.
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

        // Que haria el import, sin hacerlo. Lo que se ve aqui es lo que va a pasar.
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
            // El fichero es editable a mano —y eso es deseable—, asi que lo que llega no es de fiar.
            // El envoltorio se valida aqui; el contenido de cada extension lo valida ella.
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
