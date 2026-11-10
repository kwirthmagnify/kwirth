import express, { Request, Response } from 'express'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { IConfigMaps } from '../tools/IConfigMap'
import { ISecrets } from '../tools/ISecrets'
import { guard } from '../tools/RequestGuard'
import { ELogComponent, logInfo } from '../tools/Logging'

// What every channel's own storage object is named after: 'kwirth-store-channel-<key>' (see writeStorage).
export const CHANNEL_STORE_PREFIX = 'kwirth-store-channel-'

// A key as a channel names it. Nothing that could leave the storage folder of the file storages.
const VALID_KEY = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/

/*
    The channels' own storage, seen from outside the channels: what keys exist, and removing one.

    The key is whatever each channel chose ('<channel>-config' for one, a bare 'eol' for another…), so
    there is no telling here whose a key is: that is for the caller to know. The use it was made for is a
    setup tool undoing what came after its snapshot: it lists the keys before, lists them again, and
    deletes what is new. A key exists as a ConfigMap, as a Secret or as both
    (a channel writes each one with `secret` true or false), so the list is of KEYS and the delete removes
    both.

    Admin only: this deletes any channel's configuration, credentials included.
*/
export class ChannelStorageApi {
    public router = express.Router()

    constructor(configMaps: IConfigMaps, secrets: ISecrets, apiKeyApi: ApiKeyApi) {
        const admin = async (req: Request, res: Response, next: express.NextFunction) => {
            if (!(await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
            if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
            next()
        }

        // GET → the keys, sorted, each once.
        this.router.route('/')
            .all(admin)
            .get((_req: Request, res: Response) => {
                guard((async () => {
                    const names = [...await configMaps.list(CHANNEL_STORE_PREFIX), ...await secrets.list(CHANNEL_STORE_PREFIX)]
                    res.status(200).json([...new Set(names.map(n => n.substring(CHANNEL_STORE_PREFIX.length)))].sort())
                })(), res, ELogComponent.STORAGE)
            })

        // DELETE /:key → its ConfigMap and its Secret, whichever exist. A key that does not exist is not an error.
        this.router.route('/:key')
            .all(admin)
            .delete((req: Request, res: Response) => {
                guard((async () => {
                    const key = String(req.params.key)
                    if (!VALID_KEY.test(key)) { res.status(400).json({ error: 'invalid storage key' }); return }
                    await configMaps.delete(CHANNEL_STORE_PREFIX + key)
                    await secrets.delete(CHANNEL_STORE_PREFIX + key)
                    logInfo(ELogComponent.STORAGE, `Channel storage '${key}' deleted`)
                    res.status(200).json({ deleted: key })
                })(), res, ELogComponent.STORAGE)
            })
    }
}
