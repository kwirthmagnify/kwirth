import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage, ISenderResult, ISenderStoredConfig, TSenderConstructor } from '@kwirthmagnify/kwirth-common-back'
import { IConfigMaps } from './IConfigMap'
import { componentLogger, ELogComponent, IComponentLogger, logError, logInfo, logWarning } from './Logging'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'
import { cachedExtensionFile, downloadFile, dropCachedExtensionFiles, packageHeaders, readTarballFile } from './PackageRegistries'
import { assertInstallable } from './ExtensionInstallGuard'
import { assertDceRequirements } from './ExtensionDeps'

export interface ISenderMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    // Which marketplace it came from. It is STORED on install, not deduced: the tarball's url points at
    // the package registry, which is another server, and with precedence by id two marketplaces can
    // serve the same extension. Absent = it came from no marketplace (dev, a file or a loose url).
    marketplaceId?: string
    marketplaceLabel?: string
    backStored?: boolean
    frontStored?: boolean
    requiresRestart?: boolean
    requiresExtension?: string[]
}

// 'export type' and not 'export': they are interfaces. Re-exporting them as values makes the bundler
// emit a runtime import against kwirth-common-back (which is CJS) and blow up when loading it from
// ESM. WebhookManager was already doing it this way.
export type { ISenderConfig, ISenderMessage }

const CONFIGMAP_SIZE_LIMIT = 800 * 1024

interface IDevSender {
    distPath: string
    meta: ISenderMeta
}

/*
    'setLogger' is already in the published contract (ISender), but the package npm serves does not carry
    it yet. It is declared here so as not to block the core; as soon as the new version is installed it is surplus.
*/
interface ISenderWithLogger {
    setLogger?: (logger: IComponentLogger) => void
}

export class SenderManager implements ISenderAccess {
    private configMaps: IConfigMaps
    private registeredSenders = new Map<string, TSenderConstructor>()
    private instances = new Map<string, ISender>()
    private devSenders = new Map<string, IDevSender>()
    // the path watched, by id, so that fs.unwatchFile can be called on unregistering
    private devWatchers = new Map<string, string>()
    private configStore = new Map<string, Map<string, ISenderConfig>>()
    private commonFieldStore = new Map<string, Record<string, unknown>>()
    private installedIds: string[] = []
    private installedMetas = new Map<string, ISenderMeta>()
    private cachedIndex: ISenderMeta[] = []

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    async init(): Promise<void> {
        const index = (await this.configMaps.read('kwirth-senders-index', [])) as ISenderMeta[]
        this.cachedIndex = index || []
        this.installedIds = this.cachedIndex.map(s => s.id)
        for (const meta of this.cachedIndex) this.installedMetas.set(meta.id, meta)
    }

    getInstalledIds(): string[] {
        return this.installedIds
    }

    getDevIds(): string[] {
        return Array.from(this.devSenders.keys())
    }

    isDevSender(id: string): boolean {
        return this.devSenders.has(id)
    }

    hasFront(id: string): boolean {
        const dev = this.devSenders.get(id)
        if (dev) return fs.existsSync(path.join(dev.distPath, 'front.js'))
        // installed sender: check stored front flag
        const meta = this.getInstalledMeta(id)
        return meta?.frontStored === true || meta?.frontStored === false  // frontStored present means front exists
    }

    async getFrontJs(id: string): Promise<string | undefined> {
        const dev = this.devSenders.get(id)
        if (dev) {
            try { return fs.readFileSync(path.join(dev.distPath, 'front.js'), 'utf-8') } catch { return undefined }
        }
        // installed sender
        const metaData = await this.configMaps.read(`kwirth-sender-${id}-meta`) as ISenderMeta | null
        if (!metaData) return undefined
        if (metaData.frontStored === false) return this.fetchFrontJsFromSource(metaData)
        const data = await this.configMaps.read(`kwirth-sender-${id}-front`)
        if (!data?.code) return undefined
        return data.compressed ? zlib.gunzipSync(Buffer.from(data.code, 'base64')).toString('utf-8') : data.code
    }

    private getInstalledMeta(id: string): ISenderMeta | undefined {
        return this.installedMetas.get(id)
    }

    private async fetchFrontJsFromSource(meta: ISenderMeta): Promise<string | undefined> {
        const cacheFile = cachedExtensionFile('sender', meta.id, 'front.js')
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') return undefined
        const tmpTgz = path.join(os.tmpdir(), `kwirth-sender-${meta.id}-frontsrc-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-sender-${meta.id}-frontsrc-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await downloadFile(meta.installedFrom, tmpTgz, await packageHeaders(meta.installedFrom))
            await (await import('tar')).x({ file: tmpTgz, cwd: tmpDir })
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

    loadDevSenders(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const sendersMap: Record<string, string> = raw.senders ?? {}
            for (const [id, distPath] of Object.entries(sendersMap)) {
                this.registerDevSender(id, distPath)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (senders): ${err}`)
        }
    }

    loadDevSenderConfigs(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const configsMap: Record<string, ISenderConfig[]> = raw.senderConfigs ?? {}
            for (const [senderId, configs] of Object.entries(configsMap)) {
                for (const config of configs) {
                    this.addConfigInternal(senderId, this.interpolateEnvVars(config))
                }
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (senderConfigs): ${err}`)
        }
    }

    async loadPersistedConfigs(): Promise<void> {
        let allKeys = await this.configMaps.readAllKeys('kwirth-sender-configs')

        // Migration: K8s old format stored everything under a single 'data' key
        if (allKeys['data'] && typeof allKeys['data'] === 'object' && !Array.isArray(allKeys['data']) && !(allKeys['data'] as ISenderStoredConfig).configs) {
            const oldData = allKeys['data'] as Record<string, unknown>
            for (const [senderId, value] of Object.entries(oldData)) {
                await this.configMaps.writeKey('kwirth-sender-configs', senderId, value)
            }
            await this.configMaps.writeKey('kwirth-sender-configs', 'data', null)
            delete allKeys['data']
            Object.assign(allKeys, oldData)
            logInfo(ELogComponent.CORE, 'Migrated sender configs from single-blob to per-sender keys')
        }

        for (const [senderId, value] of Object.entries(allKeys)) {
            let configs: ISenderConfig[]
            let common: Record<string, unknown> = {}
            if (Array.isArray(value)) {
                configs = value as ISenderConfig[]
            } else if (value && typeof value === 'object' && Array.isArray((value as ISenderStoredConfig).configs)) {
                const { configs: storedConfigs, ...commonFields } = value as ISenderStoredConfig
                configs = storedConfigs as ISenderConfig[]
                common = commonFields as Record<string, unknown>
            } else {
                continue
            }
            this.commonFieldStore.set(senderId, common)
            for (const config of configs) {
                this.addConfigInternal(senderId, config)
            }
        }
    }

    private interpolateEnvVars(obj: ISenderConfig): ISenderConfig {
        const json = JSON.stringify(obj).replace(/\$\{([^}]+)\}/g, (_, varName) => {
            const value = process.env[varName]
            if (!value) logWarning(ELogComponent.CORE, `Sender config references undefined env var: ${varName}`)
            return value ?? ''
        })
        return JSON.parse(json)
    }

    private registerDevSender(id: string, distPath: string): void {
        const absPath = path.resolve(distPath)
        const backPath = path.join(absPath, 'back.js')
        const metaPath = path.join(absPath, 'package.json')

        const meta: ISenderMeta = { id, name: id, version: 'dev', description: 'dev sender', installedFrom: 'dev' }
        try {
            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            meta.name = pkg.name ?? id
            meta.displayName = pkg.displayName
            meta.version = pkg.version ?? 'dev'
            meta.description = pkg.description ?? ''
            meta.website = pkg.website
        } catch {}

        this.devSenders.set(id, { distPath: absPath, meta })
        this.reloadDevBack(id, backPath)

        // It is watched by POLLING, just as ProviderManager does, and never with fs.watch: a clean
        // build deletes dist/back.js before regenerating it, and an fs.watch over a file that
        // disappears emits an ASYNCHRONOUS 'error' the try/catch does not see and which, with no
        // listener, node turns into an uncaughtException that takes the core down with it. watchFile
        // tolerates the file going away and coming back. mtimeMs 0 = it does not exist right now: it is
        // ignored instead of attempting to reload it.
        fs.watchFile(backPath, { persistent: false, interval: 500 }, (curr, prev) => {
            if (curr.mtimeMs !== prev.mtimeMs && curr.mtimeMs !== 0) {
                logInfo(ELogComponent.CORE, `[dev] Sender '${id}' back.js changed — hot-reloading`)
                this.reloadDevBack(id, backPath)
            }
        })
        this.devWatchers.set(id, backPath)

        logInfo(ELogComponent.CORE, `[dev] Sender '${id}' registered from ${absPath}`)
    }

    private reloadDevBack(id: string, backPath: string): void {
        try {
            const resolved = require.resolve(backPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const mod = require(backPath)
            const SenderClass: TSenderConstructor = mod.default ?? Object.values(mod).find(v => typeof v === 'function') as TSenderConstructor
            if (SenderClass) {
                this.registeredSenders.set(id, SenderClass)
                this.instances.delete(id)
                logInfo(ELogComponent.CORE, `[dev] Sender '${id}' backend reloaded`)
            } else {
                logError(ELogComponent.CORE, `[dev] Sender '${id}' back.js exports no class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Sender '${id}' reload error: ${err}`)
        }
    }

    // ── Persistent install/uninstall ────────────────────────────────────────────

    async loadAll(): Promise<void> {
        const index = this.cachedIndex
        for (const meta of index) {
            try {
                let backJs: string | undefined
                if (meta.backStored === false) {
                    backJs = await this.fetchJsFromSource(meta)
                } else {
                    const backData = await this.configMaps.read(`kwirth-sender-${meta.id}-back`)
                    if (backData?.code)
                        backJs = backData.compressed ? zlib.gunzipSync(Buffer.from(backData.code, 'base64')).toString('utf-8') : backData.code
                }
                if (backJs) await this.loadBackSender(meta.id, backJs)
                else logError(ELogComponent.CORE, `Sender '${meta.id}' has no back.js — skipping`)
            } catch (err) {
                logError(ELogComponent.CORE, `Failed to load sender '${meta.id}': ${err}`)
            }
        }
    }

    private async loadBackSender(id: string, backJs: string): Promise<void> {
        const tmpPath = path.join(os.tmpdir(), `kwirth-sender-${id}-back.js`)
        fs.writeFileSync(tmpPath, backJs)
        try {
            if (require.cache[require.resolve(tmpPath)]) delete require.cache[require.resolve(tmpPath)]
            const mod = require(tmpPath)
            const SenderClass = mod.default ?? Object.values(mod).find(v => typeof v === 'function')
            if (SenderClass) {
                this.registeredSenders.set(id, SenderClass as TSenderConstructor)
                logInfo(ELogComponent.CORE, `Sender '${id}' backend registered`)
            } else {
                logError(ELogComponent.CORE, `Sender '${id}' back.js exports no sender class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Error loading sender '${id}' backend: ${err}`)
        }
    }

    async install(tarGzUrl: string, installedFrom?: string, marketplaceId?: string, marketplaceLabel?: string, upgrade?: boolean): Promise<ISenderMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-sender-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-sender-extract-${Date.now()}`)
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
                    throw new Error('Invalid sender bundle: missing package.json or back.js')
            }

            const meta: ISenderMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))

            const index = (await this.configMaps.read('kwirth-senders-index', []) as ISenderMeta[]) || []
            // Installed is what installedIds says, not the index: a dev one is loaded without appearing there.
            assertInstallable('Sender', meta.id, this.installedIds.includes(meta.id) ? (index.find(s => s.id === meta.id) ?? {}) : undefined, meta.version, upgrade)

            meta.installedFrom = installedFrom ?? tarGzUrl
            // A new version cannot inherit the previous one's cached js
            dropCachedExtensionFiles('sender', meta.id)

            meta.marketplaceId = marketplaceId

            meta.marketplaceLabel = marketplaceLabel
            meta.requiresRestart = meta.requiresRestart ?? false
            meta.requiresExtension = meta.requiresExtension ?? []
            // A sender that requires a DCE is not installed without it (plans/completed/dce/PRD.md, RF8).
            await assertDceRequirements('Sender', meta.id, meta.requiresExtension, installedFrom)
            const backJs = fs.readFileSync(backPath, 'utf-8')

            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored)
                logInfo(ELogComponent.CORE, `Sender '${meta.id}' back.js exceeds configmap limit — will fetch from source on startup`)

            // optional front.js
            const frontPath = path.join(tmpDir, 'front.js')
            let frontEntry: { code: string, compressed: boolean } | null = null
            if (fs.existsSync(frontPath)) {
                const frontJs = fs.readFileSync(frontPath, 'utf-8')
                const frontCompressed = zlib.gzipSync(Buffer.from(frontJs, 'utf-8')).toString('base64')
                meta.frontStored = frontCompressed.length <= CONFIGMAP_SIZE_LIMIT
                if (!meta.frontStored)
                    logInfo(ELogComponent.CORE, `Sender '${meta.id}' front.js exceeds configmap limit — will fetch from source on request`)
                if (meta.frontStored) frontEntry = { code: frontCompressed, compressed: true }
            }

            /*
                null and not skipping the write. When updating, a key that is not touched keeps the
                PREVIOUS version's content: the old front end if the current one does not fit — or if the
                new version no longer carries a front end — and the same with the back end. What is
                installed has to be exactly what the package carries, not the sum of what its versions
                have been carrying along the way.
            */
            await this.configMaps.write(`kwirth-sender-${meta.id}-front`, frontEntry)

            await this.configMaps.write(`kwirth-sender-${meta.id}-meta`, meta)
            await this.configMaps.write(`kwirth-sender-${meta.id}-back`, meta.backStored ? { code: backCompressed, compressed: true } : null)

            const existingIdx = index.findIndex(s => s.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta
            else index.push(meta)
            await this.configMaps.write('kwirth-senders-index', index)
            if (!this.installedIds.includes(meta.id)) this.installedIds.push(meta.id)
            this.installedMetas.set(meta.id, meta)

            await this.loadBackSender(meta.id, backJs)
            logInfo(ELogComponent.CORE, `Sender '${meta.id}' v${meta.version} installed`)
            return meta
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<ISenderMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-sender-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        } finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(id: string): Promise<void> {
        if (this.isDevSender(id)) throw new Error(`Sender '${id}' is a dev sender and cannot be uninstalled`)
        const meta = this.installedMetas.get(id)
        if (meta?.installedFrom?.startsWith('pack:')) throw new Error(`Sender '${id}' was installed by pack '${meta.installedFrom.slice(5)}' — uninstall the pack instead`)
        await this._doUninstall(id)
    }

    async uninstallFromPack(id: string): Promise<void> {
        await this._doUninstall(id)
    }

    private async _doUninstall(id: string): Promise<void> {
        // The /tmp cache does not carry the version in its name: unless it is deleted here,
        // reinstalling will serve the previous installation's js as long as the pod stays alive.
        dropCachedExtensionFiles('sender', id)
        this.instances.delete(id)
        this.registeredSenders.delete(id)
        this.installedIds = this.installedIds.filter(i => i !== id)

        const index = (await this.configMaps.read('kwirth-senders-index', []) as ISenderMeta[]) || []
        await this.configMaps.write('kwirth-senders-index', index.filter(s => s.id !== id))
        await this.configMaps.write(`kwirth-sender-${id}-meta`, null)
        await this.configMaps.write(`kwirth-sender-${id}-back`, null)
        await this.configMaps.write(`kwirth-sender-${id}-front`, null)
        this.configStore.delete(id)
        this.commonFieldStore.delete(id)
        await this.configMaps.writeKey('kwirth-sender-configs', id, null)
        this.installedMetas.delete(id)

        for (const suffix of ['back.js', 'front.js']) {
            const cacheFile = path.join(os.tmpdir(), `kwirth-sender-${id}-${suffix}`)
            if (fs.existsSync(cacheFile)) fs.rmSync(cacheFile)
        }

        logInfo(ELogComponent.CORE, `Sender '${id}' uninstalled`)
    }

    async listInstalled(): Promise<Array<ISenderMeta & { configNames: string[] }>> {
        const stored = (await this.configMaps.read('kwirth-senders-index', [])) as ISenderMeta[] || []
        const devMetas = Array.from(this.devSenders.entries()).map(([id, dev]) => {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(dev.distPath, 'package.json'), 'utf-8'))
                return { ...dev.meta, name: pkg.name ?? id, displayName: pkg.displayName, version: pkg.version ?? 'dev', description: pkg.description ?? '', website: pkg.website }
            } catch {
                return dev.meta
            }
        })
        /*
            A sender registered in dev REPLACES the installed one with its same id, it does not add to
            it. Without this filter the same sender comes out TWICE — the normal thing in a development
            environment, where it is installed and also mounted from its dist — and the duplicate travels
            as it is through GET /core/senders to all of its consumers: the sender manager and any
            extension listing senders. It is the same pattern plugin, theme, login, homepage and
            aitoolset already use; here it was missing. The dev one rules, which is the one getSender()
            ends up resolving.
        */
        const devIds = new Set(devMetas.map(m => m.id))
        return [...stored.filter(m => !devIds.has(m.id)), ...devMetas].map(meta => ({
            ...meta,
            configNames: Array.from(this.configStore.get(meta.id)?.values() ?? []).map(c => c.name),
            hasFront: this.hasFront(meta.id),
        }))
    }

    private async fetchJsFromSource(meta: ISenderMeta): Promise<string | undefined> {
        const cacheFile = cachedExtensionFile('sender', meta.id, 'back.js')
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') {
            logError(ELogComponent.CORE, `Sender '${meta.id}' back.js not stored and has no remote source`)
            return undefined
        }
        const tmpTgz = path.join(os.tmpdir(), `kwirth-sender-${meta.id}-src-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-sender-${meta.id}-src-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await downloadFile(meta.installedFrom, tmpTgz, await packageHeaders(meta.installedFrom))
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            const content = readTarballFile(tmpDir, 'back.js')
            if (!content) throw new Error(`no back.js inside the package downloaded from ${meta.installedFrom}`)
            fs.writeFileSync(cacheFile, content)
            logInfo(ELogComponent.CORE, `Sender '${meta.id}' back.js fetched from source and cached`)
            return content
        } catch (err) {
            logError(ELogComponent.CORE, `Sender '${meta.id}' failed to fetch back.js from source: ${err}`)
            return undefined
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    // ── Config management ───────────────────────────────────────────────────────

    /** Every sender instance alive right now: what the core wires up to the providers they consume. */
    listInstances(): ISender[] { return [...this.instances.values()] }

    /*
        Told by the core once it can wire an instance to the providers it consumes. A sender gets its
        instance when its first configuration is added, which may be long after startup: without this
        hook, a sender that emails through SES and reads the cloud accounts would only be wired on the
        next restart. Set by the core; undefined until the providers are ready.
    */
    onInstanceStarted?: (instance: ISender) => void

    getSender(id: string): ISender | undefined {
        if (this.instances.has(id)) return this.instances.get(id)
        const Ctor = this.registeredSenders.get(id)
        if (!Ctor) return undefined
        const instance = new Ctor()
        /*
            Same as providers: the sender is handed a logger that already knows its id, so whatever it
            says about itself comes out identified and with a level — '[send] [ERRO] [teams] ...' —
            instead of a console line that reads like any other. Optional, so a sender built before
            this simply does not get called.
        */
        const withLogger = instance as ISenderWithLogger
        withLogger.setLogger?.(componentLogger(ELogComponent.SENDER, id))
        instance.startSender(this).catch(err => logError(ELogComponent.CORE, `Sender '${id}' startSender error: ${err}`))
        this.instances.set(id, instance)
        this.onInstanceStarted?.(instance)
        /*
            A FRESHLY created instance knows nothing: its configurations were loaded into the previous
            instance, when the core started. And this is reached not only the first time, but every time
            a sender mounted from dev is reloaded — the rebuild throws the instance away in order to pick
            up the new code — so without this a rebuild leaves the sender WITHOUT configurations.

            The symptom was misleading: /core/senders' list went on showing them — that one comes from
            the core's store, not from the instance — and only on sending did "has no config" appear, as
            if they had deleted themselves.
        */
        const guardadas = this.configStore.get(id)
        if (guardadas) {
            const base = this.commonFieldStore.get(id) ?? {}
            for (const config of guardadas.values()) {
                try { instance.addConfig({ ...base, ...config } as ISenderConfig) }
                catch (err) { logError(ELogComponent.CORE, `Sender '${id}' could not restore config '${config.name}': ${err}`) }
            }
            if (guardadas.size > 0) logInfo(ELogComponent.CORE, `Sender '${id}' re-instantiated with ${guardadas.size} config(s)`)
        }
        return instance
    }

    private addConfigInternal(senderId: string, config: ISenderConfig): boolean {
        const sender = this.getSender(senderId)
        if (!sender) {
            logError(ELogComponent.CORE, `Sender '${senderId}' not found — cannot add config '${config.name}'`)
            return false
        }
        const base = this.commonFieldStore.get(senderId) ?? {}
        const merged = { ...base, ...config } as ISenderConfig
        const alreadyExists = this.configStore.has(senderId) && this.configStore.get(senderId)!.has(config.name)
        sender.addConfig(merged)
        if (!this.configStore.has(senderId)) this.configStore.set(senderId, new Map())
        this.configStore.get(senderId)!.set(config.name, { ...config })
        if (!alreadyExists) logInfo(ELogComponent.CORE, `Sender '${senderId}' config '${config.name}' registered`)
        return true
    }

    private persistSenderConfig(senderId: string): void {
        const configs = Array.from(this.configStore.get(senderId)?.values() ?? [])
        const common = this.commonFieldStore.get(senderId) ?? {}
        const data: ISenderStoredConfig = { ...common, configs }
        this.configMaps.writeKey('kwirth-sender-configs', senderId, data).catch((err: unknown) =>
            logError(ELogComponent.CORE, `Failed to persist sender '${senderId}' configs: ${err}`)
        )
    }

    addConfig(senderId: string, config: ISenderConfig): boolean {
        const ok = this.addConfigInternal(senderId, config)
        if (ok) this.persistSenderConfig(senderId)
        return ok
    }

    removeConfig(senderId: string, configName: string): boolean {
        const sender = this.getSender(senderId)
        if (!sender) return false
        sender.removeConfig(configName)
        this.configStore.get(senderId)?.delete(configName)
        this.persistSenderConfig(senderId)
        return true
    }

    getSenderStoredConfig(senderId: string): ISenderStoredConfig {
        const common = this.commonFieldStore.get(senderId) ?? {}
        const configs = Array.from(this.configStore.get(senderId)?.values() ?? [])
        return { ...common, configs }
    }

    setSenderStoredConfig(senderId: string, data: ISenderStoredConfig): boolean {
        const { configs, ...common } = data
        this.commonFieldStore.set(senderId, common as Record<string, unknown>)
        const sender = this.getSender(senderId)
        if (!sender) return false
        for (const name of Array.from(this.configStore.get(senderId)?.keys() ?? [])) {
            sender.removeConfig(name)
        }
        this.configStore.delete(senderId)
        for (const config of (configs as ISenderConfig[])) {
            this.addConfigInternal(senderId, config)
        }
        this.persistSenderConfig(senderId)
        return true
    }

    getSchema(senderId: string): ISenderFieldDef[] {
        const sender = this.getSender(senderId)
        return sender?.getConfigSchema?.() ?? []
    }

    getConfigs(senderId: string): ISenderConfig[] {
        return Array.from(this.configStore.get(senderId)?.values() ?? [])
    }

    exportAll(): Record<string, ISenderConfig[]> {
        const result: Record<string, ISenderConfig[]> = {}
        for (const [id, configs] of this.configStore) {
            result[id] = Array.from(configs.values())
        }
        return result
    }

    listSenders(): Array<{ id: string; configNames: string[] }> {
        return Array.from(this.instances.entries()).map(([id, sender]) => ({
            id,
            configNames: sender.getConfigNames(),
        }))
    }

    getConfig(senderId: string, configName: string): ISenderConfig | undefined {
        return this.configStore.get(senderId)?.get(configName)
    }

    async send(senderId: string, configName: string, message: ISenderMessage): Promise<ISenderResult | void> {
        const sender = this.getSender(senderId)
        if (!sender) {
            logError(ELogComponent.CORE, `Sender '${senderId}' not found — message dropped`)
            return
        }
        if (!sender.hasConfig(configName)) {
            logError(ELogComponent.CORE, `Sender '${senderId}' has no config '${configName}' — message dropped`)
            return
        }
        try {
            return await sender.send(configName, message)
        } catch (err) {
            logError(ELogComponent.CORE, `Sender '${senderId}' send error: ${err}`)
        }
    }

    /*
        Delivers a BATCH through a single call to the sender.

        One `send` per line turns log forwarding into a queue of round trips over the network, and the
        destinations' APIs (Datadog, Elastic, Loki) accept arrays and charge per request. With the batch,
        the `await` still means "these N lines delivered", which is what lets the caller count what was sent.

        ⚠️ When the sender does NOT implement sendBatch, delivery is message by message, in order. It is
        slower but correct, and it is what allows the contract to be optional: no existing sender breaks.
    */
    async sendBatch(senderId: string, configName: string, messages: ISenderMessage[]): Promise<ISenderResult | void> {
        if (messages.length === 0) return
        const sender = this.getSender(senderId)
        if (!sender) {
            logError(ELogComponent.CORE, `Sender '${senderId}' not found — ${messages.length} message(s) dropped`)
            return
        }
        if (!sender.hasConfig(configName)) {
            logError(ELogComponent.CORE, `Sender '${senderId}' has no config '${configName}' — ${messages.length} message(s) dropped`)
            return
        }
        try {
            if (typeof sender.sendBatch === 'function') return await sender.sendBatch(configName, messages)
            // With no batch support: one by one, and the first failure does NOT cancel the rest — every
            // line is delivered on its own, exactly as if the caller had done N sends.
            for (const message of messages) {
                try { await sender.send(configName, message) }
                catch (err) { logError(ELogComponent.CORE, `Sender '${senderId}' send error (within batch): ${err}`) }
            }
        }
        catch (err) {
            logError(ELogComponent.CORE, `Sender '${senderId}' sendBatch error: ${err}`)
        }
    }

    // H3b-recon: queries an external entity's current state (a ticket, for instance) through the sender.
    // Undefined when the sender does not support it, does not exist, does not have the config, or fails.
    // The pull counterpart of the webhook (push).
    async fetchStatus(senderId: string, configName: string, externalId: string): Promise<string | undefined> {
        const sender = this.getSender(senderId)
        if (!sender || !sender.fetchStatus || !sender.hasConfig(configName)) return undefined
        try {
            return await sender.fetchStatus(configName, externalId)
        } catch (err) {
            logError(ELogComponent.CORE, `Sender '${senderId}' fetchStatus error: ${err}`)
            return undefined
        }
    }

    async stopAll(): Promise<void> {
        for (const [id, instance] of this.instances) {
            try { await instance.stopSender() } catch (err) {
                logError(ELogComponent.CORE, `Sender '${id}' stopSender error: ${err}`)
            }
        }
        this.instances.clear()
    }

    // ── Utilities ───────────────────────────────────────────────────────────────
}
