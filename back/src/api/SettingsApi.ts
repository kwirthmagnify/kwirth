import express, { Request, Response} from 'express'
import { IKwirthSettings, IMarketplace, IPackageRegistry, EPackageRegistryAuthType, EManifestAuthType } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { IConfigMaps } from '../tools/IConfigMap'
import { ISecrets } from '../tools/ISecrets'
import { ELogComponent, logError } from '../tools/Logging'

const SETTINGS_KEY = 'kwirth.settings'
const TOKENS_KEY = 'kwirth.marketplace.tokens'             // token de lectura del manifest, por marketplace
const REGISTRY_KEY = 'kwirth.registry.credentials'         // contraseña de descarga, por registro de paquetes
const DEFAULT_METRICS_INTERVAL = 15

// Los secretos viajan dentro de manifestAuth.token / auth.password, como cualquier otro campo: el GET
// los devuelve y el PUT los acepta. Lo que cambia es donde se guardan en reposo — nunca en el configmap
// de settings, siempre en ISecrets (cifrado en filesystem, RBAC en k8s).
//
// Son dos listas independientes y dos almacenes de secretos distintos, porque leer un manifest y bajar
// un paquete son dos servidores: el marketplace publico tiene los manifests en GitHub y los tarballs en
// npmjs, y un mismo manifest privado puede listar paquetes alojados en varios registros.

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

    // Lectura sin router, para que el arranque pueda hidratar antes de que existan rutas.
    public static async read(configMaps: IConfigMaps): Promise<IKwirthSettings> {
        return (await configMaps.read(SETTINGS_KEY, {})) as IKwirthSettings ?? {}
    }

    // Valor efectivo del intervalo de metricas: lo guardado gana, luego METRICSINTERVAL, luego el default.
    public static resolveMetricsInterval(settings: IKwirthSettings): number {
        if (settings.metricsInterval && settings.metricsInterval > 0) return settings.metricsInterval
        const fromEnv = Number(process.env.METRICSINTERVAL)
        if (!isNaN(fromEnv) && fromEnv > 0) return fromEnv
        return DEFAULT_METRICS_INTERVAL
    }

    // Contraseña de un registro de paquetes, para quien tenga que descargar un tarball suyo. Solo back.
    public static async getRegistryPassword(secrets: ISecrets, registryId: string): Promise<string|undefined> {
        return SettingsApi.readSecret(secrets, REGISTRY_KEY, registryId)
    }

    // Token de lectura del manifest (p.ej. PRIVATE-TOKEN de un GitLab privado). Solo back.
    public static async getManifestToken(secrets: ISecrets, marketplaceId: string): Promise<string|undefined> {
        return SettingsApi.readSecret(secrets, TOKENS_KEY, marketplaceId)
    }

    private static async readSecret(secrets: ISecrets, store: string, key: string): Promise<string|undefined> {
        const all = await secrets.readAllKeys(store)
        const value = all[key]
        return typeof value === 'string' && value !== '' ? value : undefined
    }

    // Valida la lista de marketplaces. Devuelve el mensaje del primer fallo, o undefined si esta bien.
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

    // Valida la lista de registros de paquetes. Devuelve el primer fallo, o undefined si esta bien.
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

    // Separa los secretos de la config: devuelve los marketplaces listos para el configmap y, aparte, lo
    // que hay que persistir en ISecrets. Un secreto ausente (undefined) conserva el guardado; uno vacio
    // ('') lo borra, que es lo que significa que el usuario haya vaciado el campo en el formulario.
    private splitCredentials(incoming: IMarketplace[]): { clean: IMarketplace[], tokens: Map<string, string|null> } {
        const tokens = new Map<string, string|null>()
        const clean: IMarketplace[] = incoming.map(m => {
            if (m.manifestAuth?.token !== undefined) tokens.set(m.id, m.manifestAuth.token === '' ? null : m.manifestAuth.token)
            const cleaned: IMarketplace = { id: m.id, url: m.url, label: m.label, enabled: m.enabled }
            if (m.manifestAuth) {
                // el username del Basic no es secreto: va en el configmap junto al tipo
                cleaned.manifestAuth = { type: m.manifestAuth.type, ...(m.manifestAuth.username ? { username: m.manifestAuth.username } : {}) }
            }
            return cleaned
        })
        return { clean, tokens }
    }

    // Lo mismo para los registros de paquetes: el secreto fuera del configmap, el usuario dentro. Segun el
    // tipo el secreto es la contraseña (BASIC) o el token (BEARER), pero solo aplica uno a la vez, asi que
    // comparten ranura en el almacen: un registro, un secreto.
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

    // Rellena cada marketplace con su secreto guardado. Viajan al front como cualquier otro campo: el
    // formulario los pre-rellena enmascarados y el ojo los revela, sin endpoint aparte.
    private async withSecrets(settings: IKwirthSettings): Promise<IKwirthSettings> {
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
        this.router.route('/')
            .all( async (req:Request, res:Response, next) => {
                if (! (await AuthorizationManagement.validKey(req, res, this.apiKeyApi))) return
                // configurar Kwirth es operacion administrativa: exige scope 'admin'
                if (!AuthorizationManagement.hasScope(req, 'admin')) { res.status(403).json({ error: 'admin scope required' }); return }
                next()
            })
            .get( async (_req:Request, res:Response) => {
                try {
                    const stored = await SettingsApi.read(this.configMaps)
                    // se devuelven los valores efectivos, no los crudos, para que el front muestre lo que rige
                    const hydrated = await this.withSecrets(stored)
                    res.status(200).json({ ...hydrated, metricsInterval: SettingsApi.resolveMetricsInterval(stored) })
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

                    // merge sobre lo guardado: un PUT parcial no debe borrar ajustes que no envia
                    const stored = await SettingsApi.read(this.configMaps)
                    const merged: IKwirthSettings = { ...stored, ...incoming }
                    if (incoming.metricsInterval !== undefined) merged.metricsInterval = +incoming.metricsInterval

                    if (incoming.marketplaces !== undefined) {
                        const { clean, tokens } = this.splitCredentials(incoming.marketplaces)
                        merged.marketplaces = clean
                        for (const [id, token] of tokens) await this.secrets.writeKey(TOKENS_KEY, id, token)
                        // un marketplace eliminado se lleva su token con el
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
                    if (this.onSettingsChanged) this.onSettingsChanged(merged)
                    const hydrated = await this.withSecrets(merged)
                    res.status(200).json({ ...hydrated, metricsInterval: SettingsApi.resolveMetricsInterval(merged) })
                }
                catch (err) {
                    logError(ELogComponent.CORE, `Error writing kwirth settings: ${err}`)
                    res.status(500).json({})
                }
            })
    }
}
