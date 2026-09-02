import express, { Request, Response } from 'express'
import { ISecrets } from '../tools/ISecrets'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { STORAGE_KEY_PROVIDERS, STORAGE_KEY_LLMS } from '@kwirthmagnify/kwirth-common-ai'

export class AiConfigApi {
    public router = express.Router()
    private secrets: ISecrets

    constructor(secrets: ISecrets, apiKeyApi: ApiKeyApi) {
        this.secrets = secrets

        const authMiddleware = async (req: Request, res: Response, next: express.NextFunction) => {
            if (!(await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
            next()
        }

        this.router.route('/providers')
            .all(authMiddleware)
            .get(async (_req: Request, res: Response) => {
                try {
                    const content = await this.secrets.read('kwirth-store-common-' + STORAGE_KEY_PROVIDERS)
                    if (content && content['data']) {
                        const decoded = Buffer.from(content['data'], 'base64').toString('utf8')
                        res.status(200).json(JSON.parse(decoded))
                    }
                    else {
                        res.status(200).json([])
                    }
                }
                catch (err) {
                    console.error('AiConfigApi: error reading providers', err)
                    res.status(500).json([])
                }
            })
            .post(async (req: Request, res: Response) => {
                try {
                    const base64Data = Buffer.from(JSON.stringify(req.body), 'utf8').toString('base64')
                    await this.secrets.write('kwirth-store-common-' + STORAGE_KEY_PROVIDERS, { data: base64Data })
                    res.status(200).json()
                }
                catch (err) {
                    console.error('AiConfigApi: error writing providers', err)
                    res.status(500).json()
                }
            })

        this.router.route('/llms')
            .all(authMiddleware)
            .get(async (_req: Request, res: Response) => {
                try {
                    const content = await this.secrets.read('kwirth-store-common-' + STORAGE_KEY_LLMS)
                    if (content && content['data']) {
                        const decoded = Buffer.from(content['data'], 'base64').toString('utf8')
                        res.status(200).json(JSON.parse(decoded))
                    }
                    else {
                        res.status(200).json([])
                    }
                }
                catch (err) {
                    console.error('AiConfigApi: error reading llms', err)
                    res.status(500).json([])
                }
            })
            .post(async (req: Request, res: Response) => {
                try {
                    const base64Data = Buffer.from(JSON.stringify(req.body), 'utf8').toString('base64')
                    await this.secrets.write('kwirth-store-common-' + STORAGE_KEY_LLMS, { data: base64Data })
                    res.status(200).json()
                }
                catch (err) {
                    console.error('AiConfigApi: error writing llms', err)
                    res.status(500).json()
                }
            })
    }
}
