import express, { Request, Response } from 'express'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { IdpManager } from '../tools/IdpManager'
import { IIdpInstanceConfig } from '@kwirthmagnify/kwirth-common-back'
import { ELogComponent, logError } from '../tools/Logging'

const SECRET_MASK = '********'

/*
    Management (admin) of IdP connectors and instances. Mounted at /core/idps under the running instance,
    protected by validKey (just like UserApi/ApiKeyApi; the front end hides the menu from non-admins).
    The schema's 'password' fields are MASKED on the way out and, when saving, if they arrive masked
    the stored value is kept (the write-only secret field pattern).
    Installing connectors (tgz) is EPIC G.
*/
export class IdpApi {
    public router = express.Router()
    private idpManager: IdpManager

    constructor(idpManager: IdpManager, apiKeyApi: ApiKeyApi) {
        this.idpManager = idpManager

        this.router.use(async (req: Request, res: Response, next) => {
            if (!(await AuthorizationManagement.validKey(req, res, apiKeyApi))) return
            // managing IdPs is an administrative operation: it demands the 'admin' scope
            if (!AuthorizationManagement.hasScope(req, 'admin')) {
                res.status(403).json({ error: 'admin scope required' })
                return
            }
            next()
        })

        /*
            The INSTALLED connectors, at the root — like every other extension type.

            🔴 This type is the only one with two resources: the connector (the installed extension) and
            the INSTANCES of it, because one connector can be configured several times — two GitHub orgs,
            two tenants. It used to resolve the clash the other way round, with the instances at the root
            and the connectors under '/connectors', and that made '/core/idps' mean something different
            from what '/core/plugins' or '/core/senders' mean. Whoever asked the eleven types the same
            question got the wrong answer for this one.

            ⚠️ None of this touches the LOGIN flow: what GitHub, Google and Entra have registered is
            '/core/auth/<instance>/callback', served by AuthApi from another router entirely.
        */
        this.router.get('/', (_req: Request, res: Response) => {
            res.status(200).json(this.idpManager.listConnectors())
        })

        // installs a connector from a URL (marketplace / tgz)
        this.router.post('/install', async (req: Request, res: Response) => {
            try {
                const url = String(req.body?.url || '').trim()
                // 'upgrade' is the EXPLICIT permission to overwrite an existing installation. Without
                // it the manager rejects an already installed id, which is the behaviour of always.
                const { marketplaceId, marketplaceLabel, upgrade } = req.body ?? {}
                if (!url) { res.status(400).json({ error: 'url is required' }); return }
                const meta = await this.idpManager.install(url, undefined, marketplaceId, marketplaceLabel, upgrade === true)
                res.status(200).json(meta)
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error installing IdP connector: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        // installs a connector from a local file (a tgz uploaded as octet-stream)
        this.router.post('/upload', express.raw({ type: () => true, limit: '15mb' }), async (req: Request, res: Response) => {
            try {
                const meta = await this.idpManager.installFromBuffer(req.body as Buffer)
                res.status(200).json(meta)
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error uploading IdP connector: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        // uninstall a connector
        this.router.delete('/:connectorId', async (req: Request, res: Response) => {
            try {
                await this.idpManager.uninstall(req.params.connectorId)
                res.status(200).json({})
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error uninstalling IdP connector: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        // export / import of the complete config (admin)
        this.router.get('/export', async (_req: Request, res: Response) => {
            res.status(200).json(await this.idpManager.exportConfig())
        })
        this.router.post('/import', async (req: Request, res: Response) => {
            try {
                await this.idpManager.importConfig(req.body || {})
                res.status(200).json({})
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error importing IdP config: ${err}`)
                res.status(500).json({})
            }
        })

        /*
            The CONFIGURED instances, under '/instances'. They are a second resource of this type —
            one connector, several configurations — and they live below the installed list rather than
            displacing it, so that the root answers the same question here as in the other eleven types.

            They must be declared AFTER the connector routes: express matches in order, and a '/:id' at
            the root would swallow '/instances' before it was ever reached.
        */
        this.router.get('/instances', async (_req: Request, res: Response) => {
            const instances = await this.idpManager.listInstances()
            res.status(200).json(instances.map(i => this.mask(i)))
        })

        // gets an instance (masked)
        this.router.get('/instances/:id', async (req: Request, res: Response) => {
            const inst = await this.idpManager.getInstance(req.params.id)
            if (!inst) {
                res.status(404).json({})
                return
            }
            res.status(200).json(this.mask(inst))
        })

        // crear / actualizar
        this.router.post('/instances', (req: Request, res: Response) => this.save(req, res))
        this.router.put('/instances/:id', (req: Request, res: Response) => this.save(req, res, req.params.id))

        // borrar
        this.router.delete('/instances/:id', async (req: Request, res: Response) => {
            await this.idpManager.deleteInstance(req.params.id)
            res.status(200).json({})
        })
    }

    /** undefined = the schema could not be read, which is NOT the same as 'this connector has none'. */
    private passwordFields(connectorId: string): string[] | undefined {
        const schema = this.idpManager.getConnectorSchema(connectorId)
        return schema?.filter(f => f.type === 'password').map(f => f.name)
    }

    /*
        Returns a copy with the password fields masked (when they have a value).

        🔴 With NO schema it masks EVERYTHING. A broken or incompatible connector cannot say which of its
        fields are secrets, and the old `?? []` turned that into 'it has no secrets' — so the answer went
        out with the client secret in the clear. Unreadable beats leaked: the admin sees masked fields
        and a connector that says it is broken.
    */
    private mask(inst: IIdpInstanceConfig): IIdpInstanceConfig {
        const fields = this.passwordFields(inst.connectorId)
        const config: Record<string, unknown> = { ...inst.config }
        for (const [key, value] of Object.entries(config)) {
            const isSecret = fields ? fields.includes(key) : typeof value === 'string'
            if (isSecret && value !== undefined && value !== '') config[key] = SECRET_MASK
        }
        return { ...inst, config }
    }

    private async save(req: Request, res: Response, idOverride?: string): Promise<void> {
        try {
            const incoming = req.body as IIdpInstanceConfig
            if (idOverride) incoming.id = idOverride
            if (!incoming || !incoming.id || !incoming.connectorId) {
                res.status(400).json({ error: 'id and connectorId are required' })
                return
            }
            /*
                A merge of secrets: a field that arrives masked keeps the stored value.

                It looks at EVERY key instead of asking the schema which ones are passwords: the mask is
                a value this API itself put there, so finding it is answer enough — and with a broken
                connector the schema cannot be read, which used to mean the mask was persisted AS the
                secret, quietly destroying the credential.
            */
            const existing = await this.idpManager.getInstance(incoming.id)
            const config: Record<string, unknown> = { ...(incoming.config || {}) }
            for (const key of Object.keys(config)) {
                if (config[key] === SECRET_MASK) config[key] = existing?.config?.[key] ?? ''
            }
            incoming.config = config
            await this.idpManager.saveInstance(incoming)
            res.status(200).json(this.mask(incoming))
        }
        catch (err) {
            logError(ELogComponent.AUTH, `Error saving IdP instance: ${err}`)
            res.status(500).json({})
        }
    }
}
