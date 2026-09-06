import { EExtensionType, EManifestAuthType, IKwirthSettings, IMarketplace, IMarketplaceEntry } from '@kwirthmagnify/kwirth-common'
import { IConfigMaps } from './IConfigMap'
import { ISecrets } from './ISecrets'
import { SettingsApi } from '../api/SettingsApi'
import { ELogComponent, logError, logWarning } from './Logging'

// Marketplace publico OSS. Sigue hardcodeado y sigue siendo el ultimo del orden de busqueda; vive aqui
// (y no repartido por los diez dialogos del front) porque ahora es el back quien resuelve.
const PUBLIC_BASE = 'https://raw.githubusercontent.com/kwirthmagnify/kwirth/refs/heads/master'
const PUBLIC_FOLDER: Record<EExtensionType, string> = {
    [EExtensionType.PLUGIN]: 'plugins',
    [EExtensionType.SENDER]: 'senders',
    [EExtensionType.PROVIDER]: 'providers',
    [EExtensionType.THEME]: 'themes',
    [EExtensionType.HOMEPAGE]: 'homepages',
    [EExtensionType.WEBHOOK]: 'webhooks',
    [EExtensionType.LOGIN]: 'logins',
    [EExtensionType.PACK]: 'packs',
    [EExtensionType.DOCS]: 'docs',
    [EExtensionType.IDP]: 'idps'
}

const CACHE_TTL_MS = 5 * 60 * 1000

// Una fuente ya descargada, con su procedencia. marketplaceId undefined = el publico OSS.
export interface IMarketplaceSource {
    marketplaceId?: string
    marketplaceLabel?: string
    entries: IMarketplaceEntry[]
}

interface ICacheItem {
    at: number
    entries: IMarketplaceEntry[]
}

// Resultado de la prueba de alcance de un manifest, para que la UI pueda distinguir credenciales de red.
export interface IManifestTestResult {
    ok: boolean
    entries?: number
    extensionTypes?: string[]
    error?: string
}

export class MarketplaceManager {
    private configMaps: IConfigMaps
    private secrets: ISecrets
    private cache: Map<string, ICacheItem> = new Map()

    constructor(configMaps: IConfigMaps, secrets: ISecrets) {
        this.configMaps = configMaps
        this.secrets = secrets
    }

    // La Contents API de GitHub devuelve un JSON con el fichero en base64 salvo que se pida el media type
    // 'raw' — sin esto el manifest llegaria como {content, encoding} y se rechazaria por no ser una lista.
    // Se manda SIEMPRE porque lleva el comodin detras: cualquier otro host responde su tipo de siempre.
    private static readonly ACCEPT = 'application/vnd.github.raw, application/json;q=0.9, */*;q=0.8'

    // Cabeceras para leer un manifest. El token nunca sale del back.
    public static buildManifestHeaders(marketplace: IMarketplace|undefined, token: string|undefined): Record<string, string> {
        const accept = { Accept: MarketplaceManager.ACCEPT }
        if (!marketplace?.manifestAuth || !token) return accept
        switch (marketplace.manifestAuth.type) {
            case EManifestAuthType.PRIVATE_TOKEN:
                return { ...accept, 'PRIVATE-TOKEN': token }
            case EManifestAuthType.BEARER:
                return { ...accept, Authorization: `Bearer ${token}` }
            case EManifestAuthType.BASIC: {
                // Azure DevOps autentica el PAT por Basic con el token como CONTRASEÑA; el usuario lo
                // ignora, de ahi que pueda ir vacio.
                const user = marketplace.manifestAuth.username ?? ''
                return { ...accept, Authorization: `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}` }
            }
            default:
                return accept
        }
    }

    // Resolucion pura, sin red: dadas las fuentes YA en orden de precedencia (privados primero, publico
    // ultimo), devuelve las entradas del tipo pedido.
    //
    // La regla es por extension y con granularidad de marketplace: la primera fuente que contenga una
    // extension la sirve ENTERA, con toda su lista de versiones, y las entradas de las demas para esa
    // extension se descartan. Nunca se mezclan versiones de distintas fuentes. El filtro por tipo va
    // ANTES: dos entradas con el mismo id pero distinto extensionType son extensiones distintas y no
    // deben eclipsarse. Lo mismo dentro de 'docs', donde la identidad es el par (targetType, id).
    public static resolveEntries(sources: IMarketplaceSource[], extensionType: EExtensionType): IMarketplaceEntry[] {
        const claimed = new Set<string>()
        const result: IMarketplaceEntry[] = []
        for (const source of sources) {
            const ofType = source.entries.filter(e => e.extensionType === extensionType)
            const keysHere = new Set(ofType.map(e => MarketplaceManager.entryKey(e)))
            for (const key of keysHere) {
                if (claimed.has(key)) continue
                claimed.add(key)
                for (const entry of ofType.filter(e => MarketplaceManager.entryKey(e) === key)) {
                    result.push({ ...entry, marketplaceId: source.marketplaceId, marketplaceLabel: source.marketplaceLabel })
                }
            }
        }
        return result
    }

    // Que hace unica a una entrada dentro de su tipo. Para casi todas es el id; la documentacion añade
    // el targetType, porque su id es el de la extension documentada y puede repetirse entre tipos.
    private static entryKey(entry: IMarketplaceEntry): string {
        return entry.targetType ? `${entry.targetType}/${entry.id}` : entry.id
    }

    // Descarga un manifest. Nunca lanza: una fuente inalcanzable no puede tumbar las demas, pero SI se
    // registra, a diferencia del silencio absoluto que habia cuando descargaba el navegador.
    private async fetchManifest(url: string, headers: Record<string, string>): Promise<IMarketplaceEntry[]> {
        const cached = this.cache.get(url)
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.entries
        try {
            const response = await fetch(url, { headers })
            if (!response.ok) {
                // 401/403 con token configurado suele ser token caducado o sin permiso: merece decirlo claro
                const hint = (response.status === 401 || response.status === 403) && Object.keys(headers).length > 0
                    ? ' (the configured manifest token was rejected)'
                    : ''
                logWarning(ELogComponent.CORE, `Marketplace manifest ${url} returned ${response.status}${hint}`)
                return []
            }
            // un 200 con HTML suele ser una pagina de login: el host ignoro el token (URL web en vez de API)
            if ((response.headers.get('content-type') ?? '').includes('text/html')) {
                logWarning(ELogComponent.CORE, `Marketplace manifest ${url} answered HTML instead of JSON (likely a login page: use the API endpoint, not the web URL)`)
                return []
            }
            const body = await response.json()
            if (!Array.isArray(body)) {
                logWarning(ELogComponent.CORE, `Marketplace manifest ${url} is not an array`)
                return []
            }
            const entries = body as IMarketplaceEntry[]
            this.cache.set(url, { at: Date.now(), entries })
            return entries
        }
        catch (err) {
            logError(ELogComponent.CORE, `Could not read marketplace manifest ${url}: ${err}`)
            return []
        }
    }

    public invalidateCache(): void {
        this.cache.clear()
    }

    // Prueba de alcance para la UI: dice si el manifest se lee y cuantas entradas trae, distinguiendo el
    // fallo de credenciales del de red. Si no viene token, se usa el ya guardado para ese marketplace.
    public async testManifest(marketplace: IMarketplace, token?: string): Promise<IManifestTestResult> {
        const effectiveToken = token && token !== '' ? token : await SettingsApi.getManifestToken(this.secrets, marketplace.id)
        const headers = MarketplaceManager.buildManifestHeaders(marketplace, effectiveToken)
        try {
            const response = await fetch(marketplace.url, { headers })
            if (response.status === 401 || response.status === 403) {
                return { ok: false, error: Object.keys(headers).length > 0
                    ? `The manifest rejected the token (HTTP ${response.status})`
                    : `The manifest needs authentication (HTTP ${response.status})` }
            }
            if (!response.ok) return { ok: false, error: `The manifest returned HTTP ${response.status}` }
            // Caso real y confuso: GitLab ignora PRIVATE-TOKEN en su URL raw de la web (/-/raw/...) y sirve
            // la pagina de login con un 200. Sin esto el fallo se veria como "no es una lista de extensiones".
            const contentType = response.headers.get('content-type') ?? ''
            if (contentType.includes('text/html')) {
                return { ok: false, error: 'The URL returned an HTML page instead of JSON. If this is a git host, use its API endpoint rather than the web URL — a web URL usually ignores the token and answers with a login page.' }
            }
            const body = await response.json()
            if (!Array.isArray(body)) return { ok: false, error: 'The manifest is not a list of extensions' }
            const types = [...new Set((body as IMarketplaceEntry[]).map(e => e.extensionType).filter(Boolean))]
            return { ok: true, entries: body.length, extensionTypes: types }
        }
        catch (err) {
            return { ok: false, error: `Could not reach the manifest: ${err}` }
        }
    }

    // Marketplaces configurados y habilitados, en su orden, y el publico al final.
    public static buildSourceList(settings: IKwirthSettings, extensionType: EExtensionType): { url: string, marketplace?: IMarketplace }[] {
        const enabled = (settings.marketplaces ?? []).filter(m => m.enabled)
        return [
            ...enabled.map(m => ({ url: m.url, marketplace: m })),
            { url: `${PUBLIC_BASE}/${PUBLIC_FOLDER[extensionType]}/manifest.json` }
        ]
    }

    public async resolve(extensionType: EExtensionType): Promise<IMarketplaceEntry[]> {
        const settings = await SettingsApi.read(this.configMaps)
        const list = MarketplaceManager.buildSourceList(settings, extensionType)
        // en paralelo: una fuente lenta no debe encolar a las demas
        const fetched = await Promise.all(list.map(async item => {
            const token = item.marketplace ? await SettingsApi.getManifestToken(this.secrets, item.marketplace.id) : undefined
            return {
                marketplaceId: item.marketplace?.id,
                marketplaceLabel: item.marketplace?.label,
                entries: await this.fetchManifest(item.url, MarketplaceManager.buildManifestHeaders(item.marketplace, token))
            }
        }))
        return MarketplaceManager.resolveEntries(fetched, extensionType)
    }

    // Que marketplace sirvio una extension concreta, para que el instalador sepa que credenciales usar.
    public async findOwner(extensionType: EExtensionType, id: string): Promise<IMarketplace|undefined> {
        const settings = await SettingsApi.read(this.configMaps)
        const resolved = await this.resolve(extensionType)
        const entry = resolved.find(e => e.id === id)
        if (!entry?.marketplaceId) return undefined
        return (settings.marketplaces ?? []).find(m => m.id === entry.marketplaceId)
    }
}
