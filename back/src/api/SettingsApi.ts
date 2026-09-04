import express, { Request, Response} from 'express'
import { IKwirthSettings, IMarketplace, EMarketplaceAuthType, EManifestAuthType } from '@kwirthmagnify/kwirth-common'
import { AuthorizationManagement } from '../tools/AuthorizationManagement'
import { ApiKeyApi } from './ApiKeyApi'
import { IConfigMaps } from '../tools/IConfigMap'
import { ISecrets } from '../tools/ISecrets'
import { ELogComponent, logError } from '../tools/Logging'

const SETTINGS_KEY = 'kwirth.settings'
const CREDENTIALS_KEY = 'kwirth.marketplace.credentials'   // contraseña del registro de paquetes
const TOKENS_KEY = 'kwirth.marketplace.tokens'             // token de lectura del manifest
const DEFAULT_METRICS_INTERVAL = 15

// Lo que puede llegar en un PUT: como IMarketplace pero admitiendo los secretos en claro, que se
// desvian a ISecrets y jamas se escriben en el configmap de settings.
interface IMarketplaceInput extends IMarketplace {
    password?: string   // registro de paquetes
    token?: string      // lectura del manifest
}

interface IKwirthSettingsInput extends IKwirthSettings {
    marketplaces?: IMarketplaceInput[]
}

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

    // Credenciales de un marketplace, para quien tenga que descargar un paquete suyo. Solo back.
    public static async getPassword(secrets: ISecrets, marketplaceId: string): Promise<string|undefined> {
        return SettingsApi.readSecret(secrets, CREDENTIALS_KEY, marketplaceId)
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
        for (const m of marketplaces as IMarketplaceInput[]) {
            if (!m || typeof m !== 'object') return 'each marketplace must be an object'
            if (typeof m.id !== 'string' || m.id.trim() === '') return 'each marketplace needs a non-empty id'
            if (seen.has(m.id)) return `duplicated marketplace id '${m.id}'`
            seen.add(m.id)
            if (typeof m.url !== 'string' || !/^https?:\/\/.+/i.test(m.url)) return `marketplace '${m.id}' needs an http(s) url`
            if (typeof m.label !== 'string' || m.label.trim() === '') return `marketplace '${m.id}' needs a non-empty label`
            if (typeof m.enabled !== 'boolean') return `marketplace '${m.id}' needs a boolean enabled`
            if (m.auth !== undefined) {
                if (!Object.values(EMarketplaceAuthType).includes(m.auth.type)) return `marketplace '${m.id}' has an unknown auth type`
                if (m.auth.type === EMarketplaceAuthType.BASIC && (typeof m.auth.username !== 'string' || m.auth.username.trim() === '')) {
                    return `marketplace '${m.id}' uses basic auth and needs a username`
                }
            }
            if (m.manifestAuth !== undefined && !Object.values(EManifestAuthType).includes(m.manifestAuth.type)) {
                return `marketplace '${m.id}' has an unknown manifest auth type`
            }
        }
        return undefined
    }

    // Separa las contraseñas de la config: devuelve los marketplaces listos para el configmap y, aparte,
    // las contraseñas a persistir. Una entrada sin password conserva la ya guardada (no la borra).
    private splitCredentials(incoming: IMarketplaceInput[]): { clean: IMarketplace[], passwords: Map<string, string>, tokens: Map<string, string> } {
        const passwords = new Map<string, string>()
        const tokens = new Map<string, string>()
        const clean: IMarketplace[] = incoming.map(m => {
            const { password, token, ...rest } = m
            if (password !== undefined && password !== '') passwords.set(m.id, password)
            if (token !== undefined && token !== '') tokens.set(m.id, token)
            const cleaned: IMarketplace = { id: rest.id, url: rest.url, label: rest.label, enabled: rest.enabled }
            if (rest.auth) {
                cleaned.auth = { type: rest.auth.type, ...(rest.auth.username ? { username: rest.auth.username } : {}) }
            }
            if (rest.manifestAuth) {
                cleaned.manifestAuth = { type: rest.manifestAuth.type }
            }
            return cleaned
        })
        return { clean, passwords, tokens }
    }

    // Añade hasPassword / hasToken a cada marketplace, sin exponer nunca el secreto en si.
    private async withSecretFlags(settings: IKwirthSettings): Promise<IKwirthSettings> {
        if (!settings.marketplaces?.length) return settings
        const [passwords, tokens] = await Promise.all([
            this.secrets.readAllKeys(CREDENTIALS_KEY),
            this.secrets.readAllKeys(TOKENS_KEY)
        ])
        return {
            ...settings,
            marketplaces: settings.marketplaces.map(m => ({
                ...m,
                ...(m.auth ? { auth: { ...m.auth, hasPassword: Boolean(passwords[m.id]) } } : {}),
                ...(m.manifestAuth ? { manifestAuth: { ...m.manifestAuth, hasToken: Boolean(tokens[m.id]) } } : {})
            }))
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
                    const withFlags = await this.withSecretFlags(stored)
                    res.status(200).json({ ...withFlags, metricsInterval: SettingsApi.resolveMetricsInterval(stored) })
                }
                catch (err) {
                    logError(ELogComponent.CORE, `Error reading kwirth settings: ${err}`)
                    res.status(500).json({})
                }
            })
            .put( async (req:Request, res:Response) => {
                try {
                    const incoming = req.body as IKwirthSettingsInput
                    if (incoming.metricsInterval !== undefined && (isNaN(+incoming.metricsInterval) || +incoming.metricsInterval <= 0)) {
                        res.status(400).json({ error: 'metricsInterval must be a positive number' })
                        return
                    }
                    if (incoming.marketplaces !== undefined) {
                        const problem = SettingsApi.validateMarketplaces(incoming.marketplaces)
                        if (problem) { res.status(400).json({ error: problem }); return }
                    }

                    // merge sobre lo guardado: un PUT parcial no debe borrar ajustes que no envia
                    const stored = await SettingsApi.read(this.configMaps)
                    const merged: IKwirthSettings = { ...stored, ...incoming }
                    if (incoming.metricsInterval !== undefined) merged.metricsInterval = +incoming.metricsInterval

                    if (incoming.marketplaces !== undefined) {
                        const { clean, passwords, tokens } = this.splitCredentials(incoming.marketplaces)
                        merged.marketplaces = clean
                        for (const [id, password] of passwords) await this.secrets.writeKey(CREDENTIALS_KEY, id, password)
                        for (const [id, token] of tokens) await this.secrets.writeKey(TOKENS_KEY, id, token)
                        // un marketplace eliminado se lleva sus secretos con el
                        const removed = (stored.marketplaces ?? []).filter(old => !clean.some(m => m.id === old.id))
                        for (const old of removed) {
                            await this.secrets.writeKey(CREDENTIALS_KEY, old.id, null)
                            await this.secrets.writeKey(TOKENS_KEY, old.id, null)
                        }
                    }

                    await this.configMaps.write(SETTINGS_KEY, merged)
                    if (this.onSettingsChanged) this.onSettingsChanged(merged)
                    const withFlags = await this.withSecretFlags(merged)
                    res.status(200).json({ ...withFlags, metricsInterval: SettingsApi.resolveMetricsInterval(merged) })
                }
                catch (err) {
                    logError(ELogComponent.CORE, `Error writing kwirth settings: ${err}`)
                    res.status(500).json({})
                }
            })
    }
}
