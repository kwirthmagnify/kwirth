import express, { Request, Response} from 'express'
import { EExtensionType, IMarketplace } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { MarketplaceManager } from '../tools/MarketplaceManager'
import { ELogComponent, logError } from '../tools/Logging'

// Cuerpo de la prueba de alcance: el marketplace tal como esta en el formulario, mas el token en claro
// si el usuario acaba de escribirlo (si no lo manda, se usa el ya guardado).
interface IMarketplaceTestRequest {
    marketplace: IMarketplace
    token?: string
}

export class MarketplaceApi {
    public router = express.Router()
    private manager: MarketplaceManager
    private apiKeyApi: ApiKeyApi

    constructor(manager: MarketplaceManager, apiKeyApi: ApiKeyApi) {
        this.manager = manager
        this.apiKeyApi = apiKeyApi
        this.initializeRoutes()
    }

    private initializeRoutes() {
        // Prueba de alcance de un manifest. Tiene que hacerla el back: si el manifest esta detras de un
        // token privado, el navegador no lo puede leer (ni tiene el token, ni habria CORS).
        this.router.route('/test')
            .all( async (req:Request, res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
                if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
                next()
            })
            .post( async (req:Request, res:Response) => {
                try {
                    const body = req.body as IMarketplaceTestRequest
                    if (!body?.marketplace?.url) { res.status(400).json({ ok: false, error: 'a marketplace url is required' }); return }
                    res.status(200).json(await this.manager.testManifest(body.marketplace, body.token))
                }
                catch (err) {
                    logError(ELogComponent.CORE, `Error testing marketplace manifest: ${err}`)
                    res.status(500).json({ ok: false, error: 'unexpected error' })
                }
            })

        // Listar extensiones disponibles no es administrativo: lo consume cualquier dialogo de gestion,
        // asi que basta con una key valida. Registrar marketplaces si es admin, y eso vive en SettingsApi.
        this.router.route('/:extensionType')
            .all( async (req:Request, res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
                next()
            })
            .get( async (req:Request, res:Response) => {
                try {
                    const extensionType = req.params.extensionType as EExtensionType
                    if (!Object.values(EExtensionType).includes(extensionType)) {
                        res.status(400).json({ error: `unknown extension type '${req.params.extensionType}'` })
                        return
                    }
                    if (req.query.refresh === 'true') this.manager.invalidateCache()
                    res.status(200).json(await this.manager.resolve(extensionType))
                }
                catch (err) {
                    logError(ELogComponent.CORE, `Error resolving marketplace entries: ${err}`)
                    res.status(500).json([])
                }
            })
    }
}
