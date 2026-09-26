import { Router, Request, Response, raw } from 'express'
import { ProviderManager } from '../tools/ProviderManager'
import { IProvider, IProviderFieldDef, IProviderSubscriptionHelp, TProviderConstructor } from '../providers/IProvider'
import { TPluviderChannel, warnNameCollisions } from '../providers/Pluvider'
import { IProviderMeta } from '../tools/ProviderManager'
import { ELogComponent, logError, logInfo, providerLogger } from '../tools/Logging'
import { ApiKeyApi } from './ApiKeyApi'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'

export interface IProviderApiCallbacks {
    onProviderInstalled?: (id: string) => void
    onProviderUninstalled?: (id: string) => void
}

/**
 * What this endpoint knows about a provider beyond its installation metadata. It is RUNTIME
 * information: whether it is alive and how to subscribe to it. It is served from here on purpose, so
 * that there is a single place to consult (and a single place to touch when the contract is standardised).
 */
export interface IProviderRuntimeInfo {
    /** true when the provider is instantiated and started in this running instance */
    running?: boolean
    /**
     * true when the provider knows how to check its own configuration: it exposes '/test' in its
     * configRouter. With this the manager draws it a test button beside the form, so the user learns
     * whether the credentials just typed are good instead of finding out when the extension fails
     * silently. Before, every extension that wanted it built it on its own.
     */
    hasTest?: boolean
    /** true for the providers the core registers in code, not installed as an extension */
    core?: boolean
    /** what the provider publishes about how to subscribe to it; absent when it does not implement it */
    subscriptionHelp?: IProviderSubscriptionHelp
    /**
     * names of the configurations the provider has defined; absent when it does not publish
     * getConfigNames(). Names only, never values: it feeds the card's counter just as 'configNames'
     * does in the senders.
     */
    configNames?: string[]
    /**
     * true when it is not a provider but a PLUVIDER: a plugin that also produces and exposes its
     * information in-process.
     *
     * Whoever CONSUMES providers need not look at this field: a pluvider is listed, subscribed to and
     * delivers events just like a provider, and that transparency is precisely the point. The field
     * exists for whoever MANAGES extensions, who does have to tell them apart — a pluvider is not
     * installed or uninstalled separately: it comes and goes with its plugin.
     */
    pluvider?: boolean
    /** id of the channel hosting the pluvider (the 'agora' in 'plugin:agora'). Pluviders only. */
    hostedBy?: string
}

export type TProviderApiEntry = IProviderMeta & IProviderRuntimeInfo

/**
 * What a pluvider inherits from the plugin hosting it. It is not named or versioned separately: it
 * goes inside its plugin and is updated when the plugin is.
 */
export interface IPluviderHostInfo {
    name?: string
    displayName?: string
    version?: string
}

export class ProviderApi {
    router: Router
    private providerManager: ProviderManager
    private registeredProviders: Map<string, TProviderConstructor>
    private apiKeyApi: ApiKeyApi
    private callbacks: IProviderApiCallbacks
    private getRunningProviders: () => IProvider[]
    private getPluviders: () => Map<string, TPluviderChannel>
    private getPluginInfo: (pluginId: string) => Promise<IPluviderHostInfo | undefined>

    constructor(providerManager: ProviderManager, registeredProviders: Map<string, TProviderConstructor>, apiKeyApi: ApiKeyApi, callbacks: IProviderApiCallbacks = {}, getRunningProviders: () => IProvider[] = () => [], getPluviders: () => Map<string, TPluviderChannel> = () => new Map(), getPluginInfo: (pluginId: string) => Promise<IPluviderHostInfo | undefined> = async () => undefined) {
        this.providerManager = providerManager
        this.registeredProviders = registeredProviders
        this.apiKeyApi = apiKeyApi
        this.callbacks = callbacks
        this.getRunningProviders = getRunningProviders
        this.getPluviders = getPluviders
        this.getPluginInfo = getPluginInfo
        this.router = Router()
        this.addRoutes()
    }

    /**
     * getSubscriptionHelp() is OPTIONAL in IProvider: not implementing it is not an error, and a badly
     * written provider that blows up when asked for it must not take down everybody else's listing.
     */
    private subscriptionHelpOf(provider: { getSubscriptionHelp?(): IProviderSubscriptionHelp }, id: string): IProviderSubscriptionHelp | undefined {
        if (typeof provider.getSubscriptionHelp !== 'function') return undefined
        try {
            const help = provider.getSubscriptionHelp()
            if (!help || typeof help.usage !== 'string' || typeof help.example !== 'object') return undefined
            return help
        } catch (err) {
            providerLogger(id).error(`Failed to report its subscription help: ${err}`)
            return undefined
        }
    }

    /**
     * A pluvider has no installation metadata — it is not installed: it comes with its plugin — so the
     * only thing that can describe it is its getPluviderData(). It is read just as defensively as the
     * subscription help: a badly written plugin must not take down anybody's listing.
     */
    private pluviderDescriptionOf(pluvider: TPluviderChannel, id: string): string {
        try {
            return pluvider.getPluviderData()?.description ?? ''
        } catch (err) {
            providerLogger(id).error(`Failed to report its pluvider data: ${err}`)
            return ''
        }
    }

    /**
     * getConfigNames() is OPTIONAL just like getSubscriptionHelp: not implementing it is not an error,
     * and a provider that blows up when asked for it must not take down everybody else's listing.
     */
    private configNamesOf(provider: IProvider): string[] | undefined {
        if (typeof provider.getConfigNames !== 'function') return undefined
        try {
            const names = provider.getConfigNames()
            return Array.isArray(names) ? names.filter(n => typeof n === 'string') : undefined
        } catch (err) {
            providerLogger(provider.id).error(`Failed to report its config names: ${err}`)
            return undefined
        }
    }

    /**
     * Does this provider know how to check its configuration? Its configRouter is inspected for the
     * '/test' route rather than being asked to declare it: the endpoint is the only source that cannot
     * lie, and this way a provider that adds it tomorrow need not touch its package.json and its build too.
     *
     * `stack` is read, which is internal to express but stable, and defensively: a provider with no
     * configRouter, or a version of express that changes it, leaves the button hidden and nothing more.
     */
    private configTestOf(provider: IProvider): boolean {
        const stack = (provider.configRouter as unknown as { stack?: Array<{ route?: { path?: string } }> } | undefined)?.stack
        if (!Array.isArray(stack)) return false
        return stack.some(layer => layer.route?.path === '/test')
    }

    /**
     * getConfigSchema() is the STANDARD way for a provider to declare its configuration, the same one
     * as ISender and IWebhook. It is OPTIONAL, and a provider that blows up when asked for it must not
     * take down everybody else's listing.
     */
    private configSchemaOf(provider: IProvider): IProviderFieldDef[] | undefined {
        if (typeof provider.getConfigSchema !== 'function') return undefined
        try {
            const schema = provider.getConfigSchema()
            return Array.isArray(schema) && schema.length > 0 ? schema : undefined
        } catch (err) {
            providerLogger(provider.id).error(`Failed to report its config schema: ${err}`)
            return undefined
        }
    }

    private addRoutes(): void {
        this.router.get('/', async (_req: Request, res: Response) => {
            try {
                const entries = new Map<string, TProviderApiEntry>()
                for (const meta of await this.providerManager.listInstalled()) entries.set(meta.id, { ...meta })

                // The core providers ('events', 'metrics') are registered in code and are NOT installed
                // as an extension, so listInstalled() does not know them. They are added from the
                // registry so that this endpoint is the complete view.
                // TODO: once events and metrics are externalised as real providers this block is
                // surplus: they will show up in listInstalled() like any other.
                for (const id of this.registeredProviders.keys()) {
                    if (!entries.has(id)) entries.set(id, { id, name: id, version: 'core', description: '', core: true })
                }

                for (const provider of this.getRunningProviders()) {
                    const entry = entries.get(provider.id) ?? { id: provider.id, name: provider.id, version: 'core', description: '', core: true }
                    entry.running = true
                    entry.subscriptionHelp = this.subscriptionHelpOf(provider, provider.id)
                    entry.configNames = this.configNamesOf(provider)
                    // A provider declaring its schema through a method also has configuration to
                    // offer, even though it did not export the 'schema' constant read when installing it.
                    if (this.configSchemaOf(provider)) entry.hasSchema = true
                    if (this.configTestOf(provider)) entry.hasTest = true
                    entries.set(provider.id, entry)
                }

                /*
                    The PLUVIDERS are served in this very list, and on purpose: whoever consumes
                    providers — provider-debug, or any plugin wanting to subscribe — has no reason to
                    know that two kinds of producer exist. It asks for '/core/providers', picks one and
                    subscribes; the id's prefix is already resolved by the core internally.

                    They are marked with 'pluvider' for the only one that does need to tell them apart:
                    the extension manager, because a pluvider is not installed or uninstalled separately.
                */
                for (const [pluvId, pluv] of this.getPluviders()) {
                    // The name and the version are THOSE OF ITS PLUGIN: a pluvider is not named or
                    // versioned separately, it goes inside the plugin publishing it.
                    const hostedBy = pluvId.substring(pluvId.indexOf(':') + 1)
                    const host = await this.getPluginInfo(hostedBy)
                    entries.set(pluvId, {
                        id: pluvId,
                        name: host?.name ?? hostedBy,
                        displayName: host?.displayName,
                        version: host?.version ?? '',
                        description: this.pluviderDescriptionOf(pluv, pluvId),
                        pluvider: true,
                        hostedBy,
                        /*
                            Provenance: it comes from no marketplace, it comes from a plugin. It is
                            marked with the same convention 'pack:<id>' already uses, so the front end
                            recognises it without inventing a new field. Without this it would fall into
                            the fallback and be announced as served by the PUBLIC marketplace, which is
                            false — and with a paid plugin it would, on top of that, announce it as OSS.
                        */
                        installedFrom: pluvId,
                        running: true,
                        subscriptionHelp: this.subscriptionHelpOf(pluv, pluvId)
                    })
                }

                res.json([...entries.values()])
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/install', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                // 'upgrade' is the EXPLICIT permission to overwrite an existing installation. Without
                // it the manager rejects an already installed id, which is the behaviour of always.
                const { url, marketplaceId, marketplaceLabel, upgrade } = req.body
                if (!url) return void res.status(400).json({ error: 'url required' })
                const meta = await this.providerManager.install(url, this.registeredProviders, undefined, marketplaceId, marketplaceLabel, upgrade === true)
                this.callbacks.onProviderInstalled?.(meta.id)
                logInfo(ELogComponent.CORE, `Provider installed via API: ${meta.id} v${meta.version}`)
                // The other direction of the warning: the freshly installed provider may be named the
                // same as a plugin already publishing as a pluvider. It is warned about, not rejected.
                warnNameCollisions([...this.getPluviders().keys()], [meta.id], `installing provider '${meta.id}'`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Provider install error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.post('/upload', raw({ type: 'application/octet-stream', limit: '100mb' }), async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Expected binary body' })
            try {
                const meta = await this.providerManager.installFromBuffer(req.body, this.registeredProviders)
                this.callbacks.onProviderInstalled?.(meta.id)
                logInfo(ELogComponent.CORE, `Provider installed via upload: ${meta.id} v${meta.version}`)
                // Uploading the tgz by hand installs just as doing it from the marketplace does: the same warning.
                warnNameCollisions([...this.getPluviders().keys()], [meta.id], `installing provider '${meta.id}'`)
                res.json(meta)
            } catch (err) {
                logError(ELogComponent.CORE, `Provider upload error: ${err}`)
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.delete('/:id', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.providerManager.uninstall(req.params.id, this.registeredProviders)
                this.callbacks.onProviderUninstalled?.(req.params.id)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })

        this.router.get('/:id/front', async (req: Request, res: Response) => {
            const js = await this.providerManager.getFrontJs(req.params.id)
            if (js === undefined) return void res.status(404).send('Not found')
            res.setHeader('Content-Type', 'application/javascript')
            res.send(js)
        })

        this.router.get('/:id/schema', async (req: Request, res: Response) => {
            // The LIVE provider is asked first, which is the standard route. When there is no instance
            // -- a provider with no router that nobody has subscribed to is never instantiated -- it
            // falls back to the 'schema' array the core extracted from its back.js on installing it.
            const running = this.getRunningProviders().find(p => p.id === req.params.id)
            const schema = (running ? this.configSchemaOf(running) : undefined) ?? await this.providerManager.getSchemaAsync(req.params.id)
            if (!schema) return void res.status(404).json({ error: 'No schema' })
            res.json(schema)
        })

        this.router.get('/:id/config', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            res.json(await this.providerManager.getConfig(req.params.id))
        })

        this.router.put('/:id/config', async (req: Request, res: Response) => {
            if (!(await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
            try {
                await this.providerManager.saveConfig(req.params.id, req.body)
                res.json({ ok: true })
            } catch (err) {
                res.status(500).json({ error: String(err) })
            }
        })
    }
}
