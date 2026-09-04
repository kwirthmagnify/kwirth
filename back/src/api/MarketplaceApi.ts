import express, { Request, Response} from 'express'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { MarketplaceManager } from '../tools/MarketplaceManager'
import { ELogComponent, logError } from '../tools/Logging'

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
