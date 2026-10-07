import { IAiToolset, registerToolset, unregisterToolset, isBuiltInToolsetId, getToolset, setToolsetGrants, getToolsetGrants } from '@kwirthmagnify/kwirth-common-ai/back'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'
import { assertInstallable } from './ExtensionInstallGuard'
import { assertExtensionRequirements, normalizeRequires } from './ExtensionDeps'
import { downloadFile, packageHeaders, readTarballFile } from './PackageRegistries'
import { listBundledOfType } from './BundledExtensions'
import { EExtensionType, IExtensionRequirement } from '@kwirthmagnify/kwirth-common'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'

// Manager of the `aitoolset` extension type (plan: plans/ai-tools/PLAN.md, S1).
//
// An aitoolset is back end ONLY: a back.js exporting a toolset's definition. It has no front end of its
// own — the selector and the configuration dialog belong to the core and are shared by all of them — so
// there is nothing here of the front.js that plugins, providers, senders and webhooks do handle.

export interface IAiToolsetMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    // Which marketplace it came from. It is STORED on install, not deduced: the tarball's url points at
    // the package registry, which is another server, and with precedence by id two marketplaces can serve the same
    // id. Ausente = no vino de ningun marketplace (dev, fichero o url suelta).
    marketplaceId?: string
    marketplaceLabel?: string
    backStored?: boolean
    requiresRestart?: boolean
    requiresExtension?: IExtensionRequirement[]
}

const CONFIGMAP_SIZE_LIMIT = 800 * 1024
const INDEX_KEY = 'kwirth-aitoolsets-index'

/*
    Which plugins each toolset has been granted to (plan: "El techo en dos fases", phase 1).

    It is stored in the CORE and not in the plugin, the other way round from the precedence order: the
    toolset is a core extension, and the guest list is exactly what the plugin must not get to decide.

    A single ConfigMap with the whole map { toolsetId: [pluginId, ...] }: it is four lines of data, and
    keeping them together makes "who can write to the cluster through AI?" answerable in one read.
*/
const GRANTS_KEY = 'kwirth-aitoolsets-grants'

type TToolsetGrants = Record<string, string[]>

interface IDevAiToolset {
    tgzPath: string
    meta: IAiToolsetMeta
}

// What is surplus in the index when kwirth-dev.json is re-read. Only what is marked 'dev' is reconciled:
// whatever was installed from a marketplace, a url or a file stays where it is, because it is really
// installed. A pure function, exported on purpose: it is the logic that deserves a test, and testing it
// should not require bringing up a whole manager.
export const staleDevAiToolsets = (index: IAiToolsetMeta[], declared: Set<string>): IAiToolsetMeta[] =>
    index.filter(m => m.installedFrom === 'dev' && !declared.has(m.id))

export class AiToolsetManager {
    private configMaps: IConfigMaps
    private cachedIndex: IAiToolsetMeta[] = []
    private devToolsets = new Map<string, IDevAiToolset>()

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    async init(): Promise<void> {
        this.cachedIndex = (await this.configMaps.read(INDEX_KEY, []) as IAiToolsetMeta[]) || []
    }

    // ── Concesiones ─────────────────────────────────────────────────────────────

    /** The complete map, exactly as it is stored. */
    async listGrants(): Promise<TToolsetGrants> {
        return ((await this.configMaps.read(GRANTS_KEY, {})) as TToolsetGrants) || {}
    }

    /**
     * Dumps the stored grants into the registry.
     *
     * It has to be called AFTER loading the toolsets: the registry is memory, so on every startup the
     * grants have to be put back or everything would end up granted to nobody — which is safe, but what
     * the admin configured would stop working.
     */
    async applyGrants(): Promise<void> {
        const grants = await this.listGrants()
        for (const [toolsetId, plugins] of Object.entries(grants)) {
            setToolsetGrants(toolsetId, plugins)
        }
        const total = Object.values(grants).reduce((n, p) => n + p.length, 0)
        logInfo(ELogComponent.CORE, `AI toolset grants applied: ${Object.keys(grants).length} toolset(s), ${total} grant(s)`)
    }

    /**
     * Gives back to the registry the grant `unregisterToolset` takes away when REPLACING a toolset. What
     * is persisted is the truth: installation does not touch the grants ConfigMap.
     *
     * It only restores what was ALREADY stored — installing still grants nothing to nobody — and only
     * when the toolset ended up registered: an id that never got registered (the package and the module
     * say different ids) must not leave an orphaned grant behind.
     */
    private async restoreGrants(toolsetId: string): Promise<void> {
        if (!getToolset(toolsetId)) return
        const plugins = (await this.listGrants())[toolsetId]
        if (!plugins?.length) return
        setToolsetGrants(toolsetId, plugins)
        logInfo(ELogComponent.CORE, `AI toolset '${toolsetId}' grants restored after reinstall: ${plugins.join(', ')}`)
    }

    /** Grants a toolset to a list of plugins (replacing the previous one) and persists it. */
    async setGrants(toolsetId: string, pluginIds: string[]): Promise<string[]> {
        if (!getToolset(toolsetId)) throw new Error(`AI toolset '${toolsetId}' is not registered`)

        const grants = await this.listGrants()
        // An empty list is STORED as empty rather than deleting the entry: "we took it away from
        // everybody" and "it was never touched" look the same in the ConfigMap, but they do not mean the
        // same thing when auditing.
        grants[toolsetId] = [...new Set(pluginIds)]
        await this.configMaps.write(GRANTS_KEY, grants)
        setToolsetGrants(toolsetId, grants[toolsetId])

        logInfo(ELogComponent.CORE, `AI toolset '${toolsetId}' granted to: ${grants[toolsetId].join(', ') || '(nobody)'}`)
        return getToolsetGrants(toolsetId)
    }

    async listInstalled(): Promise<IAiToolsetMeta[]> {
        const stored = (await this.configMaps.read(INDEX_KEY, [])) as IAiToolsetMeta[] || []
        const devMetas = Array.from(this.devToolsets.values()).map(d => d.meta)
        const devIds = new Set(devMetas.map(m => m.id))
        return [...stored.filter(m => !devIds.has(m.id)), ...devMetas]
    }

    isDevToolset(id: string): boolean {
        return this.devToolsets.has(id)
    }

    // ── Carga ───────────────────────────────────────────────────────────────────

    /**
     * Loads a back.js and registers its toolset.
     *
     * The module only EXPORTS its definition; what registers it is this. Were the module to register
     * itself, registration would be a side effect of the import: load order would start to matter, a
     * foreign module could register whatever it liked, and on uninstalling one would have to guess what
     * it registered.
     */
    private loadBackToolset(id: string, backJs: string): boolean {
        const tmpPath = path.join(os.tmpdir(), `kwirth-aitoolset-${id}-back.js`)
        fs.writeFileSync(tmpPath, backJs)
        try {
            const resolved = require.resolve(tmpPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const mod = require(tmpPath)
            const toolset: IAiToolset | undefined = mod.default ?? mod.toolset
            if (!toolset || typeof toolset !== 'object' || !Array.isArray(toolset.tools)) {
                logError(ELogComponent.CORE, `AI toolset '${id}' back.js exports no toolset definition`)
                return false
            }
            // The package's id and that of the toolset it exports have to be the same. If they diverge,
            // the index would say one thing and the registry another: uninstalling would leave the
            // toolset alive and the catalogue would show something that does not exist.
            if (toolset.id !== id) {
                logError(ELogComponent.CORE, `AI toolset package '${id}' exports a toolset with id '${toolset.id}' — refusing to register`)
                return false
            }
            registerToolset(toolset)
            logInfo(ELogComponent.CORE, `AI toolset '${id}' v${toolset.version} registered (${toolset.tools.length} tools)`)
            return true
        }
        catch (err) {
            logError(ELogComponent.CORE, `Error loading AI toolset '${id}': ${err}`)
            return false
        }
    }

    private async fetchJsFromSource(meta: IAiToolsetMeta): Promise<string | undefined> {
        if (!meta.installedFrom || meta.installedFrom === 'dev' || meta.installedFrom === 'local') return undefined
        const tmpTgz = path.join(os.tmpdir(), `kwirth-aitoolset-src-${meta.id}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-aitoolset-src-${meta.id}`)
        try {
            await downloadFile(meta.installedFrom, tmpTgz, await packageHeaders(meta.installedFrom))
            fs.mkdirSync(tmpDir, { recursive: true })
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            return readTarballFile(tmpDir, 'back.js')
        }
        catch (err) {
            logError(ELogComponent.CORE, `Could not fetch AI toolset '${meta.id}' from source: ${err}`)
            return undefined
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    /** At startup: registers every installed toolset. */
    async loadAll(): Promise<void> {
        for (const meta of this.cachedIndex) {
            if (meta.installedFrom === 'dev') continue      // los lleva loadDevAiToolsets()
            try {
                let backJs: string | undefined
                if (meta.backStored === false) {
                    backJs = await this.fetchJsFromSource(meta)
                }
                else {
                    const backData = await this.configMaps.read(`kwirth-aitoolset-${meta.id}-back`)
                    if (backData?.code)
                        backJs = backData.compressed ? zlib.gunzipSync(Buffer.from(backData.code, 'base64')).toString('utf-8') : backData.code
                }
                if (backJs) this.loadBackToolset(meta.id, backJs)
                else logError(ELogComponent.CORE, `AI toolset '${meta.id}' has no back.js — skipping`)
            }
            catch (err) {
                logError(ELogComponent.CORE, `Failed to load AI toolset '${meta.id}': ${err}`)
            }
        }
    }

    // ── Instalacion ─────────────────────────────────────────────────────────────

    async install(tarGzUrl: string, installedFrom?: string, marketplaceId?: string, marketplaceLabel?: string, upgrade?: boolean): Promise<IAiToolsetMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-aitoolset-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-aitoolset-extract-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })

        const isLocalPath = tarGzUrl.startsWith('file://') || (!tarGzUrl.startsWith('http://') && !tarGzUrl.startsWith('https://'))
        const localPath = tarGzUrl.startsWith('file://') ? new URL(tarGzUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1') : tarGzUrl
        // In dev it points straight at the dist folder — as plugins do in kwirth-dev.json — so a tgz need
        // not be packaged on every build. From a marketplace or an uploaded file it is always a tarball.
        const isLocalDir = isLocalPath && fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()

        try {
            if (isLocalDir) {
                tmpDir = localPath
            }
            else {
                if (isLocalPath) fs.copyFileSync(localPath, tmpTgz)
                else await downloadFile(tarGzUrl, tmpTgz, await packageHeaders(tarGzUrl))
                await tar.x({ file: tmpTgz, cwd: tmpDir })
            }

            let metaPath = path.join(tmpDir, 'package.json')
            let backPath = path.join(tmpDir, 'back.js')
            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) {
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                backPath = path.join(tmpDir, 'back.js')
                if (!fs.existsSync(metaPath) || !fs.existsSync(backPath))
                    throw new Error('Invalid AI toolset bundle: missing package.json or back.js')
            }

            const meta: IAiToolsetMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))

            // It is rejected BEFORE touching anything: a reserved core id cannot be taken, and finding
            // out after having written the index would leave an entry that can never be registered.
            if (isBuiltInToolsetId(meta.id))
                throw new Error(`AI toolset id '${meta.id}' is reserved by a built-in toolset`)
            const index = (await this.configMaps.read(INDEX_KEY, []) as IAiToolsetMeta[]) || []
            // Installed is what the live registry says, not the index: a dev one is loaded without appearing there.
            if (installedFrom !== 'dev' && installedFrom !== 'bundled')
                assertInstallable('AI toolset', meta.id, getToolset(meta.id) ? (index.find(t => t.id === meta.id) ?? {}) : undefined, meta.version, upgrade)

            meta.installedFrom = installedFrom ?? tarGzUrl
            meta.marketplaceId = marketplaceId
            meta.marketplaceLabel = marketplaceLabel
            meta.requiresRestart = meta.requiresRestart ?? false
            // NORMALIZED: the tarball's package.json may still carry the old string form, and the
            // validator reads objects. See the note in PluginManager.
            meta.requiresExtension = normalizeRequires(meta.requiresExtension)
            // A toolset that requires an extension is not installed without it (plans/completed/dce/PRD.md, RF8).
            await assertExtensionRequirements('AI toolset', meta.id, meta.requiresExtension, installedFrom)

            const backJs = fs.readFileSync(backPath, 'utf-8')
            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored)
                logInfo(ELogComponent.CORE, `AI toolset '${meta.id}' back.js exceeds configmap limit — will fetch from source on startup`)

            await this.configMaps.write(`kwirth-aitoolset-${meta.id}-meta`, meta)
            /*
                null, and not skipping the write. When updating, a key that is not touched keeps the
                PREVIOUS version's content: the old back if the current one does not fit in the storage.
                What is installed has to be exactly what the package brings, not the sum of what its
                successive versions brought.
            */
            await this.configMaps.write(`kwirth-aitoolset-${meta.id}-back`, meta.backStored ? { code: backCompressed, compressed: true } : null)

            const existingIdx = index.findIndex(t => t.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta
            else index.push(meta)
            await this.configMaps.write(INDEX_KEY, index)
            this.cachedIndex = index

            // Reinstalling over something already registered (a dev one, or a new version) has to
            // replace and not clash: registerToolset blows up when the id is taken, so it is removed first.
            unregisterToolset(meta.id)
            this.loadBackToolset(meta.id, backJs)
            // ⚠️ `unregisterToolset` takes the grant away with the toolset, and on UNINSTALLING that is
            // the right thing. On reinstalling it is not: updating a toolset — or re-reading a dev one's
            // dist on every startup — must not silently revoke from the plugins what the admin gave them.
            // Without this the symptom is one of the expensive ones, because the two halves contradict
            // each other: the card goes on showing who it is granted to (that lives in the ConfigMap,
            // which installing does not touch) while the runtime answers NOT GRANTED and the bot is left
            // without tools until the next startup.
            await this.restoreGrants(meta.id)

            logInfo(ELogComponent.CORE, `AI toolset '${meta.id}' v${meta.version} installed`)
            return meta
        }
        finally {
            // ⚠️ ONLY what we created ourselves is deleted. With an installation from a folder (dev),
            // tmpDir is the toolset's REAL dist: deleting it here would take the user's build down on
            // every startup of the core.
            if (!isLocalDir) fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IAiToolsetMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-aitoolset-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(id: string): Promise<void> {
        if (isBuiltInToolsetId(id)) throw new Error(`AI toolset '${id}' is built-in and cannot be uninstalled`)

        // The STORED grant too: unregisterToolset clears the registry's one (memory), but were the
        // persisted one to survive, reinstalling the toolset would resurrect permissions nobody granted again.
        const grants = await this.listGrants()
        if (grants[id]) {
            delete grants[id]
            await this.configMaps.write(GRANTS_KEY, grants)
        }

        unregisterToolset(id)
        await this.configMaps.write(`kwirth-aitoolset-${id}-meta`, null)
        await this.configMaps.write(`kwirth-aitoolset-${id}-back`, null)

        const index = ((await this.configMaps.read(INDEX_KEY, []) as IAiToolsetMeta[]) || []).filter(t => t.id !== id)
        await this.configMaps.write(INDEX_KEY, index)
        this.cachedIndex = index
        this.devToolsets.delete(id)

        logInfo(ELogComponent.CORE, `AI toolset '${id}' uninstalled`)
    }

    /**
     * Uninstall on behalf of the pack that owns it, skipping the built-in guard the way the other
     * families do: the pack owns what it installed, and it is going whole.
     *
     * A reserved built-in id could never have been installed from a pack in the first place, so the
     * guard has nothing to protect here.
     */
    async uninstallFromPack(id: string): Promise<void> {
        const grants = await this.listGrants()
        if (grants[id]) {
            delete grants[id]
            await this.configMaps.write(GRANTS_KEY, grants)
        }
        unregisterToolset(id)
        await this.configMaps.write(`kwirth-aitoolset-${id}-meta`, null)
        await this.configMaps.write(`kwirth-aitoolset-${id}-back`, null)

        const index = ((await this.configMaps.read(INDEX_KEY, []) as IAiToolsetMeta[]) || []).filter(t => t.id !== id)
        await this.configMaps.write(INDEX_KEY, index)
        this.cachedIndex = index
        this.devToolsets.delete(id)

        logInfo(ELogComponent.CORE, `AI toolset '${id}' uninstalled (pack)`)
    }

    async installBundled(bundledDir: string): Promise<void> {
        // The bundled directory is SHARED by every type: it has to be filtered by extensionType rather
        // than swallowing every .tgz there is. listBundledOfType looks inside each one.
        for (const full of await listBundledOfType(bundledDir, EExtensionType.AITOOLSET)) {
            const file = path.basename(full)
            try {
                await this.install(full, 'bundled')
            }
            catch (err: any) {
                if (err?.message?.includes('already installed'))
                    logInfo(ELogComponent.CORE, `Bundled AI toolset '${file}' already installed — skipping`)
                else
                    logError(ELogComponent.CORE, `Failed to install bundled AI toolset '${file}': ${err}`)
            }
        }
    }

    // ── Dev ─────────────────────────────────────────────────────────────────────

    // kwirth-dev.json is DECLARATIVE: what is listed here stays installed and what is removed from the
    // file gets uninstalled. It is worth saying because a dev toolset is a REAL installation — it is
    // written into ConfigMaps — so deleting the line merely stopped it being reinstalled: the entry
    // survived in the index and the manager went on considering it installed forever.
    loadDevAiToolsets(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        let entries: [string, unknown][] = []
        try {
            entries = Object.entries(JSON.parse(fs.readFileSync(devConfigPath, 'utf-8')).aitoolsets ?? {})
        }
        catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (aitoolsets): ${err}`)
            return
        }

        ;(async () => {
            const declared = new Set<string>()
            for (const [id, tgzPath] of entries) {
                if (typeof tgzPath !== 'string') continue
                const resolved = path.resolve(process.cwd(), tgzPath)
                if (!fs.existsSync(resolved)) {
                    logWarning(ELogComponent.CORE, `[dev] AI toolset '${id}' tgz not found at ${resolved} — run its build first`)
                    continue
                }
                try {
                    const meta = await this.install(resolved, 'dev')
                    declared.add(meta.id)
                    this.devToolsets.set(meta.id, { tgzPath: resolved, meta })
                    logInfo(ELogComponent.CORE, `[dev] AI toolset '${meta.id}' v${meta.version} installed`)
                }
                catch (err) {
                    logError(ELogComponent.CORE, `[dev] Failed to install AI toolset '${id}': ${err}`)
                }
            }
            await this.pruneDevAiToolsets(declared)
        })().catch(err => logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (aitoolsets): ${err}`))
    }

    private async pruneDevAiToolsets(declared: Set<string>): Promise<void> {
        const index = (await this.configMaps.read(INDEX_KEY, []) as IAiToolsetMeta[]) || []
        for (const meta of staleDevAiToolsets(index, declared)) {
            await this.uninstall(meta.id)
            logInfo(ELogComponent.CORE, `[dev] AI toolset '${meta.id}' no longer in kwirth-dev.json — uninstalled`)
        }
    }
}
