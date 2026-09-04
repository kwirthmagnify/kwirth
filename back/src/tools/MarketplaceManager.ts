import { EExtensionType, IKwirthSettings, IMarketplace, IMarketplaceEntry } from '@kwirthmagnify/kwirth-common'
import { IConfigMaps } from './IConfigMap'
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

export class MarketplaceManager {
    private configMaps: IConfigMaps
    private cache: Map<string, ICacheItem> = new Map()

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    // Resolucion pura, sin red: dadas las fuentes YA en orden de precedencia (privados primero, publico
    // ultimo), devuelve las entradas del tipo pedido.
    //
    // La regla es por id y con granularidad de marketplace: la primera fuente que contenga un id lo sirve
    // ENTERO, con toda su lista de versiones, y las entradas de las demas para ese id se descartan. Nunca
    // se mezclan versiones de distintas fuentes. El filtro por tipo va ANTES: dos entradas con el mismo id
    // pero distinto extensionType son extensiones distintas y no deben eclipsarse.
    public static resolveEntries(sources: IMarketplaceSource[], extensionType: EExtensionType): IMarketplaceEntry[] {
        const claimed = new Set<string>()
        const result: IMarketplaceEntry[] = []
        for (const source of sources) {
            const ofType = source.entries.filter(e => e.extensionType === extensionType)
            const idsHere = new Set(ofType.map(e => e.id))
            for (const id of idsHere) {
                if (claimed.has(id)) continue
                claimed.add(id)
                for (const entry of ofType.filter(e => e.id === id)) {
                    result.push({ ...entry, marketplaceId: source.marketplaceId, marketplaceLabel: source.marketplaceLabel })
                }
            }
        }
        return result
    }

    // Descarga un manifest. Nunca lanza: una fuente inalcanzable no puede tumbar las demas, pero SI se
    // registra, a diferencia del silencio absoluto que habia cuando descargaba el navegador.
    private async fetchManifest(url: string): Promise<IMarketplaceEntry[]> {
        const cached = this.cache.get(url)
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.entries
        try {
            const response = await fetch(url)
            if (!response.ok) {
                logWarning(ELogComponent.CORE, `Marketplace manifest ${url} returned ${response.status}`)
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
        const fetched = await Promise.all(list.map(async item => ({
            marketplaceId: item.marketplace?.id,
            marketplaceLabel: item.marketplace?.label,
            entries: await this.fetchManifest(item.url)
        })))
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
