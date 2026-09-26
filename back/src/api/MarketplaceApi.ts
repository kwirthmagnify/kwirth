import express, { Request, Response} from 'express'
import { EExtensionType, IMarketplace } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { MarketplaceManager } from '../tools/MarketplaceManager'
import { ELogComponent, logError } from '../tools/Logging'

// The reachability test's body: the marketplace exactly as it stands in the form, plus the token in the
// clear when the user has just typed it (when it is not sent, the stored one is used).
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
        // A manifest's reachability test. The back end has to do it: should the manifest be behind a
        // private token, the browser cannot read it (it neither has the token, nor would there be CORS).
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

        // Listing available extensions is not administrative: any management dialog consumes it, so a
        // valid key is enough. Registering marketplaces IS an admin matter, and that lives in SettingsApi.
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
