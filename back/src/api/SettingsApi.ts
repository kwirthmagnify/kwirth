import express, { Request, Response} from 'express'
import { IKwirthSettings, IMarketplace, IPackageRegistry, EPackageRegistryAuthType, EManifestAuthType } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { IConfigMaps } from '../tools/IConfigMap'
import { ISecrets } from '../tools/ISecrets'
import { applyLogSettings, currentLogSettings, ELogComponent, logComponentCatalog, logError } from '../tools/Logging'

const SETTINGS_KEY = 'kwirth.settings'
const TOKENS_KEY = 'kwirth.marketplace.tokens'             // token de lectura del manifest, por marketplace
const REGISTRY_KEY = 'kwirth.registry.credentials'         // contraseña de descarga, por registro de paquetes
const DEFAULT_METRICS_INTERVAL = 15
const DEFAULT_PREVIOUS_LOG_LINES = 1000
const DEFAULT_PREVIOUS_LOG_SENDER_LINES = 200

// Secrets travel inside manifestAuth.token / auth.password, like any other field: the GET returns them
// and the PUT accepts them. What changes is where they are stored at rest — never in the settings
// configmap, always in ISecrets (encrypted on the filesystem, RBAC in k8s).
//
// They are two independent lists and two different secret stores, because reading a manifest and
// downloading a package are two servers: the public marketplace has its manifests on GitHub and its
// tarballs on npmjs, and one private manifest can list packages hosted in several registries.

export class SettingsApi {
    public router = express.Router()
    private configMaps: IConfigMaps
    private secrets: ISecrets
    private apiKeyApi: ApiKeyApi
    private onSettingsChanged?: (settings: IKwirthSettings) => void

    private constructor(configMaps: IConfigMaps, secrets: ISecrets, apiKeyApi: ApiKeyApi, onSettingsChanged?: (settings: IKwirthSettings) => void) {
        this.configMaps = configMaps
        this.secrets = secrets
        this.apiKeyApi = apiKeyApi
        this.onSettingsChanged = onSettingsChanged
        this.initializeRoutes()
    }

    public static async create(configMaps: IConfigMaps, secrets: ISecrets, apiKeyApi: ApiKeyApi, onSettingsChanged?: (settings: IKwirthSettings) => void): Promise<SettingsApi|undefined> {
        try {
            return new SettingsApi(configMaps, secrets, apiKeyApi, onSettingsChanged)
        }
        catch (err) {
            logError(ELogComponent.CORE, `Could not create settings api: ${err}`)
        }
        return undefined
    }

    // A read with no router, so that startup can hydrate before any routes exist.
    public static async read(configMaps: IConfigMaps): Promise<IKwirthSettings> {
        return (await configMaps.read(SETTINGS_KEY, {})) as IKwirthSettings ?? {}
    }

    /*
        Writes settings splitting credentials into ISecrets, the same the PUT handler does. Used by the
        config-bundle import, which cannot go through the HTTP route: it has the data, not a Request.
        The log is applied hot for the same reason as the PUT.
    */
    public async writeWithSecrets(incoming: IKwirthSettings): Promise<void> {
        const stored = await SettingsApi.read(this.configMaps)
        const merged: IKwirthSettings = { ...stored, ...incoming }
        if (incoming.metricsInterval !== undefined) merged.metricsInterval = +incoming.metricsInterval

        if (incoming.marketplaces !== undefined) {
            const problem = SettingsApi.validateMarketplaces(incoming.marketplaces)
            if (problem) throw new Error(problem)
            const { clean, tokens } = this.splitCredentials(incoming.marketplaces)
            merged.marketplaces = clean
            for (const [id, token] of tokens) await this.secrets.writeKey(TOKENS_KEY, id, token)
            const removed = (stored.marketplaces ?? []).filter(old => !clean.some(m => m.id === old.id))
            for (const old of removed) await this.secrets.writeKey(TOKENS_KEY, old.id, null)
        }

        if (incoming.packageRegistries !== undefined) {
            const problem = SettingsApi.validatePackageRegistries(incoming.packageRegistries)
            if (problem) throw new Error(problem)
            const { clean, secrets } = this.splitRegistryCredentials(incoming.packageRegistries)
            merged.packageRegistries = clean
            for (const [id, password] of secrets) await this.secrets.writeKey(REGISTRY_KEY, id, password)
            const removed = (stored.packageRegistries ?? []).filter(old => !clean.some(r => r.id === old.id))
            for (const old of removed) await this.secrets.writeKey(REGISTRY_KEY, old.id, null)
        }

        await this.configMaps.write(SETTINGS_KEY, merged)
        if (incoming.log !== undefined) applyLogSettings(merged.log)
        if (this.onSettingsChanged) this.onSettingsChanged(merged)
    }

    // The metrics interval's effective value: what is stored wins, then METRICSINTERVAL, then the default.
    public static resolveMetricsInterval(settings: IKwirthSettings): number {
        if (settings.metricsInterval && settings.metricsInterval > 0) return settings.metricsInterval
        const fromEnv = Number(process.env.METRICSINTERVAL)
        if (!isNaN(fromEnv) && fromEnv > 0) return fromEnv
        return DEFAULT_METRICS_INTERVAL
    }

    /*
        How many lines of the PREVIOUS container's log are read at startup. The same precedence as the
        metrics interval —what is stored wins, then the environment variable, then the default— because
        it is the same kind of setting: a number with a sensible value that somebody may want to change
        without touching the deployment.
    */
    public static resolvePreviousLogLines(settings: IKwirthSettings): number {
        if (settings.previousLogLines && settings.previousLogLines > 0) return Math.floor(settings.previousLogLines)
        const fromEnv = Number(process.env.PREVIOUSLOGLINES)
        if (!isNaN(fromEnv) && fromEnv > 0) return Math.floor(fromEnv)
        return DEFAULT_PREVIOUS_LOG_LINES
    }

    /*
        How many of the recovered lines go INSIDE the message sent to the sender, which is not the same
        number as the one that is read: the window that has to contain the cause is wide on purpose,
        and what a destination will accept is not. No environment variable here — this one is only ever
        set from the dialog, next to the sender it belongs to.
    */
    public static resolvePreviousLogSenderLines(settings: IKwirthSettings): number {
        if (settings.previousLogSenderLines && settings.previousLogSenderLines > 0) return Math.floor(settings.previousLogSenderLines)
        return DEFAULT_PREVIOUS_LOG_SENDER_LINES
    }

    // A package registry's password, for whoever has to download a tarball of its. Back end only.
    public static async getRegistryPassword(secrets: ISecrets, registryId: string): Promise<string|undefined> {
        return SettingsApi.readSecret(secrets, REGISTRY_KEY, registryId)
    }

    // The manifest's read token (a private GitLab's PRIVATE-TOKEN, for instance). Back end only.
    public static async getManifestToken(secrets: ISecrets, marketplaceId: string): Promise<string|undefined> {
        return SettingsApi.readSecret(secrets, TOKENS_KEY, marketplaceId)
    }

    private static async readSecret(secrets: ISecrets, store: string, key: string): Promise<string|undefined> {
        const all = await secrets.readAllKeys(store)
        const value = all[key]
        return typeof value === 'string' && value !== '' ? value : undefined
    }

    // Validates the list of marketplaces. Returns the first failure's message, or undefined when it is fine.
    public static validateMarketplaces(marketplaces: unknown): string|undefined {
        if (!Array.isArray(marketplaces)) return 'marketplaces must be an array'
        const seen = new Set<string>()
        for (const m of marketplaces as IMarketplace[]) {
            if (!m || typeof m !== 'object') return 'each marketplace must be an object'
            if (typeof m.id !== 'string' || m.id.trim() === '') return 'each marketplace needs a non-empty id'
            if (seen.has(m.id)) return `duplicated marketplace id '${m.id}'`
            seen.add(m.id)
            if (typeof m.url !== 'string' || !/^https?:\/\/.+/i.test(m.url)) return `marketplace '${m.id}' needs an http(s) url`
            if (typeof m.label !== 'string' || m.label.trim() === '') return `marketplace '${m.id}' needs a non-empty label`
            if (typeof m.enabled !== 'boolean') return `marketplace '${m.id}' needs a boolean enabled`
            if (m.manifestAuth !== undefined && !Object.values(EManifestAuthType).includes(m.manifestAuth.type)) {
                return `marketplace '${m.id}' has an unknown manifest auth type`
            }
        }
        return undefined
    }

    // Validates the list of package registries. Returns the first failure, or undefined when it is fine.
    public static validatePackageRegistries(registries: unknown): string|undefined {
        if (!Array.isArray(registries)) return 'packageRegistries must be an array'
        const seen = new Set<string>()
        for (const r of registries as IPackageRegistry[]) {
            if (!r || typeof r !== 'object') return 'each package registry must be an object'
            if (typeof r.id !== 'string' || r.id.trim() === '') return 'each package registry needs a non-empty id'
            if (seen.has(r.id)) return `duplicated package registry id '${r.id}'`
            seen.add(r.id)
            if (typeof r.url !== 'string' || !/^https?:\/\/.+/i.test(r.url)) return `package registry '${r.id}' needs an http(s) url`
            if (typeof r.label !== 'string' || r.label.trim() === '') return `package registry '${r.id}' needs a non-empty label`
            if (typeof r.enabled !== 'boolean') return `package registry '${r.id}' needs a boolean enabled`
            if (r.auth !== undefined) {
                if (!Object.values(EPackageRegistryAuthType).includes(r.auth.type)) return `package registry '${r.id}' has an unknown auth type`
                if (r.auth.type === EPackageRegistryAuthType.BASIC && (typeof r.auth.username !== 'string' || r.auth.username.trim() === '')) {
                    return `package registry '${r.id}' uses basic auth and needs a username`
                }
            }
        }
        return undefined
    }

    // Separates the secrets from the config: it returns the marketplaces ready for the configmap and,
    // apart from them, what has to be persisted in ISecrets. An absent secret (undefined) keeps the
    // stored one; an empty one ('') deletes it, which is what the user having emptied the form's field means.
    private splitCredentials(incoming: IMarketplace[]): { clean: IMarketplace[], tokens: Map<string, string|null> } {
        const tokens = new Map<string, string|null>()
        const clean: IMarketplace[] = incoming.map(m => {
            if (m.manifestAuth?.token !== undefined) tokens.set(m.id, m.manifestAuth.token === '' ? null : m.manifestAuth.token)
            const cleaned: IMarketplace = { id: m.id, url: m.url, label: m.label, enabled: m.enabled }
            if (m.manifestAuth) {
                // the Basic username is not a secret: it goes in the configmap alongside the type
                cleaned.manifestAuth = { type: m.manifestAuth.type, ...(m.manifestAuth.username ? { username: m.manifestAuth.username } : {}) }
            }
            return cleaned
        })
        return { clean, tokens }
    }

    // The same for the package registries: the secret outside the configmap, the user inside it.
    // Depending on the type the secret is the password (BASIC) or the token (BEARER), but only one
    // applies at a time, so they share a slot in the store: one registry, one secret.
    private splitRegistryCredentials(incoming: IPackageRegistry[]): { clean: IPackageRegistry[], secrets: Map<string, string|null> } {
        const secrets = new Map<string, string|null>()
        const clean: IPackageRegistry[] = incoming.map(r => {
            const secret = r.auth?.type === EPackageRegistryAuthType.BEARER ? r.auth.token : r.auth?.password
            if (secret !== undefined) secrets.set(r.id, secret === '' ? null : secret)
            const cleaned: IPackageRegistry = { id: r.id, url: r.url, label: r.label, enabled: r.enabled }
            if (r.auth) {
                cleaned.auth = { type: r.auth.type, ...(r.auth.username ? { username: r.auth.username } : {}) }
            }
            return cleaned
        })
        return { clean, secrets }
    }

    // Fills every marketplace with its stored secret. They travel to the front end like any other field:
    // the form pre-fills them masked and the eye reveals them, with no separate endpoint.
    public async withSecrets(settings: IKwirthSettings): Promise<IKwirthSettings> {
        if (!settings.marketplaces?.length && !settings.packageRegistries?.length) return settings
        const [tokens, passwords] = await Promise.all([
            this.secrets.readAllKeys(TOKENS_KEY),
            this.secrets.readAllKeys(REGISTRY_KEY)
        ])
        const asString = (v: unknown): string|undefined => typeof v === 'string' && v !== '' ? v : undefined
        return {
            ...settings,
            ...(settings.marketplaces ? {
                marketplaces: settings.marketplaces.map(m => ({
                    ...m,
                    ...(m.manifestAuth ? { manifestAuth: { ...m.manifestAuth, token: asString(tokens[m.id]) } } : {})
                }))
            } : {}),
            ...(settings.packageRegistries ? {
                packageRegistries: settings.packageRegistries.map(r => ({
                    ...r,
                    ...(r.auth ? { auth: { ...r.auth, ...(r.auth.type === EPackageRegistryAuthType.BEARER
                        ? { token: asString(passwords[r.id]) }
                        : { password: asString(passwords[r.id]) }) } } : {})
                }))
            } : {})
        }
    }

    private initializeRoutes() {
        /*
            The components the log has, so the dialog can draw them without knowing the enum. It is the
            same approach as GET /core/scopes: the list lives in ONE place — the back end — instead of
            being duplicated in the front end and drifting apart the day a component is added.

            It needs a valid key but not the 'admin' scope: it reveals no configuration, only which
            buckets exist.
        */
        this.router.route('/log/components')
            .get( async (req:Request, res:Response) => {
                if (! (await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
                res.status(200).json(logComponentCatalog())
            })

        /*
            A package registry's reachability test. Same reason as the marketplace manifest test: the
            browser cannot reach a private registry (CORS, and it does not have the credentials), so the
            back end does it. The credentials travel in the body as they do in the PUT — the GET already
            returned them to the form.
        */
        this.router.route('/registry/test')
            .all( async (req:Request, res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
                if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
                next()
            })
            .post( async (req:Request, res:Response) => {
                try {
                    const body = req.body as { url?: string, auth?: IPackageRegistry['auth'] }
                    if (!body?.url) { res.status(200).json({ ok: false, error: 'a registry url is required' }); return }
                    const headers: Record<string, string> = {}
                    if (body.auth?.type === EPackageRegistryAuthType.BASIC) {
                        const credentials = `${body.auth.username ?? ''}:${body.auth.password ?? ''}`
                        headers['Authorization'] = `Basic ${Buffer.from(credentials).toString('base64')}`
                    }
                    else if (body.auth?.type === EPackageRegistryAuthType.BEARER) {
                        headers['Authorization'] = `Bearer ${body.auth.token ?? ''}`
                    }
                    const response = await fetch(body.url, { headers })
                    if (response.status === 401 || response.status === 403) {
                        res.status(200).json({ ok: false, error: `Authentication failed (HTTP ${response.status})` })
                        return
                    }
                    /*
                        Any other HTTP status means the registry IS reachable: a bare GET to an npm
                        registry base URL routinely returns 400 (it expects a package path) or 404,
                        yet npm install works perfectly. The only real failures are a network error
                        (caught below) and bad credentials (handled above).
                    */
                    res.status(200).json({ ok: true, status: response.status })
                }
                catch (err) {
                    logError(ELogComponent.CORE, `Error testing package registry: ${err}`)
                    res.status(500).json({ ok: false, error: 'unexpected error' })
                }
            })

        this.router.route('/')
            .all( async (req:Request, res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
                // configuring Kwirth is an administrative operation: it demands the 'admin' scope
                if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
                next()
            })
            .get( async (_req:Request, res:Response) => {
                try {
                    const stored = await SettingsApi.read(this.configMaps)
                    // the effective values are returned, not the raw ones, so the front end shows what actually rules
                    const hydrated = await this.withSecrets(stored)
                    /*
                        The log goes out as what is IN FORCE, not as what is stored: with nothing
                        configured the stored value is undefined, and the dialog would open with
                        everything blank while the core is writing under its defaults.
                    */
                    res.status(200).json({ ...hydrated, metricsInterval: SettingsApi.resolveMetricsInterval(stored), previousLogLines: SettingsApi.resolvePreviousLogLines(stored),
                        previousLogSenderLines: SettingsApi.resolvePreviousLogSenderLines(stored), log: currentLogSettings() })
                }
                catch (err) {
                    logError(ELogComponent.CORE, `Error reading kwirth settings: ${err}`)
                    res.status(500).json({})
                }
            })
            .put( async (req:Request, res:Response) => {
                try {
                    const incoming = req.body as IKwirthSettings
                    if (incoming.metricsInterval !== undefined && (isNaN(+incoming.metricsInterval) || +incoming.metricsInterval <= 0)) {
                        res.status(400).json({ error: 'metricsInterval must be a positive number' })
                        return
                    }
                    if (incoming.marketplaces !== undefined) {
                        const problem = SettingsApi.validateMarketplaces(incoming.marketplaces)
                        if (problem) { res.status(400).json({ error: problem }); return }
                    }
                    if (incoming.packageRegistries !== undefined) {
                        const problem = SettingsApi.validatePackageRegistries(incoming.packageRegistries)
                        if (problem) { res.status(400).json({ error: problem }); return }
                    }

                    // a merge over what is stored: a partial PUT must not delete settings it does not send
                    const stored = await SettingsApi.read(this.configMaps)
                    const merged: IKwirthSettings = { ...stored, ...incoming }
                    if (incoming.metricsInterval !== undefined) merged.metricsInterval = +incoming.metricsInterval

                    if (incoming.marketplaces !== undefined) {
                        const { clean, tokens } = this.splitCredentials(incoming.marketplaces)
                        merged.marketplaces = clean
                        for (const [id, token] of tokens) await this.secrets.writeKey(TOKENS_KEY, id, token)
                        // a deleted marketplace takes its token with it
                        const removed = (stored.marketplaces ?? []).filter(old => !clean.some(m => m.id === old.id))
                        for (const old of removed) await this.secrets.writeKey(TOKENS_KEY, old.id, null)
                    }

                    if (incoming.packageRegistries !== undefined) {
                        const { clean, secrets } = this.splitRegistryCredentials(incoming.packageRegistries)
                        merged.packageRegistries = clean
                        for (const [id, password] of secrets) await this.secrets.writeKey(REGISTRY_KEY, id, password)
                        const removed = (stored.packageRegistries ?? []).filter(old => !clean.some(r => r.id === old.id))
                        for (const old of removed) await this.secrets.writeKey(REGISTRY_KEY, old.id, null)
                    }

                    await this.configMaps.write(SETTINGS_KEY, merged)
                    /*
                        The log is applied HOT, before answering. It is the one setting that is turned up
                        precisely while something is going wrong, and demanding a restart would take away
                        the very problem being diagnosed.
                    */
                    if (incoming.log !== undefined) applyLogSettings(merged.log)
                    if (this.onSettingsChanged) this.onSettingsChanged(merged)
                    const hydrated = await this.withSecrets(merged)
                    res.status(200).json({ ...hydrated, metricsInterval: SettingsApi.resolveMetricsInterval(merged), log: currentLogSettings() })
                }
                catch (err) {
                    logError(ELogComponent.CORE, `Error writing kwirth settings: ${err}`)
                    res.status(500).json({})
                }
            })
    }
}
