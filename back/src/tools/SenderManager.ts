import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage, ISenderStoredConfig, TSenderConstructor } from '@kwirthmagnify/kwirth-common-back'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'
import https from 'https'
import http from 'http'

export interface ISenderMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    backStored?: boolean
    frontStored?: boolean
}

export { ISenderConfig, ISenderMessage }

const CONFIGMAP_SIZE_LIMIT = 800 * 1024

interface IDevSender {
    distPath: string
    meta: ISenderMeta
}

export class SenderManager implements ISenderAccess {
    private configMaps: IConfigMaps
    private registeredSenders = new Map<string, TSenderConstructor>()
    private instances = new Map<string, ISender>()
    private devSenders = new Map<string, IDevSender>()
    private devWatchers = new Map<string, fs.FSWatcher>()
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
        const cacheFile = path.join(os.tmpdir(), `kwirth-sender-${meta.id}-front.js`)
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') return undefined
        const tmpTgz = path.join(os.tmpdir(), `kwirth-sender-${meta.id}-frontsrc-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-sender-${meta.id}-frontsrc-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await this.downloadFile(meta.installedFrom, tmpTgz)
            await (await import('tar')).x({ file: tmpTgz, cwd: tmpDir })
            const content = fs.readFileSync(path.join(tmpDir, 'front.js'), 'utf-8')
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

        try {
            const watcher = fs.watch(backPath, () => {
                logInfo(ELogComponent.CORE, `[dev] Sender '${id}' back.js changed — hot-reloading`)
                this.reloadDevBack(id, backPath)
            })
            this.devWatchers.set(id, watcher)
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Cannot watch '${backPath}': ${err}`)
        }

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

    async install(tarGzUrl: string, installedFrom?: string): Promise<ISenderMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-sender-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-sender-extract-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })

        const isLocalPath = tarGzUrl.startsWith('file://') || (!tarGzUrl.startsWith('http://') && !tarGzUrl.startsWith('https://'))

        try {
            if (isLocalPath) {
                const localPath = tarGzUrl.startsWith('file://') ? new URL(tarGzUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1') : tarGzUrl
                fs.copyFileSync(localPath, tmpTgz)
            } else {
                await this.downloadFile(tarGzUrl, tmpTgz)
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

            if (this.installedIds.includes(meta.id))
                throw new Error(`Sender '${meta.id}' is already installed`)

            meta.installedFrom = installedFrom ?? tarGzUrl
            const backJs = fs.readFileSync(backPath, 'utf-8')

            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored)
                logInfo(ELogComponent.CORE, `Sender '${meta.id}' back.js exceeds configmap limit — will fetch from source on startup`)

            // optional front.js
            const frontPath = path.join(tmpDir, 'front.js')
            if (fs.existsSync(frontPath)) {
                const frontJs = fs.readFileSync(frontPath, 'utf-8')
                const frontCompressed = zlib.gzipSync(Buffer.from(frontJs, 'utf-8')).toString('base64')
                meta.frontStored = frontCompressed.length <= CONFIGMAP_SIZE_LIMIT
                if (!meta.frontStored)
                    logInfo(ELogComponent.CORE, `Sender '${meta.id}' front.js exceeds configmap limit — will fetch from source on request`)
                if (meta.frontStored) await this.configMaps.write(`kwirth-sender-${meta.id}-front`, { code: frontCompressed, compressed: true })
            }

            await this.configMaps.write(`kwirth-sender-${meta.id}-meta`, meta)
            if (meta.backStored) await this.configMaps.write(`kwirth-sender-${meta.id}-back`, { code: backCompressed, compressed: true })

            const index = (await this.configMaps.read('kwirth-senders-index', []) as ISenderMeta[]) || []
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
        return [...stored, ...devMetas].map(meta => ({
            ...meta,
            configNames: Array.from(this.configStore.get(meta.id)?.values() ?? []).map(c => c.name),
            hasFront: this.hasFront(meta.id),
        }))
    }

    private async fetchJsFromSource(meta: ISenderMeta): Promise<string | undefined> {
        const cacheFile = path.join(os.tmpdir(), `kwirth-sender-${meta.id}-back.js`)
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') {
            logError(ELogComponent.CORE, `Sender '${meta.id}' back.js not stored and has no remote source`)
            return undefined
        }
        const tmpTgz = path.join(os.tmpdir(), `kwirth-sender-${meta.id}-src-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-sender-${meta.id}-src-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await this.downloadFile(meta.installedFrom, tmpTgz)
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            const content = fs.readFileSync(path.join(tmpDir, 'back.js'), 'utf-8')
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

    getSender(id: string): ISender | undefined {
        if (this.instances.has(id)) return this.instances.get(id)
        const Ctor = this.registeredSenders.get(id)
        if (!Ctor) return undefined
        const instance = new Ctor()
        instance.startSender(this).catch(err => logError(ELogComponent.CORE, `Sender '${id}' startSender error: ${err}`))
        this.instances.set(id, instance)
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

    async send(senderId: string, configName: string, message: ISenderMessage): Promise<void> {
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
            await sender.send(configName, message)
        } catch (err) {
            logError(ELogComponent.CORE, `Sender '${senderId}' send error: ${err}`)
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

    private downloadFile(url: string, destPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http
            const file = fs.createWriteStream(destPath)
            protocol.get(url, { headers: { 'User-Agent': 'kwirth/1.0' } }, res => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    file.close()
                    this.downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
                    return
                }
                if (res.statusCode && res.statusCode !== 200) {
                    file.close()
                    reject(new Error(`HTTP ${res.statusCode} downloading ${url}`))
                    return
                }
                res.pipe(file)
                file.on('finish', () => { file.close(); resolve() })
            }).on('error', err => { file.close(); reject(err) })
        })
    }
}
