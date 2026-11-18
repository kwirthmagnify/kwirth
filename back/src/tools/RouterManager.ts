import { EExtensionType, IExtensionScope, IRouterData, versionGreaterThan } from '@kwirthmagnify/kwirth-common'
import { IConfigFieldDef, IConfigValidationError } from '@kwirthmagnify/kwirth-common'
import { IExtensionRequirement, IRouter, IRouterContext, IRouterStatus, TRouterConfig, TRouterConstructor } from '@kwirthmagnify/kwirth-common-back'
import { IConfigMaps } from './IConfigMap'
import { ExtensionConfigStore } from './ExtensionConfigStore'
import { ELogComponent, logError, logInfo } from './Logging'
import { assertExtensionRequirements, normalizeRequires } from './ExtensionDeps'
import { assertInstallable } from './ExtensionInstallGuard'
import { downloadFile, packageHeaders, readTarballFile } from './PackageRegistries'
import { listBundledOfType, peekBundledMeta } from './BundledExtensions'
import { updateIndex } from './IndexLock'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'

/*
    Manager of the `router` extension type (plan: plans/router-extension/PLAN.md, S2).

    A router carries the core's traffic to a cluster with no direct path. Unlike a provider, the core
    OWNS its instance: one per router, created when it is loaded, started with its saved config, stopped
    when it is updated or uninstalled. That is what lets a router come and go WITHOUT a restart: the
    dispatcher (S3) asks this manager for the live instance on every request, so nothing is ever mounted
    in Express for a particular router.

    Its config lives in the common ExtensionConfigStore (plans/extension-config): a SECRET,
    kwirth-router-<id>-config, completed with the schema's defaults when read and validated against the
    live router's schema when saved. The core returns it real to whoever may configure it, and the front
    shows the secret fields masked, with the eye.

    A router's failures stay its own: the instance that cannot be created or started is left FAILED with
    the cause (shown in the Routers manager), and the core goes on.
*/

// What the core keeps of an installed router (the index entry, and what /core/routers lists)
export interface IRouterMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    backStored?: boolean
    requiresRestart: boolean                // always false: routers come and go without a restart (PRD D6)
    requiresExtension?: IExtensionRequirement[]
}

// A router as the core holds it right now
interface ILiveRouter {
    instance?: IRouter                      // created and started
    error?: string                          // why it is not (it could not be loaded, created or started)
}

interface IDevRouter {
    distPath: string
    meta: IRouterMeta
}

interface IStoredCode {
    code: string
    compressed: boolean
}

const CONFIGMAP_SIZE_LIMIT = 800 * 1024
const INDEX_KEY = 'kwirth-routers-index'

export class RouterManager {
    private cachedIndex: IRouterMeta[] = []
    private devRouters = new Map<string, IDevRouter>()
    private live = new Map<string, ILiveRouter>()
    /*
        PLUTERS: plugins that are also routers (PRD R8). Their channel instance IS the router, under its channel id.
        Their lifecycle is the CHANNEL's (startChannel / cleanup): the core does not call startRouter,
        applyConfig or stopRouter on them, and their configuration and scopes are the plugin's own.
    */
    private pluters = new Map<string, IRouter>()
    private changed: () => void = () => {}

    /*
        contextFor: what the core gives a router when it creates it (who this Kwirth is, its loopback url,
        a logger with the ROUTER component). A function: the cluster uid may not be known at construction.
    */
    constructor(private configMaps: IConfigMaps, private configStore: ExtensionConfigStore, private contextFor: (id: string) => IRouterContext) {}

    async init(): Promise<void> {
        this.cachedIndex = (await this.configMaps.read(INDEX_KEY, []) as IRouterMeta[]) || []
    }

    // Called whenever the set of live routers changes (the core re-announces KwirthData.routers)
    setOnChange(changed: () => void): void {
        this.changed = changed
    }

    // ── What the rest of the core asks ──────────────────────────────────────────

    // The live router with this id, or undefined (not installed, failed, or being replaced). The dispatcher asks on every request.
    router(id: string): IRouter | undefined {
        return this.live.get(id)?.instance ?? this.pluters.get(id)
    }

    /*
        A plugin channel that is also a router, registered (or replaced) under its channel id. Refused, saying
        why, when it declares another id — its traffic would arrive where nobody serves it — or when an
        installed router already has that id.
    */
    adoptPluter(id: string, router: IRouter): boolean {
        let declared: string
        try {
            declared = router.getRouterData().id
        }
        catch (err) {
            logError(ELogComponent.ROUTER, `Plugin '${id}' is a router but its getRouterData failed: ${err} — not registered`)
            return false
        }
        if (declared !== id) {
            logError(ELogComponent.ROUTER, `Plugin '${id}' is a router but declares the id '${declared}': a pluter's router id must be its channel id — not registered`)
            return false
        }
        if (this.live.has(id)) {
            logError(ELogComponent.ROUTER, `Plugin '${id}' is a router, but an installed router already has the id '${id}' — the plugin is not registered as a router`)
            return false
        }
        const replaced = this.pluters.has(id)
        this.pluters.set(id, router)
        logInfo(ELogComponent.ROUTER, `Plugin '${id}' is also a router (a pluter): ${replaced ? 'replaced' : 'registered'}`)
        this.changed()
        return true
    }

    // The plugin was uninstalled, or its new code is no longer a router
    dropPluter(id: string): void {
        if (!this.pluters.delete(id)) return
        logInfo(ELogComponent.ROUTER, `Plugin '${id}' is no longer a router`)
        this.changed()
    }

    isPluter(id: string): boolean {
        return this.pluters.has(id)
    }

    // What the core announces in KwirthData.routers: the routers that are up, pluters included
    routerData(): IRouterData[] {
        const out: IRouterData[] = []
        const add = (id: string, router: IRouter) => {
            try {
                out.push(router.getRouterData())
            }
            catch (err) {
                logError(ELogComponent.ROUTER, `Router '${id}' getRouterData failed: ${err}`)
            }
        }
        for (const [id, live] of this.live) if (live.instance) add(id, live.instance)
        for (const [id, router] of this.pluters) add(id, router)
        return out
    }

    // The scopes every router declares, for the security editor
    scopeCatalog(): IExtensionScope[] {
        const out: IExtensionScope[] = []
        for (const [id, live] of this.live) {
            try {
                out.push(...(live.instance?.getScopeCatalog?.() ?? []))
            }
            catch (err) {
                logError(ELogComponent.ROUTER, `Router '${id}' getScopeCatalog failed: ${err}`)
            }
        }
        return out
    }

    async listInstalled(): Promise<IRouterMeta[]> {
        const stored = (await this.configMaps.read(INDEX_KEY, []) as IRouterMeta[]) || []
        const devMetas = [...this.devRouters.values()].map(d => d.meta)
        const devIds = new Set(devMetas.map(m => m.id))
        // a dev router REPLACES the installed one with its id, as for every other type
        return [...stored.filter(m => !devIds.has(m.id)), ...devMetas]
    }

    isDevRouter(id: string): boolean {
        return this.devRouters.has(id)
    }

    // What the Routers manager shows of one router
    status(id: string): IRouterStatus {
        const live = this.live.get(id)
        if (!live) return { started: false, lastError: 'not loaded' }
        if (!live.instance) return { started: false, lastError: live.error }
        try {
            return live.instance.getStatus?.() ?? { started: true }
        }
        catch (err) {
            return { started: true, lastError: `getStatus failed: ${err}` }
        }
    }

    getSchema(id: string): IConfigFieldDef[] {
        return this.schemaOf(id, this.live.get(id)?.instance)
    }

    // The fields an instance declares; a router whose getConfigSchema throws declares none.
    private schemaOf(id: string, instance: IRouter | undefined): IConfigFieldDef[] {
        try {
            return instance?.getConfigSchema() ?? []
        }
        catch (err) {
            logError(ELogComponent.ROUTER, `Router '${id}' getConfigSchema failed: ${err}`)
            return []
        }
    }

    // ── Config (the common ExtensionConfigStore: a Secret, returned REAL, the front masks it) ──

    // The current values: what is saved, completed with the schema's defaults.
    async getConfig(id: string): Promise<TRouterConfig> {
        return this.configStore.readSimple(EExtensionType.ROUTER, id, this.getSchema(id))
    }

    /*
        Validates it against the live router's schema and, when it fits, saves it and applies it NOW to the
        live router. What does not fit comes back as errors and nothing is saved. Throws what the router
        throws when applying, for the dialog to say it.
    */
    async saveConfig(id: string, config: TRouterConfig): Promise<IConfigValidationError[]> {
        const errors = await this.configStore.writeSimple(EExtensionType.ROUTER, id, this.getSchema(id), config)
        if (errors.length > 0) return errors
        const instance = this.live.get(id)?.instance
        if (instance) {
            await instance.applyConfig(await this.getConfig(id))
            logInfo(ELogComponent.ROUTER, `Router '${id}' config saved and applied`)
        }
        return []
    }

    // ── Loading ─────────────────────────────────────────────────────────────────

    /*
        Creates the router from its code and starts it with its saved config, replacing (and stopping) the
        previous instance. The live entry says the outcome: the instance, or why there is none.
    */
    private async activate(id: string, load: () => unknown): Promise<void> {
        await this.deactivate(id)
        let instance: IRouter | undefined
        try {
            const mod = load() as Record<string, unknown>
            const ctor = (mod['default'] ?? Object.values(mod).find(v => typeof v === 'function')) as TRouterConstructor | undefined
            if (typeof ctor !== 'function') throw new Error('back.js exports no router class')
            instance = new ctor(this.contextFor(id))
            const declared = instance.getRouterData().id
            if (declared !== id) throw new Error(`it declares the id '${declared}', but it is installed as '${id}'`)
            // Not this.getConfig(id): the instance is not live yet, so its schema is asked to it directly.
            await instance.startRouter(await this.configStore.readSimple(EExtensionType.ROUTER, id, this.schemaOf(id, instance)))
            this.live.set(id, { instance })
            logInfo(ELogComponent.ROUTER, `Router '${id}' started`)
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err)
            this.live.set(id, { error })
            logError(ELogComponent.ROUTER, `Router '${id}' could not be started: ${error}`)
            // one that was created and then failed to start may have opened something: it is told to stop
            if (instance) await instance.stopRouter().catch(() => { /* already reported */ })
        }
        this.changed()
    }

    // Takes it out of the table FIRST (no new traffic reaches it), then stops it
    private async deactivate(id: string): Promise<void> {
        const previous = this.live.get(id)?.instance
        if (this.live.delete(id)) this.changed()
        if (!previous) return
        try {
            await previous.stopRouter()
            logInfo(ELogComponent.ROUTER, `Router '${id}' stopped`)
        }
        catch (err) {
            logError(ELogComponent.ROUTER, `Router '${id}' failed to stop: ${err}`)
        }
    }

    // An installed router's code is required from a file in the tmpdir, so its frames carry its name (FailureOrigin)
    private requireFromTmp(id: string, backJs: string): unknown {
        const tmpPath = path.join(os.tmpdir(), `kwirth-router-${id}-back.js`)
        fs.writeFileSync(tmpPath, backJs)
        const resolved = require.resolve(tmpPath)
        if (require.cache[resolved]) delete require.cache[resolved]
        return require(tmpPath)
    }

    private async readStoredBack(meta: IRouterMeta): Promise<string | undefined> {
        if (meta.backStored === false) return this.fetchBackFromSource(meta)
        const data = await this.configMaps.read(`kwirth-router-${meta.id}-back`) as IStoredCode | undefined
        if (!data?.code) return undefined
        return data.compressed ? zlib.gunzipSync(Buffer.from(data.code, 'base64')).toString('utf-8') : data.code
    }

    private async fetchBackFromSource(meta: IRouterMeta): Promise<string | undefined> {
        if (!meta.installedFrom || meta.installedFrom === 'local' || meta.installedFrom === 'dev') return undefined
        const tmpTgz = path.join(os.tmpdir(), `kwirth-router-src-${meta.id}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-router-src-${meta.id}`)
        try {
            await downloadFile(meta.installedFrom, tmpTgz, await packageHeaders(meta.installedFrom))
            fs.mkdirSync(tmpDir, { recursive: true })
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            return readTarballFile(tmpDir, 'back.js')
        }
        catch (err) {
            logError(ELogComponent.ROUTER, `Could not fetch router '${meta.id}' back.js from source: ${err}`)
            return undefined
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    // At startup: every installed router (dev ones come from loadDevRouters)
    async loadAll(): Promise<void> {
        for (const meta of this.cachedIndex) {
            if (meta.installedFrom === 'dev') continue
            try {
                const backJs = await this.readStoredBack(meta)
                if (!backJs) {
                    this.live.set(meta.id, { error: 'its code could not be read' })
                    logError(ELogComponent.ROUTER, `Router '${meta.id}' has no back.js to load — skipping`)
                    continue
                }
                await this.activate(meta.id, () => this.requireFromTmp(meta.id, backJs))
            }
            catch (err) {
                logError(ELogComponent.ROUTER, `Failed to load router '${meta.id}': ${err}`)
            }
        }
    }

    // The core is stopping: every router closes what it opened
    async stopAll(): Promise<void> {
        for (const id of [...this.live.keys()]) await this.deactivate(id)
    }

    // ── Installation ────────────────────────────────────────────────────────────

    async install(tarGzUrl: string, installedFrom?: string, marketplaceId?: string, marketplaceLabel?: string, upgrade?: boolean): Promise<IRouterMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-router-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-router-extract-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        const isLocalPath = tarGzUrl.startsWith('file://') || (!tarGzUrl.startsWith('http://') && !tarGzUrl.startsWith('https://'))
        try {
            if (isLocalPath) {
                const localPath = tarGzUrl.startsWith('file://') ? new URL(tarGzUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1') : tarGzUrl
                fs.copyFileSync(localPath, tmpTgz)
            }
            else {
                await downloadFile(tarGzUrl, tmpTgz, await packageHeaders(tarGzUrl))
            }
            await tar.x({ file: tmpTgz, cwd: tmpDir })

            let metaPath = path.join(tmpDir, 'package.json')
            let backPath = path.join(tmpDir, 'back.js')
            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) {
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                backPath = path.join(tmpDir, 'back.js')
                if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) throw new Error('Invalid router bundle: missing package.json or back.js')
            }
            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            // another type's package is refused by name, instead of failing later with a confusing message
            if (pkg.extensionType && pkg.extensionType !== EExtensionType.ROUTER) throw new Error(`Not a router package: its extensionType is '${pkg.extensionType}'`)
            const meta: IRouterMeta = {
                id: pkg.id ?? String(pkg.name ?? '').split('/').pop(),
                name: pkg.name,
                displayName: pkg.displayName,
                version: pkg.version,
                description: pkg.description ?? '',
                website: pkg.website,
                installedFrom: installedFrom ?? tarGzUrl,
                marketplaceId,
                marketplaceLabel,
                requiresRestart: false,
                requiresExtension: normalizeRequires(pkg.requiresExtension)
            }
            if (!meta.id) throw new Error('Invalid router bundle: package.json has no id')
            await assertExtensionRequirements('Router', meta.id, meta.requiresExtension, installedFrom)

            const index = (await this.configMaps.read(INDEX_KEY, []) as IRouterMeta[]) || []
            const existing = index.find(m => m.id === meta.id)
            if (installedFrom !== 'bundled') {
                const installed = existing ?? (this.live.has(meta.id) || this.devRouters.has(meta.id) ? {} : undefined)
                assertInstallable('Router', meta.id, installed, meta.version, upgrade)
            }

            const backJs = fs.readFileSync(backPath, 'utf-8')
            const compressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = compressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored) logInfo(ELogComponent.ROUTER, `Router '${meta.id}' back.js exceeds configmap limit — will fetch from source on startup`)
            await this.configMaps.write(`kwirth-router-${meta.id}-back`, meta.backStored ? { code: compressed, compressed: true } : null)
            await this.configMaps.write(`kwirth-router-${meta.id}-meta`, meta)
            // re-read inside the lock: another install may have added its entry meanwhile (IndexLock.ts)
            await updateIndex<IRouterMeta>(INDEX_KEY,
                async () => (await this.configMaps.read(INDEX_KEY, []) as IRouterMeta[]) || [],
                async (list) => { await this.configMaps.write(INDEX_KEY, list) },
                (list) => {
                    const at = list.findIndex(e => e.id === meta.id)
                    if (at >= 0) list[at] = meta
                    else list.push(meta)
                    return list
                })
            this.cachedIndex = (await this.configMaps.read(INDEX_KEY, []) as IRouterMeta[]) || []

            // hot: the previous version is stopped and this one started, now
            await this.activate(meta.id, () => this.requireFromTmp(meta.id, backJs))
            logInfo(ELogComponent.ROUTER, `Router '${meta.id}' v${meta.version} ${existing ? 'updated' : 'installed'}`)
            return meta
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IRouterMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-router-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(id: string): Promise<void> {
        if (this.isDevRouter(id)) throw new Error(`Router '${id}' is a dev router and cannot be uninstalled`)
        const meta = this.cachedIndex.find(m => m.id === id)
        if (meta?.installedFrom?.startsWith('pack:')) throw new Error(`Router '${id}' was installed by pack '${meta.installedFrom.slice(5)}' — uninstall the pack instead`)
        await this.doUninstall(id)
    }

    async uninstallFromPack(id: string): Promise<void> {
        await this.doUninstall(id)
    }

    private async doUninstall(id: string): Promise<void> {
        await this.deactivate(id)
        await this.configMaps.write(`kwirth-router-${id}-meta`, null)
        await this.configMaps.write(`kwirth-router-${id}-back`, null)
        await this.configStore.delete(EExtensionType.ROUTER, id)
        await updateIndex<IRouterMeta>(INDEX_KEY,
            async () => (await this.configMaps.read(INDEX_KEY, []) as IRouterMeta[]) || [],
            async (list) => { await this.configMaps.write(INDEX_KEY, list) },
            (list) => list.filter(m => m.id !== id))
        this.cachedIndex = this.cachedIndex.filter(m => m.id !== id)
        const tmpPath = path.join(os.tmpdir(), `kwirth-router-${id}-back.js`)
        if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath)
        logInfo(ELogComponent.ROUTER, `Router '${id}' uninstalled`)
    }

    // What an image or the desktop brings: only forwards (a newer version), as for the other types
    async installBundled(dir: string): Promise<void> {
        for (const filePath of await listBundledOfType(dir, EExtensionType.ROUTER)) {
            const file = path.basename(filePath)
            const bundled = await peekBundledMeta(filePath)
            const existing = bundled.id ? this.cachedIndex.find(m => m.id === bundled.id) : undefined
            if (existing && (!bundled.version || !existing.version || !versionGreaterThan(bundled.version, existing.version))) {
                logInfo(ELogComponent.ROUTER, `Bundled router '${bundled.id}' v${bundled.version ?? '?'} is not newer than the installed v${existing.version ?? '?'} — skipping`)
                continue
            }
            try {
                const meta = await this.install(filePath, 'bundled', undefined, undefined, existing !== undefined)
                logInfo(ELogComponent.ROUTER, `Bundled router '${meta.id}' v${meta.version} ${existing ? `updated from v${existing.version}` : 'installed'}`)
            }
            catch (err) {
                logError(ELogComponent.ROUTER, `Failed to install bundled router '${file}': ${err}`)
            }
        }
    }

    // ── Dev (kwirth-dev.json "routers": { "<id>": "<path to its dist>" }) ─────────

    loadDevRouters(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        let entries: [string, unknown][] = []
        try {
            entries = Object.entries(JSON.parse(fs.readFileSync(devConfigPath, 'utf-8')).routers ?? {})
        }
        catch (err) {
            logError(ELogComponent.ROUTER, `Failed to load kwirth-dev.json (routers): ${err}`)
            return
        }
        for (const [id, distPath] of entries) {
            if (typeof distPath === 'string') this.registerDevRouter(id, distPath)
        }
    }

    private registerDevRouter(id: string, distPath: string): void {
        const absPath = path.resolve(process.cwd(), distPath)
        const backPath = path.join(absPath, 'back.js')
        const meta: IRouterMeta = { id, name: id, version: 'dev', description: 'dev router', installedFrom: 'dev', requiresRestart: false }
        try {
            const pkg = JSON.parse(fs.readFileSync(path.join(absPath, 'package.json'), 'utf-8'))
            meta.name = pkg.name ?? id
            meta.displayName = pkg.displayName
            meta.version = pkg.version ?? 'dev'
            meta.description = pkg.description ?? ''
            meta.website = pkg.website
            meta.requiresExtension = normalizeRequires(pkg.requiresExtension)
        }
        catch { /* the meta stays minimal */ }
        this.devRouters.set(id, { distPath: absPath, meta })
        const load = () => {
            const resolved = require.resolve(backPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            return require(backPath)
        }
        void this.activate(id, load)
        // mtimeMs 0 = the file is not there right now (a clean build): ignored
        fs.watchFile(backPath, { persistent: false, interval: 500 }, (curr, prev) => {
            if (curr.mtimeMs !== prev.mtimeMs && curr.mtimeMs !== 0) {
                logInfo(ELogComponent.ROUTER, `[dev] Router '${id}' back.js changed — hot-reloading`)
                void this.activate(id, load)
            }
        })
        logInfo(ELogComponent.ROUTER, `[dev] Router '${id}' registered from ${absPath}`)
    }
}
