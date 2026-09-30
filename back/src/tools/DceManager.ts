import { DCE_REGISTRY, EDceState, EExtensionType, IDceAccess, IDceConsumer, IDceMeta, IDceRegistryEntry, TDceRegistry } from '@kwirthmagnify/kwirth-common'
import { IDceBack, IDceBackHost, IDceStore } from '@kwirthmagnify/kwirth-common-back'
import { IConfigMaps } from './IConfigMap'
import { ISecrets } from './ISecrets'
import { ELogComponent, componentLogger, logError, logInfo, logWarning } from './Logging'
import { assertInstallable } from './ExtensionInstallGuard'
import { downloadFile, packageHeaders, readTarballFile } from './PackageRegistries'
import { listBundledOfType } from './BundledExtensions'
import { consumersBrokenByMajor, describeConsumers } from './ExtensionDeps'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'

/*
    Manager of the `dce` extension type (plan: plans/completed/dce/PLAN.md, S1).

    A dynamic core extension brings OBJECTS: its back.js exports a factory, this manager calls it once
    and hangs the result off `global.__kwirth_dce__[id]`, and other extensions ask for it with
    `getDce()`. Its front.js, when it has one, is stored here and served to the front end, which does
    the same on its side (S2).

    Three rules that are not in the other managers:

      · It loads BEFORE anybody that evaluates extension code (PRD RF6): a consumer's back.js may call
        getDce() at module level, so the instance has to be there first. The core awaits loadAll() and
        loadDevDces() before the first of the other managers.
      · Uninstalling one in use is refused, and so is a change of major with consumers on the old one
        (RF9, RF11): the message names them. Who consumes what is answered by the core through a
        resolver, because this manager must not know the other ten.
      · Its factory failing does not tumble the core (RNF2): the entry is left FAILED with the cause and
        getDce() throws it to whoever asks.
*/

/** Who consumes a DCE right now. The core builds it from every manager's installed metadata. */
export type TDceConsumerResolver = (dceId: string) => Promise<IDceConsumer[]>


const CONFIGMAP_SIZE_LIMIT = 800 * 1024
const INDEX_KEY = 'kwirth-dces-index'
/** The key prefix a DCE's own persisted data goes under, so it neither clashes with the core nor with another DCE. */
const OWN_DATA_PREFIX = (id: string): string => `kwirth-dce-${id}-own-`

interface IDevDce {
    distPath: string
    meta: IDceMeta
}

interface IStoredCode {
    code: string
    compressed: boolean
}

// What is surplus in the index when kwirth-dev.json is re-read. Only what is marked 'dev' is reconciled:
// whatever was installed from a marketplace, a url or a file stays where it is, because it is really
// installed. A pure function, exported on purpose: it is the logic that deserves a test.
export const staleDevDces = (index: IDceMeta[], declared: Set<string>): IDceMeta[] =>
    index.filter(m => m.installedFrom === 'dev' && !declared.has(m.id))

/** The back-end registry, created on first use. */
export const dceRegistry = (): TDceRegistry => {
    const g = global as unknown as Record<string, TDceRegistry | undefined>
    return (g[DCE_REGISTRY] ??= {})
}

export class DceManager implements IDceAccess {
    private configMaps: IConfigMaps
    private secrets: ISecrets
    private cachedIndex: IDceMeta[] = []
    private devDces = new Map<string, IDevDce>()
    /** front.js by id, for serving. Filled when loading; a dev one is read from its dist on every request. */
    private frontCache = new Map<string, string>()
    private consumersOf: TDceConsumerResolver | undefined

    constructor(configMaps: IConfigMaps, secrets: ISecrets) {
        this.configMaps = configMaps
        this.secrets = secrets
    }

    async init(): Promise<void> {
        this.cachedIndex = (await this.configMaps.read(INDEX_KEY, []) as IDceMeta[]) || []
    }

    /** The core sets it once every manager exists; without it, nothing is refused for being in use. */
    setConsumerResolver(resolver: TDceConsumerResolver | undefined): void {
        this.consumersOf = resolver
    }

    async listInstalled(): Promise<IDceMeta[]> {
        const stored = (await this.configMaps.read(INDEX_KEY, [])) as IDceMeta[] || []
        const devMetas = Array.from(this.devDces.values()).map(d => d.meta)
        const devIds = new Set(devMetas.map(m => m.id))
        return [...stored.filter(m => !devIds.has(m.id)), ...devMetas]
    }

    isDevDce(id: string): boolean {
        return this.devDces.has(id)
    }

    /** How the back end of a DCE is right now, or undefined when it has none or has not been loaded. */
    status(id: string): IDceRegistryEntry | undefined {
        return dceRegistry()[id]
    }

    /** Who requires a DCE right now. Empty until the core sets the resolver, which it does at startup. */
    async consumers(id: string): Promise<IDceConsumer[]> {
        return this.consumersOf ? this.consumersOf(id) : []
    }

    // ── Loading ─────────────────────────────────────────────────────────────────

    private hostFor(id: string): IDceBackHost {
        const scoped = (store: IDceStore, prefix: string): IDceStore => ({
            read: (name: string, defaultValue?: unknown) => Promise.resolve(store.read(prefix + name, defaultValue)),
            write: (name: string, data: unknown) => Promise.resolve(store.write(prefix + name, data))
        })
        const g = global as unknown as Record<string, Record<string, unknown> | undefined>
        return {
            id,
            logger: componentLogger(ELogComponent.CORE, `dce:${id}`),
            configMaps: scoped(this.configMaps as unknown as IDceStore, OWN_DATA_PREFIX(id)),
            secrets: scoped(this.secrets as unknown as IDceStore, OWN_DATA_PREFIX(id)),
            libs: g['__kwirth_back__'] ?? {}
        }
    }

    /**
     * Evaluates a back.js and calls its factory ONCE.
     *
     * The module only EXPORTS the factory; calling it is this manager's job. Were the module to build
     * its object at import time, there would be no host to hand it and no way to tell a module that
     * failed from one that never ran.
     *
     * Whatever happens, the registry says it: LOADED with the instance, or FAILED with the cause. A
     * consumer asking later gets the cause, not an `undefined`.
     */
    private async activate(id: string, backJs: string): Promise<void> {
        const registry = dceRegistry()
        const tmpPath = path.join(os.tmpdir(), `kwirth-dce-${id}-back.js`)
        fs.writeFileSync(tmpPath, backJs)
        try {
            const resolved = require.resolve(tmpPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const mod = require(tmpPath)
            const factory: IDceBack | undefined = mod.default ?? mod.dce
            if (!factory || typeof factory.create !== 'function') {
                registry[id] = { state: EDceState.FAILED, error: 'back.js exports no factory with create()' }
                logError(ELogComponent.CORE, `DCE '${id}' back.js exports no factory with create() — not loaded`)
                return
            }
            const instance = await factory.create(this.hostFor(id))
            registry[id] = { state: EDceState.LOADED, instance }
            logInfo(ELogComponent.CORE, `DCE '${id}' loaded`)
        }
        catch (err) {
            const error = err instanceof Error ? err.message : String(err)
            registry[id] = { state: EDceState.FAILED, error }
            logError(ELogComponent.CORE, `DCE '${id}' failed to load: ${error}`)
        }
    }

    private async readStoredCode(meta: IDceMeta, side: 'back' | 'front'): Promise<string | undefined> {
        const stored = side === 'back' ? meta.backStored : meta.frontStored
        if (stored === false) return this.fetchJsFromSource(meta, `${side}.js`)
        const data = await this.configMaps.read(`kwirth-dce-${meta.id}-${side}`) as IStoredCode | undefined
        if (!data?.code) return undefined
        return data.compressed ? zlib.gunzipSync(Buffer.from(data.code, 'base64')).toString('utf-8') : data.code
    }

    private async fetchJsFromSource(meta: IDceMeta, filename: string): Promise<string | undefined> {
        if (!meta.installedFrom || meta.installedFrom === 'dev' || meta.installedFrom === 'local') return undefined
        const tmpTgz = path.join(os.tmpdir(), `kwirth-dce-src-${meta.id}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-dce-src-${meta.id}`)
        try {
            await downloadFile(meta.installedFrom, tmpTgz, await packageHeaders(meta.installedFrom))
            fs.mkdirSync(tmpDir, { recursive: true })
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            return readTarballFile(tmpDir, filename)
        }
        catch (err) {
            logError(ELogComponent.CORE, `Could not fetch DCE '${meta.id}' ${filename} from source: ${err}`)
            return undefined
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    /** The front.js to serve, or undefined when the DCE has none. A dev one is read fresh from its dist. */
    async getFrontJs(id: string): Promise<string | undefined> {
        const dev = this.devDces.get(id)
        if (dev) {
            const file = path.join(dev.distPath, 'front.js')
            return fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : undefined
        }
        if (this.frontCache.has(id)) return this.frontCache.get(id)
        const meta = this.cachedIndex.find(m => m.id === id)
        if (!meta?.hasFront) return undefined
        const code = await this.readStoredCode(meta, 'front')
        if (code) this.frontCache.set(id, code)
        return code
    }

    /** At startup: loads every installed DCE. Dev ones are handled by loadDevDces(). */
    async loadAll(): Promise<void> {
        for (const meta of this.cachedIndex) {
            if (meta.installedFrom === 'dev') continue
            try {
                if (meta.hasBack) {
                    const backJs = await this.readStoredCode(meta, 'back')
                    if (backJs) await this.activate(meta.id, backJs)
                    else logError(ELogComponent.CORE, `DCE '${meta.id}' has no back.js to load — skipping`)
                }
                if (meta.hasFront) {
                    const frontJs = await this.readStoredCode(meta, 'front')
                    if (frontJs) this.frontCache.set(meta.id, frontJs)
                }
            }
            catch (err) {
                logError(ELogComponent.CORE, `Failed to load DCE '${meta.id}': ${err}`)
            }
        }
    }

    // ── Installation ────────────────────────────────────────────────────────────

    async install(tarGzUrl: string, installedFrom?: string, marketplaceId?: string, marketplaceLabel?: string, upgrade?: boolean): Promise<IDceMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-dce-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-dce-extract-${Date.now()}`)
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
            if (!fs.existsSync(metaPath)) {
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                if (!fs.existsSync(metaPath)) throw new Error('Invalid DCE bundle: missing package.json')
            }
            const backPath = path.join(tmpDir, 'back.js')
            const frontPath = path.join(tmpDir, 'front.js')
            const hasBack = fs.existsSync(backPath)
            const hasFront = fs.existsSync(frontPath)
            if (!hasBack && !hasFront) throw new Error('Invalid DCE bundle: it brings neither back.js nor front.js')

            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            // A package of another type is refused by name: installing a plugin as a DCE would "work"
            // up to the factory, and fail there with a message about a missing create().
            if (pkg.extensionType && pkg.extensionType !== EExtensionType.DCE)
                throw new Error(`Not a DCE package: its extensionType is '${pkg.extensionType}'`)
            const meta: IDceMeta = {
                id: pkg.id ?? String(pkg.name ?? '').split('/').pop(),
                name: pkg.name,
                displayName: pkg.displayName,
                version: pkg.version,
                description: pkg.description ?? '',
                website: pkg.website,
                installedFrom: installedFrom ?? tarGzUrl,
                marketplaceId,
                marketplaceLabel,
                hasBack,
                hasFront,
                // Forced, whatever the package says (PRD RNF3): consumers keep the previous instance.
                requiresRestart: true,
                requiresExtension: pkg.requiresExtension ?? []
            }
            if (!meta.id) throw new Error('Invalid DCE bundle: package.json has no id')

            const index = (await this.configMaps.read(INDEX_KEY, []) as IDceMeta[]) || []
            const existing = index.find(m => m.id === meta.id)
            // Installed is what the registry or the dev map says, not the index: a dev one is loaded without appearing there.
            if (installedFrom !== 'dev' && installedFrom !== 'bundled') {
                const installed = dceRegistry()[meta.id] || this.devDces.has(meta.id) || existing
                assertInstallable('DCE', meta.id, installed ? (existing ?? {}) : undefined, meta.version, upgrade)
                /*
                    A change of major with consumers on the old one is refused (RF11). Only when
                    upgrading: a first installation has nobody depending on it yet — and if a consumer
                    was installed first, RF8 has already refused it.
                */
                if (existing && upgrade && this.consumersOf) {
                    const broken = consumersBrokenByMajor(await this.consumersOf(meta.id), meta.version)
                    if (broken.length)
                        throw new Error(`DCE '${meta.id}' cannot be updated from v${existing.version} to v${meta.version}: it changes major and is required by ${describeConsumers(broken)}`)
                }
            }

            const store = async (side: 'back' | 'front', file: string, present: boolean): Promise<boolean | undefined> => {
                /*
                    null, and not skipping the write. When updating, a key that is not touched keeps the
                    PREVIOUS version's content. What is installed has to be exactly what the package
                    brings, not the sum of what its successive versions brought.
                */
                if (!present) { await this.configMaps.write(`kwirth-dce-${meta.id}-${side}`, null); return undefined }
                const js = fs.readFileSync(file, 'utf-8')
                const compressed = zlib.gzipSync(Buffer.from(js, 'utf-8')).toString('base64')
                const fits = compressed.length <= CONFIGMAP_SIZE_LIMIT
                if (!fits) logInfo(ELogComponent.CORE, `DCE '${meta.id}' ${side}.js exceeds configmap limit — will fetch from source on startup`)
                await this.configMaps.write(`kwirth-dce-${meta.id}-${side}`, fits ? { code: compressed, compressed: true } : null)
                return fits
            }
            meta.backStored = await store('back', backPath, hasBack)
            meta.frontStored = await store('front', frontPath, hasFront)

            await this.configMaps.write(`kwirth-dce-${meta.id}-meta`, meta)
            const existingIdx = index.findIndex(m => m.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta
            else index.push(meta)
            await this.configMaps.write(INDEX_KEY, index)
            this.cachedIndex = index

            // Hot: the factory runs now, so a consumer installed afterwards finds the instance. On an
            // update the consumers already running keep the old one — hence requiresRestart.
            this.frontCache.delete(meta.id)
            if (hasBack) await this.activate(meta.id, fs.readFileSync(backPath, 'utf-8'))
            else delete dceRegistry()[meta.id]
            if (hasFront) this.frontCache.set(meta.id, fs.readFileSync(frontPath, 'utf-8'))

            logInfo(ELogComponent.CORE, `DCE '${meta.id}' v${meta.version} installed (${[hasBack && 'back', hasFront && 'front'].filter(Boolean).join(' + ')})`)
            return meta
        }
        finally {
            // ⚠️ ONLY what we created ourselves is deleted. With an installation from a folder (dev),
            // tmpDir is the DCE's REAL dist: deleting it would take the user's build down on every startup.
            if (!isLocalDir) fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IDceMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-dce-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    /**
     * Uninstalls, unless somebody depends on it (RF9). `force` skips that check: it is for the dev
     * reconciliation, where the developer removed the line and the consumers are theirs to sort out.
     */
    async uninstall(id: string, force = false): Promise<void> {
        if (!force && this.consumersOf) {
            const consumers = await this.consumersOf(id)
            if (consumers.length) throw new Error(`DCE '${id}' is in use and cannot be uninstalled: required by ${describeConsumers(consumers)}`)
        }

        // The instance leaves the registry: whoever asks from now on is told it is not installed. The
        // consumers that already hold it keep it until the restart the type demands.
        delete dceRegistry()[id]
        this.frontCache.delete(id)
        await this.configMaps.write(`kwirth-dce-${id}-meta`, null)
        await this.configMaps.write(`kwirth-dce-${id}-back`, null)
        await this.configMaps.write(`kwirth-dce-${id}-front`, null)

        const index = ((await this.configMaps.read(INDEX_KEY, []) as IDceMeta[]) || []).filter(m => m.id !== id)
        await this.configMaps.write(INDEX_KEY, index)
        this.cachedIndex = index
        this.devDces.delete(id)

        logInfo(ELogComponent.CORE, `DCE '${id}' uninstalled`)
    }

    /**
     * Uninstall on behalf of the pack that owns it.
     *
     * Forced, because the pack goes whole: the consumers it brought have already been removed by the
     * time this runs, and refusing over one of them would leave the pack half uninstalled. A consumer
     * that does NOT come from the pack could not have been installed while the DCE belonged to it
     * without declaring the dependency, and that one is somebody else's problem to reinstall.
     */
    async uninstallFromPack(id: string): Promise<void> {
        await this.uninstall(id, true)
    }

    async installBundled(bundledDir: string): Promise<void> {
        // The bundled directory is SHARED by every type: it has to be filtered by extensionType rather
        // than swallowing every .tgz there is. listBundledOfType looks inside each one.
        for (const full of await listBundledOfType(bundledDir, EExtensionType.DCE)) {
            const file = path.basename(full)
            try {
                await this.install(full, 'bundled')
            }
            catch (err: unknown) {
                if (err instanceof Error && err.message.includes('already installed'))
                    logInfo(ELogComponent.CORE, `Bundled DCE '${file}' already installed — skipping`)
                else
                    logError(ELogComponent.CORE, `Failed to install bundled DCE '${file}': ${err}`)
            }
        }
    }

    // ── Dev ─────────────────────────────────────────────────────────────────────

    /*
        kwirth-dev.json is DECLARATIVE: what is listed here stays installed and what is removed from the
        file gets uninstalled.

        AWAITED, unlike the other managers' dev loading: a DCE has to be there before the dev plugin that
        consumes it is loaded (RF6), and the core loads plugins right after this.
    */
    async loadDevDces(): Promise<void> {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        let entries: [string, unknown][] = []
        try {
            entries = Object.entries(JSON.parse(fs.readFileSync(devConfigPath, 'utf-8')).dces ?? {})
        }
        catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (dces): ${err}`)
            return
        }

        const declared = new Set<string>()
        for (const [id, distPath] of entries) {
            if (typeof distPath !== 'string') continue
            const resolved = path.resolve(process.cwd(), distPath)
            if (!fs.existsSync(resolved)) {
                logWarning(ELogComponent.CORE, `[dev] DCE '${id}' dist not found at ${resolved} — run its build first`)
                continue
            }
            try {
                const meta = await this.install(resolved, 'dev')
                declared.add(meta.id)
                this.devDces.set(meta.id, { distPath: resolved, meta })
                logInfo(ELogComponent.CORE, `[dev] DCE '${meta.id}' v${meta.version} installed`)
            }
            catch (err) {
                logError(ELogComponent.CORE, `[dev] Failed to install DCE '${id}': ${err}`)
            }
        }
        await this.pruneDevDces(declared)
    }

    private async pruneDevDces(declared: Set<string>): Promise<void> {
        const index = (await this.configMaps.read(INDEX_KEY, []) as IDceMeta[]) || []
        for (const meta of staleDevDces(index, declared)) {
            await this.uninstall(meta.id, true)
            logInfo(ELogComponent.CORE, `[dev] DCE '${meta.id}' no longer in kwirth-dev.json — uninstalled`)
        }
    }
}
