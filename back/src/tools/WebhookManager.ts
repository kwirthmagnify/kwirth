import { IWebhook, IWebhookAccess, IWebhookConfig, IWebhookConsumer, IWebhookEvent, IWebhookFieldDef, IWebhookStoredConfig, TWebhookConstructor } from '@kwirthmagnify/kwirth-common-back'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'
import crypto from 'crypto'
import { cachedExtensionFile, downloadFile, dropCachedExtensionFiles, packageHeaders, readTarballFile, uniqueTempPath } from './PackageRegistries'
import { assertInstallable } from './ExtensionInstallGuard'
import { assertExtensionRequirements, normalizeRequires } from './ExtensionDeps'
import { EExtensionTag, EExtensionType, IConfigValidationError, IExtensionRequirement, extensionTagsOf } from '@kwirthmagnify/kwirth-common'
import { updateIndex } from './IndexLock'
import { ExtensionConfigStore } from './ExtensionConfigStore'
import { pruneCommon, pruneNamedConfig, validateNamedConfig, validateNamedStored } from './NamedConfigs'

export interface IWebhookMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    tags?: EExtensionTag[]
    installedFrom?: string
    // Which marketplace it came from. It is STORED on install, not deduced: the tarball's url points at
    // the package registry, which is another server, and with precedence by id two marketplaces can
    // serve the same extension. Absent = it came from no marketplace (dev, a file or a loose url).
    marketplaceId?: string
    marketplaceLabel?: string
    backStored?: boolean
    frontStored?: boolean
    requiresRestart?: boolean
    requiresExtension?: IExtensionRequirement[]
}

export type { IWebhookConfig, IWebhookEvent }

const CONFIGMAP_SIZE_LIMIT = 800 * 1024

interface IDevWebhook {
    distPath: string
    meta: IWebhookMeta
}

// The result of resolving an incoming token → which webhook/config/consumer it belongs to.
export interface IWebhookResolution {
    webhookId: string
    configName: string
    config: IWebhookConfig
}

export class WebhookManager implements IWebhookAccess {
    private configMaps: IConfigMaps
    private urlBase: string                                   // p.ej. `${envRootPath}/webhook`
    private registeredWebhooks = new Map<string, TWebhookConstructor>()
    private instances = new Map<string, IWebhook>()
    private devWebhooks = new Map<string, IDevWebhook>()
    // the path watched, by id, so that fs.unwatchFile can be called on unregistering
    private devWatchers = new Map<string, string>()
    // Where the configurations are KEPT: one Secret per webhook, its common base plus its named configs
    // (plans/extension-config, S6). `configStore` and `commonFieldStore` are what is loaded from it.
    private extensionConfigs: ExtensionConfigStore
    private configStore = new Map<string, Map<string, IWebhookConfig>>()
    // The fields the schema marks `common`: one value for every configuration of the webhook. They were
    // never persisted before S6 — the front sent them and the back dropped them.
    private commonFieldStore = new Map<string, Record<string, unknown>>()
    private installedIds: string[] = []
    private installedMetas = new Map<string, IWebhookMeta>()
    private cachedIndex: IWebhookMeta[] = []
    // The token registry: token ↔ (webhookId, configName). The token routes the incoming callback.
    private tokenByConfig = new Map<string, string>()        // `${id}:${name}` → token
    private configByToken = new Map<string, { webhookId: string; configName: string }>()
    // Consumers subscribed by webhookId (a provider-like model: you subscribe to a webhook and receive ITS events).
    private subscribers = new Map<string, Set<IWebhookConsumer>>()

    constructor(configMaps: IConfigMaps, extensionConfigs: ExtensionConfigStore, urlBase: string = '/webhook') {
        this.configMaps = configMaps
        this.extensionConfigs = extensionConfigs
        this.urlBase = urlBase
    }

    async init(): Promise<void> {
        const index = (await this.configMaps.read('kwirth-webhooks-index', [])) as IWebhookMeta[]
        this.cachedIndex = index || []
        this.installedIds = this.cachedIndex.map(w => w.id)
        for (const meta of this.cachedIndex) this.installedMetas.set(meta.id, meta)
    }

    getInstalledIds(): string[] {
        return this.installedIds
    }

    getDevIds(): string[] {
        return Array.from(this.devWebhooks.keys())
    }

    isDevWebhook(id: string): boolean {
        return this.devWebhooks.has(id)
    }

    hasFront(id: string): boolean {
        const dev = this.devWebhooks.get(id)
        if (dev) return fs.existsSync(path.join(dev.distPath, 'front.js'))
        const meta = this.installedMetas.get(id)
        return meta?.frontStored === true
    }

    async getFrontJs(id: string): Promise<string | undefined> {
        const dev = this.devWebhooks.get(id)
        if (dev) {
            try { return fs.readFileSync(path.join(dev.distPath, 'front.js'), 'utf-8') } catch { return undefined }
        }
        const metaData = await this.configMaps.read(`kwirth-webhook-${id}-meta`) as IWebhookMeta | null
        if (!metaData) return undefined
        if (metaData.frontStored === false) return this.fetchFrontJsFromSource(metaData)
        const data = await this.configMaps.read(`kwirth-webhook-${id}-front`)
        if (!data?.code) return undefined
        return data.compressed ? zlib.gunzipSync(Buffer.from(data.code, 'base64')).toString('utf-8') : data.code
    }

    private async fetchFrontJsFromSource(meta: IWebhookMeta): Promise<string | undefined> {
        const cacheFile = cachedExtensionFile('webhook', meta.id, 'front.js')
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') return undefined
        const tmpTgz = uniqueTempPath(`kwirth-webhook-${meta.id}-frontsrc`, '.tgz')
        const tmpDir = uniqueTempPath(`kwirth-webhook-${meta.id}-frontsrc`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await downloadFile(meta.installedFrom, tmpTgz, await packageHeaders(meta.installedFrom))
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            const content = readTarballFile(tmpDir, 'front.js')
            if (!content) return undefined
            fs.writeFileSync(cacheFile, content)
            return content
        } catch { return undefined } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    // ── Dev loading ─────────────────────────────────────────────────────────────

    loadDevWebhooks(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const webhooksMap: Record<string, string> = raw.webhooks ?? {}
            for (const [id, distPath] of Object.entries(webhooksMap)) {
                this.registerDevWebhook(id, distPath)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (webhooks): ${err}`)
        }
    }

    loadDevWebhookConfigs(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const configsMap: Record<string, IWebhookConfig[]> = raw.webhookConfigs ?? {}
            for (const [webhookId, configs] of Object.entries(configsMap)) {
                for (const config of configs) {
                    this.addConfigInternal(webhookId, this.interpolateEnvVars(config))
                }
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (webhookConfigs): ${err}`)
        }
    }

    async loadPersistedConfigs(): Promise<void> {
        const storedTokens = (await this.configMaps.read('kwirth-webhook-tokens', {})) as Record<string, string>
        for (const [key, token] of Object.entries(storedTokens || {})) {
            this.tokenByConfig.set(key, token)
            const [webhookId, configName] = this.splitKey(key)
            this.configByToken.set(token, { webhookId, configName })
        }

        // A webhook that is NOT installed has a configuration an uninstall kept (P5): it waits for a reinstall.
        for (const id of await this.extensionConfigs.list(EExtensionType.WEBHOOK)) {
            if (!this.registeredWebhooks.has(id)) {
                logInfo(ELogComponent.CORE, `Webhook '${id}' is not installed: its kept configuration waits for a reinstall`)
                continue
            }
            await this.loadStoredConfig(id)
        }
    }

    // One webhook's stored document into memory. It was validated when saved, so it is loaded as it is.
    private async loadStoredConfig(id: string): Promise<void> {
        const stored = await this.extensionConfigs.read(EExtensionType.WEBHOOK, id)
        if (stored === undefined) return
        if (!stored || typeof stored !== 'object' || !Array.isArray((stored as IWebhookStoredConfig).configs)) {
            logWarning(ELogComponent.CORE, `Configuration of webhook '${id}' has no list of configs: it is ignored`)
            return
        }
        const { configs, ...common } = stored as IWebhookStoredConfig
        this.commonFieldStore.set(id, common)
        for (const config of configs) this.addConfigInternal(id, config)
    }

    private interpolateEnvVars(obj: IWebhookConfig): IWebhookConfig {
        const json = JSON.stringify(obj).replace(/\$\{([^}]+)\}/g, (_, varName) => {
            const value = process.env[varName]
            if (!value) logWarning(ELogComponent.CORE, `Webhook config references undefined env var: ${varName}`)
            return value ?? ''
        })
        return JSON.parse(json)
    }

    private registerDevWebhook(id: string, distPath: string): void {
        const absPath = path.resolve(distPath)
        const backPath = path.join(absPath, 'back.js')
        const metaPath = path.join(absPath, 'package.json')

        const meta: IWebhookMeta = { id, name: id, version: 'dev', description: 'dev webhook', installedFrom: 'dev' }
        try {
            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            meta.name = pkg.name ?? id
            meta.displayName = pkg.displayName
            meta.version = pkg.version ?? 'dev'
            meta.description = pkg.description ?? ''
            meta.website = pkg.website
            meta.tags = extensionTagsOf(pkg.tags)
            // Without it a dev webhook required no DCE: nobody saw it as a consumer.
            meta.requiresExtension = normalizeRequires(pkg.requiresExtension)
        } catch {}

        this.devWebhooks.set(id, { distPath: absPath, meta })
        this.reloadDevBack(id, backPath)

        // It is watched by POLLING, just as ProviderManager does, and never with fs.watch: a clean
        // build deletes dist/back.js before regenerating it, and an fs.watch over a file that
        // disappears emits an ASYNCHRONOUS 'error' the try/catch does not see and which, with no
        // listener, node turns into an uncaughtException that takes the core down with it. watchFile
        // tolerates the file going away and coming back. mtimeMs 0 = it does not exist right now: it is
        // ignored instead of attempting to reload it.
        fs.watchFile(backPath, { persistent: false, interval: 500 }, (curr, prev) => {
            if (curr.mtimeMs !== prev.mtimeMs && curr.mtimeMs !== 0) {
                logInfo(ELogComponent.CORE, `[dev] Webhook '${id}' back.js changed — hot-reloading`)
                this.reloadDevBack(id, backPath)
            }
        })
        this.devWatchers.set(id, backPath)

        logInfo(ELogComponent.CORE, `[dev] Webhook '${id}' registered from ${absPath}`)
    }

    private reloadDevBack(id: string, backPath: string): void {
        try {
            const resolved = require.resolve(backPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const mod = require(backPath)
            const WebhookClass: TWebhookConstructor = mod.default ?? Object.values(mod).find(v => typeof v === 'function') as TWebhookConstructor
            if (WebhookClass) {
                this.registeredWebhooks.set(id, WebhookClass)
                this.instances.delete(id)
                logInfo(ELogComponent.CORE, `[dev] Webhook '${id}' backend reloaded`)
            } else {
                logError(ELogComponent.CORE, `[dev] Webhook '${id}' back.js exports no class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Webhook '${id}' reload error: ${err}`)
        }
    }

    // ── Persistent install/uninstall ────────────────────────────────────────────

    async loadAll(): Promise<void> {
        for (const meta of this.cachedIndex) {
            try {
                let backJs: string | undefined
                if (meta.backStored === false) {
                    backJs = await this.fetchJsFromSource(meta)
                } else {
                    const backData = await this.configMaps.read(`kwirth-webhook-${meta.id}-back`)
                    if (backData?.code)
                        backJs = backData.compressed ? zlib.gunzipSync(Buffer.from(backData.code, 'base64')).toString('utf-8') : backData.code
                }
                if (backJs) await this.loadBackWebhook(meta.id, backJs)
                else logError(ELogComponent.CORE, `Webhook '${meta.id}' has no back.js — skipping`)
            } catch (err) {
                logError(ELogComponent.CORE, `Failed to load webhook '${meta.id}': ${err}`)
            }
        }
    }

    private async loadBackWebhook(id: string, backJs: string): Promise<void> {
        const tmpPath = path.join(os.tmpdir(), `kwirth-webhook-${id}-back.js`)
        fs.writeFileSync(tmpPath, backJs)
        try {
            if (require.cache[require.resolve(tmpPath)]) delete require.cache[require.resolve(tmpPath)]
            const mod = require(tmpPath)
            const WebhookClass = mod.default ?? Object.values(mod).find(v => typeof v === 'function')
            if (WebhookClass) {
                this.registeredWebhooks.set(id, WebhookClass as TWebhookConstructor)
                logInfo(ELogComponent.CORE, `Webhook '${id}' backend registered`)
            } else {
                logError(ELogComponent.CORE, `Webhook '${id}' back.js exports no webhook class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Error loading webhook '${id}' backend: ${err}`)
        }
    }

    async install(tarGzUrl: string, installedFrom?: string, marketplaceId?: string, marketplaceLabel?: string, upgrade?: boolean): Promise<IWebhookMeta> {
        const tmpTgz = uniqueTempPath('kwirth-webhook', '.tgz')
        let tmpDir = uniqueTempPath('kwirth-webhook-extract')
        fs.mkdirSync(tmpDir, { recursive: true })

        const isLocalPath = tarGzUrl.startsWith('file://') || (!tarGzUrl.startsWith('http://') && !tarGzUrl.startsWith('https://'))

        try {
            if (isLocalPath) {
                const localPath = tarGzUrl.startsWith('file://') ? new URL(tarGzUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1') : tarGzUrl
                fs.copyFileSync(localPath, tmpTgz)
            } else {
                await downloadFile(tarGzUrl, tmpTgz, await packageHeaders(tarGzUrl))
            }
            await tar.x({ file: tmpTgz, cwd: tmpDir })

            let metaPath = path.join(tmpDir, 'package.json')
            let backPath = path.join(tmpDir, 'back.js')

            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) {
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                backPath = path.join(tmpDir, 'back.js')
                if (!fs.existsSync(metaPath) || !fs.existsSync(backPath))
                    throw new Error('Invalid webhook bundle: missing package.json or back.js')
            }

            const meta: IWebhookMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))

            const index = (await this.configMaps.read('kwirth-webhooks-index', []) as IWebhookMeta[]) || []
            // Installed is what installedIds says, not the index: a dev one is loaded without appearing there.
            assertInstallable('Webhook', meta.id, this.installedIds.includes(meta.id) ? (index.find(w => w.id === meta.id) ?? {}) : undefined, meta.version, upgrade)

            meta.installedFrom = installedFrom ?? tarGzUrl
            // A new version cannot inherit the previous one's cached js
            dropCachedExtensionFiles('webhook', meta.id)

            meta.marketplaceId = marketplaceId

            meta.marketplaceLabel = marketplaceLabel
            meta.requiresRestart = meta.requiresRestart ?? false
            // NORMALIZED: the tarball's package.json may still carry the old string form, and the
            // validator reads objects. See the note in PluginManager.
            meta.requiresExtension = normalizeRequires(meta.requiresExtension)
            // The meta IS the tarball's package.json: its tags are untrusted input and only the catalogue's are kept
            meta.tags = extensionTagsOf(meta.tags)
            // A webhook that requires an extension is not installed without it (plans/completed/dce/PRD.md, RF8).
            await assertExtensionRequirements('Webhook', meta.id, meta.requiresExtension, installedFrom)
            const backJs = fs.readFileSync(backPath, 'utf-8')

            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored)
                logInfo(ELogComponent.CORE, `Webhook '${meta.id}' back.js exceeds configmap limit — will fetch from source on startup`)

            const frontPath = path.join(tmpDir, 'front.js')
            let frontEntry: { code: string, compressed: boolean } | null = null
            if (fs.existsSync(frontPath)) {
                const frontJs = fs.readFileSync(frontPath, 'utf-8')
                const frontCompressed = zlib.gzipSync(Buffer.from(frontJs, 'utf-8')).toString('base64')
                meta.frontStored = frontCompressed.length <= CONFIGMAP_SIZE_LIMIT
                if (!meta.frontStored)
                    logInfo(ELogComponent.CORE, `Webhook '${meta.id}' front.js exceeds configmap limit — will fetch from source on request`)
                if (meta.frontStored) frontEntry = { code: frontCompressed, compressed: true }
            }

            /*
                null, and not skipping the write. When updating, a key that is not touched keeps the
                PREVIOUS version's content: the old front if the current one does not fit —or if the new
                version no longer brings a front— and the same with the back. What is installed has to be
                exactly what the package brings, not the sum of what its successive versions brought.
            */
            await this.configMaps.write(`kwirth-webhook-${meta.id}-front`, frontEntry)

            await this.configMaps.write(`kwirth-webhook-${meta.id}-meta`, meta)
            await this.configMaps.write(`kwirth-webhook-${meta.id}-back`, meta.backStored ? { code: backCompressed, compressed: true } : null)

            /*
                🔴 RE-READ INSIDE THE LOCK, instead of writing the list read many awaits ago: between that read
                and here sit the download and the code writes, in which another install can have added ITS
                entry. Writing the stale list dropped it silently while the thing stayed registered in memory,
                so a retry answered 'already installed' and the list never showed it (see IndexLock.ts).
            */
            await updateIndex<IWebhookMeta>('kwirth-webhooks-index',
                async () => (await this.configMaps.read('kwirth-webhooks-index', []) as IWebhookMeta[]) || [],
                async (list) => { await this.configMaps.write('kwirth-webhooks-index', list) },
                (list) => {
                    const at = list.findIndex(e => e.id === meta.id)
                    if (at >= 0) list[at] = meta
                    else list.push(meta)
                    return list
                })
            if (!this.installedIds.includes(meta.id)) this.installedIds.push(meta.id)
            this.installedMetas.set(meta.id, meta)

            await this.loadBackWebhook(meta.id, backJs)
            // What an earlier uninstall kept comes back by itself (P5), and with it its kept tokens: the
            // URLs pasted at GitLab or Jira go on working. An upgrade has it in memory already.
            if (!this.configStore.has(meta.id)) await this.loadStoredConfig(meta.id)
            logInfo(ELogComponent.CORE, `Webhook '${meta.id}' v${meta.version} installed`)
            return meta
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IWebhookMeta> {
        const tmpTgz = uniqueTempPath('kwirth-webhook-upload', '.tgz')
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        } finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    /*
        Its configuration is KEPT unless `deleteConfig` (plan P5), and its tokens with it: a token is the
        URL the outside world calls, and a reinstall that minted new ones would make the admin paste every
        URL again at GitLab, Jira… With `deleteConfig` both go.
    */
    async uninstall(id: string, deleteConfig = false): Promise<void> {
        if (this.isDevWebhook(id)) throw new Error(`Webhook '${id}' is a dev webhook and cannot be uninstalled`)
        const meta = this.installedMetas.get(id)
        if (meta?.installedFrom?.startsWith('pack:')) throw new Error(`Webhook '${id}' was installed by pack '${meta.installedFrom.slice(5)}' — uninstall the pack instead`)
        await this._doUninstall(id, deleteConfig)
    }

    async uninstallFromPack(id: string, deleteConfig = false): Promise<void> {
        await this._doUninstall(id, deleteConfig)
    }

    private async _doUninstall(id: string, deleteConfig: boolean): Promise<void> {
        // The /tmp cache does not carry the version in its name: unless it is deleted here,
        // reinstalling will serve the previous installation's js as long as the pod stays alive.
        dropCachedExtensionFiles('webhook', id)
        this.instances.delete(id)
        this.registeredWebhooks.delete(id)
        this.installedIds = this.installedIds.filter(i => i !== id)

        const index = (await this.configMaps.read('kwirth-webhooks-index', []) as IWebhookMeta[]) || []
        // re-read inside the lock: a removal must not write back a list that predates somebody else's install
        await updateIndex<IWebhookMeta>('kwirth-webhooks-index',
            async () => (await this.configMaps.read('kwirth-webhooks-index', []) as IWebhookMeta[]) || [],
            async (list) => { await this.configMaps.write('kwirth-webhooks-index', list) },
            (list) => list.filter(w => w.id !== id))
        await this.configMaps.write(`kwirth-webhook-${id}-meta`, null)
        await this.configMaps.write(`kwirth-webhook-${id}-back`, null)
        await this.configMaps.write(`kwirth-webhook-${id}-front`, null)
        // Out of memory always; out of storage — configuration AND tokens — only when asked to.
        // A kept token resolves to nothing meanwhile: there is no configuration for it to point at.
        if (deleteConfig) {
            // by the token registry and not by the loaded configs: every token of this webhook goes
            for (const key of Array.from(this.tokenByConfig.keys())) {
                const [webhookId, configName] = this.splitKey(key)
                if (webhookId === id) this.evictToken(webhookId, configName)
            }
            await this.extensionConfigs.delete(EExtensionType.WEBHOOK, id)
            await this.persistTokens()
        }
        this.configStore.delete(id)
        this.commonFieldStore.delete(id)
        this.installedMetas.delete(id)

        for (const suffix of ['back.js', 'front.js']) {
            const cacheFile = path.join(os.tmpdir(), `kwirth-webhook-${id}-${suffix}`)
            if (fs.existsSync(cacheFile)) fs.rmSync(cacheFile)
        }

        logInfo(ELogComponent.CORE, `Webhook '${id}' uninstalled`)
    }

    async listInstalled(): Promise<Array<IWebhookMeta & { configNames: string[] }>> {
        const stored = (await this.configMaps.read('kwirth-webhooks-index', [])) as IWebhookMeta[] || []
        const devMetas = Array.from(this.devWebhooks.entries()).map(([id, dev]) => {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(dev.distPath, 'package.json'), 'utf-8'))
                return { ...dev.meta, name: pkg.name ?? id, displayName: pkg.displayName, version: pkg.version ?? 'dev', description: pkg.description ?? '', website: pkg.website, tags: extensionTagsOf(pkg.tags), requiresExtension: normalizeRequires(pkg.requiresExtension) }
            } catch {
                return dev.meta
            }
        })
        // A dev webhook REPLACES the installed one with its same id, it does not add to it: without the
        // filter it comes out duplicated in '/core/webhooks' and in the manager. The same pattern as
        // plugin, theme and login.
        const devIds = new Set(devMetas.map(m => m.id))
        return [...stored.filter(m => !devIds.has(m.id)), ...devMetas].map(meta => ({
            ...meta,
            configNames: Array.from(this.configStore.get(meta.id)?.values() ?? []).map(c => c.name),
            hasFront: this.hasFront(meta.id),
        }))
    }

    private async fetchJsFromSource(meta: IWebhookMeta): Promise<string | undefined> {
        const cacheFile = cachedExtensionFile('webhook', meta.id, 'back.js')
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') {
            logError(ELogComponent.CORE, `Webhook '${meta.id}' back.js not stored and has no remote source`)
            return undefined
        }
        const tmpTgz = uniqueTempPath(`kwirth-webhook-${meta.id}-src`, '.tgz')
        const tmpDir = uniqueTempPath(`kwirth-webhook-${meta.id}-src`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await downloadFile(meta.installedFrom, tmpTgz, await packageHeaders(meta.installedFrom))
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            const content = readTarballFile(tmpDir, 'back.js')
            if (!content) throw new Error(`no back.js inside the package downloaded from ${meta.installedFrom}`)
            fs.writeFileSync(cacheFile, content)
            logInfo(ELogComponent.CORE, `Webhook '${meta.id}' back.js fetched from source and cached`)
            return content
        } catch (err) {
            logError(ELogComponent.CORE, `Webhook '${meta.id}' failed to fetch back.js from source: ${err}`)
            return undefined
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    // ── Instances ─────────────────────────────────────────────────────────────

    /** Every webhook instance alive right now: what the core wires up to the providers they consume. */
    listInstances(): IWebhook[] { return [...this.instances.values()] }

    /*
        Told by the core once it can wire an instance to the providers it consumes. A webhook gets its
        instance when its first configuration is added, which may be long after startup. Set by the core;
        undefined until the providers are ready.
    */
    onInstanceStarted?: (instance: IWebhook) => void

    getWebhook(id: string): IWebhook | undefined {
        if (this.instances.has(id)) return this.instances.get(id)
        const Ctor = this.registeredWebhooks.get(id)
        if (!Ctor) return undefined
        const instance = new Ctor()
        instance.startWebhook?.(this).catch(err => logError(ELogComponent.CORE, `Webhook '${id}' startWebhook error: ${err}`))
        this.instances.set(id, instance)
        this.onInstanceStarted?.(instance)
        return instance
    }

    // ── Token registry ──────────────────────────────────────────────────────────

    private configKey(webhookId: string, configName: string): string {
        return `${webhookId}:${configName}`
    }

    private splitKey(key: string): [string, string] {
        const idx = key.indexOf(':')
        return [key.slice(0, idx), key.slice(idx + 1)]
    }

    private ensureToken(webhookId: string, configName: string): string {
        const key = this.configKey(webhookId, configName)
        const existing = this.tokenByConfig.get(key)
        if (existing) return existing
        const token = crypto.randomBytes(24).toString('base64url')
        this.tokenByConfig.set(key, token)
        this.configByToken.set(token, { webhookId, configName })
        return token
    }

    private evictToken(webhookId: string, configName: string): void {
        const key = this.configKey(webhookId, configName)
        const token = this.tokenByConfig.get(key)
        if (token) this.configByToken.delete(token)
        this.tokenByConfig.delete(key)
    }

    // Awaited, like the configuration: a token that is not stored is a URL that dies on the next restart.
    private async persistTokens(): Promise<void> {
        const data: Record<string, string> = {}
        for (const [key, token] of this.tokenByConfig) data[key] = token
        await this.configMaps.write('kwirth-webhook-tokens', data)
    }

    /*
        Resolves an incoming token → webhook/config. Undefined when the token does not exist. The config
        comes with the webhook's COMMON fields under it, as the artifact received it in addConfig: verify()
        reads the secret from there.
    */
    resolve(token: string): IWebhookResolution | undefined {
        const ref = this.configByToken.get(token)
        if (!ref) return undefined
        const config = this.getConfig(ref.webhookId, ref.configName)
        if (!config) return undefined
        const base = this.commonFieldStore.get(ref.webhookId) ?? {}
        return { webhookId: ref.webhookId, configName: ref.configName, config: { ...base, ...config } as IWebhookConfig }
    }

    // ── IWebhookAccess (inyectado en consumidores) ────────────────────────────────

    // A subscription by strict pair (webhookId, configName): you receive ONLY THAT config's events.
    // Webhooks are general to Kwirth (several configs/consumers of the same type) → every consumer pins
    // its own instance.
    subscribe(webhookId: string, configName: string, consumer: IWebhookConsumer): void {
        const key = this.configKey(webhookId, configName)
        if (!this.subscribers.has(key)) this.subscribers.set(key, new Set())
        this.subscribers.get(key)!.add(consumer)
    }

    unsubscribe(webhookId: string, configName: string, consumer: IWebhookConsumer): void {
        this.subscribers.get(this.configKey(webhookId, configName))?.delete(consumer)
    }

    // Delivers a verified and parsed event to the consumers subscribed to THAT config (the pair webhookId+configName).
    deliver(webhookId: string, configName: string, event: IWebhookEvent): void {
        const consumers = this.subscribers.get(this.configKey(webhookId, configName))
        if (!consumers || consumers.size === 0) {
            logWarning(ELogComponent.CORE, `Webhook '${webhookId}' config '${configName}' event has no subscribers — dropped`)
            return
        }
        for (const consumer of consumers) {
            try { consumer.processWebhookEvent(event) } catch (err) {
                logError(ELogComponent.CORE, `Webhook '${webhookId}' consumer threw: ${err}`)
            }
        }
    }

    // Lists the INSTALLED webhooks (npm + dev), with their configs from the configStore (the
    // authoritative source) — NOT from `instances`, which are populated lazily (a webhook with no
    // callbacks is not instantiated yet and would not show up).
    listWebhooks(): Array<{ id: string; configNames: string[] }> {
        const ids = new Set<string>([...this.installedIds, ...this.devWebhooks.keys(), ...this.configStore.keys()])
        return Array.from(ids).map(id => ({
            id,
            configNames: Array.from(this.configStore.get(id)?.values() ?? []).map(c => c.name),
        }))
    }

    getUrl(webhookId: string, configName: string): string | undefined {
        const token = this.tokenByConfig.get(this.configKey(webhookId, configName))
        if (!token) return undefined
        return `${this.urlBase}/${webhookId}/${token}`
    }

    /** A new token (a new URL), awaited until it is stored: the API's. */
    async rotateTokenAndSave(webhookId: string, configName: string): Promise<string> {
        this.evictToken(webhookId, configName)
        const token = this.ensureToken(webhookId, configName)
        await this.persistTokens()
        return token
    }

    // IWebhookAccess.rotateToken: the PUBLISHED contract is synchronous, so the write runs on its own and
    // a failure of it is logged. The core's own callers use rotateTokenAndSave.
    rotateToken(webhookId: string, configName: string): string {
        this.evictToken(webhookId, configName)
        const token = this.ensureToken(webhookId, configName)
        this.persistTokens().catch((err: unknown) => logError(ELogComponent.CORE, `Failed to persist webhook tokens: ${err}`))
        return token
    }

    // ── Config management ─────────────────────────────────────────────────────────

    private addConfigInternal(webhookId: string, config: IWebhookConfig): boolean {
        const webhook = this.getWebhook(webhookId)
        if (!webhook) {
            logError(ELogComponent.CORE, `Webhook '${webhookId}' not found — cannot add config '${config.name}'`)
            return false
        }
        const alreadyExists = this.configStore.has(webhookId) && this.configStore.get(webhookId)!.has(config.name)
        // the artifact receives each configuration with the common base under it, as senders do
        const base = this.commonFieldStore.get(webhookId) ?? {}
        webhook.addConfig({ ...base, ...config } as IWebhookConfig)
        if (!this.configStore.has(webhookId)) this.configStore.set(webhookId, new Map())
        this.configStore.get(webhookId)!.set(config.name, { ...config })
        this.ensureToken(webhookId, config.name)
        if (!alreadyExists) logInfo(ELogComponent.CORE, `Webhook '${webhookId}' config '${config.name}' registered`)
        return true
    }

    /*
        🔴 The document is WRITTEN FIRST and memory changed after, always awaited. It used to be the
        other way round and fire-and-forget — and only `configs` was written, so the common fields the
        front sent were lost on every restart.
    */
    private async persist(webhookId: string, common: Record<string, unknown>, configs: IWebhookConfig[]): Promise<void> {
        // Nothing left —no base, no configuration— is no configuration: the Secret goes instead of
        // staying behind empty, so deleting what one created leaves the cluster as it was.
        if (configs.length === 0 && Object.keys(common).length === 0) {
            await this.extensionConfigs.delete(EExtensionType.WEBHOOK, webhookId)
            return
        }
        const data: IWebhookStoredConfig = { ...common, configs }
        await this.extensionConfigs.write(EExtensionType.WEBHOOK, webhookId, data)
    }

    private warnUnvalidated(webhookId: string): void {
        logWarning(ELogComponent.CORE, `Configuration of webhook '${webhookId}' saved without validation: its schema is not available`)
    }

    /**
     * Creates or replaces (by name) one configuration; a new one gets its token. What does not fit the
     * webhook's schema is returned and nothing is saved. Not registered, or a failed write, is THROWN.
     */
    async saveConfig(webhookId: string, config: IWebhookConfig): Promise<IConfigValidationError[]> {
        if (!this.getWebhook(webhookId)) throw new Error(`Webhook '${webhookId}' is not registered`)
        const schema = this.getSchema(webhookId)
        const limpia = pruneNamedConfig(schema, config) as IWebhookConfig
        const errors = validateNamedConfig(schema, limpia)
        if (errors.length > 0) return errors
        if (schema.length === 0) this.warnUnvalidated(webhookId)
        const next = new Map(this.configStore.get(webhookId) ?? [])
        next.set(limpia.name, limpia)
        await this.persist(webhookId, this.commonFieldStore.get(webhookId) ?? {}, [...next.values()])
        this.addConfigInternal(webhookId, limpia)
        await this.persistTokens()
        return []
    }

    async removeConfig(webhookId: string, configName: string): Promise<boolean> {
        const webhook = this.getWebhook(webhookId)
        if (!webhook) return false
        const next = new Map(this.configStore.get(webhookId) ?? [])
        next.delete(configName)
        await this.persist(webhookId, this.commonFieldStore.get(webhookId) ?? {}, [...next.values()])
        webhook.removeConfig(configName)
        this.configStore.get(webhookId)?.delete(configName)
        this.evictToken(webhookId, configName)
        await this.persistTokens()
        return true
    }

    getWebhookStoredConfig(webhookId: string): IWebhookStoredConfig {
        const common = this.commonFieldStore.get(webhookId) ?? {}
        const configs = Array.from(this.configStore.get(webhookId)?.values() ?? [])
        return { ...common, configs }
    }

    /**
     * Replaces the WHOLE document: the common base and every configuration, validated as a whole.
     * The configurations that stay KEEP their token — saving the base must not change every URL; only the
     * ones that leave lose it. Not registered, or a failed write, is THROWN.
     */
    async setWebhookStoredConfig(webhookId: string, data: IWebhookStoredConfig): Promise<IConfigValidationError[]> {
        const webhook = this.getWebhook(webhookId)
        if (!webhook) throw new Error(`Webhook '${webhookId}' is not registered`)
        const schema = this.getSchema(webhookId)
        const { configs, ...rawCommon } = data
        const common = pruneCommon(schema, rawCommon)
        const limpias = configs.map(c => pruneNamedConfig(schema, c) as IWebhookConfig)
        const errors = validateNamedStored(schema, common, limpias)
        if (errors.length > 0) return errors
        if (schema.length === 0) this.warnUnvalidated(webhookId)
        await this.persist(webhookId, common, limpias)

        // the base changes what every configuration receives, so all of them are handed over again
        const quedan = new Set(limpias.map(c => c.name))
        this.commonFieldStore.set(webhookId, common)
        for (const name of Array.from(this.configStore.get(webhookId)?.keys() ?? [])) {
            webhook.removeConfig(name)
            if (!quedan.has(name)) this.evictToken(webhookId, name)
        }
        this.configStore.delete(webhookId)
        for (const config of limpias) this.addConfigInternal(webhookId, config)
        await this.persistTokens()
        return []
    }

    getSchema(webhookId: string): IWebhookFieldDef[] {
        const webhook = this.getWebhook(webhookId)
        return webhook?.getConfigSchema?.() ?? []
    }

    getConfigs(webhookId: string): IWebhookConfig[] {
        return Array.from(this.configStore.get(webhookId)?.values() ?? [])
    }

    getConfig(webhookId: string, configName: string): IWebhookConfig | undefined {
        return this.configStore.get(webhookId)?.get(configName)
    }

    exportAll(): Record<string, IWebhookConfig[]> {
        const result: Record<string, IWebhookConfig[]> = {}
        for (const [id, configs] of this.configStore) {
            result[id] = Array.from(configs.values())
        }
        return result
    }

    async stopAll(): Promise<void> {
        for (const [id, instance] of this.instances) {
            try { await instance.stopWebhook?.() } catch (err) {
                logError(ELogComponent.CORE, `Webhook '${id}' stopWebhook error: ${err}`)
            }
        }
        this.instances.clear()
    }

    // ── Utilities ───────────────────────────────────────────────────────────────
}
