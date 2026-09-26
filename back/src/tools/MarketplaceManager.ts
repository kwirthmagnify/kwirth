import { EExtensionType, EManifestAuthType, IKwirthSettings, IMarketplace, IMarketplaceEntry } from '@kwirthmagnify/kwirth-common'
import { IConfigMaps } from './IConfigMap'
import { ISecrets } from './ISecrets'
import { SettingsApi } from '../api/SettingsApi'
import { ELogComponent, logError, logWarning } from './Logging'

// The public OSS marketplace. It is still hardcoded and still the last in the search order; it lives here
// (and not scattered across the front end's ten dialogs) because it is now the back end that resolves.
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
    [EExtensionType.IDP]: 'idps',
    [EExtensionType.AITOOLSET]: 'aitoolsets'
}

const CACHE_TTL_MS = 5 * 60 * 1000

// An already downloaded source, with its provenance. marketplaceId undefined = the public OSS one.
export interface IMarketplaceSource {
    marketplaceId?: string
    marketplaceLabel?: string
    entries: IMarketplaceEntry[]
}

interface ICacheItem {
    at: number
    entries: IMarketplaceEntry[]
}

// The result of a manifest's reachability test, so that the UI can tell credentials from network.
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
    /*
        Downloads IN PROGRESS, by url. The cache alone is not enough: it is consulted on entry and
        written on exit, so ten requests fired at once — which is exactly what the front end's startup
        does, one per extension type — all ten find the cache empty and all ten download the SAME
        manifest. Here the first leaves its promise and the rest hook onto it.
    */
    private enCurso: Map<string, Promise<IMarketplaceEntry[]>> = new Map()

    constructor(configMaps: IConfigMaps, secrets: ISecrets) {
        this.configMaps = configMaps
        this.secrets = secrets
    }

    // GitHub's Contents API returns a JSON with the file in base64 unless the 'raw' media type is asked for
    // — without this the manifest would arrive as {content, encoding} and be rejected for not being a list.
    // It is sent ALWAYS because it carries the wildcard behind it: any other host answers its usual type.
    private static readonly ACCEPT = 'application/vnd.github.raw, application/json;q=0.9, */*;q=0.8'

    // Headers for reading a manifest. The token never leaves the back end.
    public static buildManifestHeaders(marketplace: IMarketplace|undefined, token: string|undefined): Record<string, string> {
        const accept = { Accept: MarketplaceManager.ACCEPT }
        if (!marketplace?.manifestAuth || !token) return accept
        switch (marketplace.manifestAuth.type) {
            case EManifestAuthType.PRIVATE_TOKEN:
                return { ...accept, 'PRIVATE-TOKEN': token }
            case EManifestAuthType.BEARER:
                return { ...accept, Authorization: `Bearer ${token}` }
            case EManifestAuthType.BASIC: {
                // Azure DevOps authenticates the PAT through Basic with the token as the PASSWORD; the
                // user is ignored, hence it can go empty.
                const user = marketplace.manifestAuth.username ?? ''
                return { ...accept, Authorization: `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}` }
            }
            default:
                return accept
        }
    }

    // Pure resolution, no network: given the sources ALREADY in precedence order (private ones first, the
    // public one last), it returns the entries of the requested type.
    //
    // The rule is per extension and with marketplace granularity: the first source containing an extension
    // serves it WHOLE, with its entire list of versions, and the other sources' entries for that extension
    // are discarded. Versions from different sources are never mixed. The filter by type comes BEFORE: two
    // entries with the same id but a different extensionType are different extensions and must not eclipse
    // each other. The same within 'docs', where the identity is the pair (targetType, id).
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

    // What makes an entry unique within its type. For nearly all of them it is the id; documentation adds
    // the targetType, because its id is that of the documented extension and can repeat across types.
    private static entryKey(entry: IMarketplaceEntry): string {
        return entry.targetType ? `${entry.targetType}/${entry.id}` : entry.id
    }

    // A manifest, from wherever it already is: the cache, a download in progress, or a new one.
    private async fetchManifest(url: string, headers: Record<string, string>): Promise<IMarketplaceEntry[]> {
        const cached = this.cache.get(url)
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.entries

        // If somebody is already asking for it, ITS download is waited for instead of firing another just like it.
        const yaPedida = this.enCurso.get(url)
        if (yaPedida) return yaPedida

        const descarga = this.downloadManifest(url, headers).finally(() => this.enCurso.delete(url))
        this.enCurso.set(url, descarga)
        return descarga
    }

    // The real download. It never throws: an unreachable source must not take down the others, but it IS
    // logged, unlike the absolute silence there was when the browser did the downloading.
    private async downloadManifest(url: string, headers: Record<string, string>): Promise<IMarketplaceEntry[]> {
        try {
            const response = await fetch(url, { headers })
            if (!response.ok) {
                // a 401/403 with a token configured usually means an expired token or one without permission: it deserves saying plainly
                const hint = (response.status === 401 || response.status === 403) && Object.keys(headers).length > 0
                    ? ' (the configured manifest token was rejected)'
                    : ''
                logWarning(ELogComponent.CORE, `Marketplace manifest ${url} returned ${response.status}${hint}`)
                return []
            }
            // a 200 with HTML usually means a login page: the host ignored the token (a web URL instead of the API one)
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
        // The half-done ones too: they started before the refresh, so they carry what was there before.
        this.enCurso.clear()
    }

    // A reachability test for the UI: it says whether the manifest reads and how many entries it carries,
    // telling a credentials failure from a network one. When no token comes, the one already stored for
    // that marketplace is used.
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
            // A real and confusing case: GitLab ignores PRIVATE-TOKEN on its web raw URL (/-/raw/...) and
            // serves the login page with a 200. Without this the failure would look like "it is not a list
            // of extensions".
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

    // Configured and enabled marketplaces, in their order, and the public one at the end.
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
        // in parallel: a slow source must not queue up the others
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

    // Which marketplace served a particular extension, so that the installer knows which credentials to use.
    public async findOwner(extensionType: EExtensionType, id: string): Promise<IMarketplace|undefined> {
        const settings = await SettingsApi.read(this.configMaps)
        const resolved = await this.resolve(extensionType)
        const entry = resolved.find(e => e.id === id)
        if (!entry?.marketplaceId) return undefined
        return (settings.marketplaces ?? []).find(m => m.id === entry.marketplaceId)
    }
}
