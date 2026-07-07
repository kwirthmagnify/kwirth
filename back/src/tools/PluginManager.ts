import { IConfigMaps } from './IConfigMap'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { TChannelConstructor } from '../channels/IChannel'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'
import { LicenseManager } from './LicenseManager'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'
import zlib from 'zlib'

export interface IPluginMeta {
    id: string
    name: string
    version: string
    description: string
    icon?: string
    website?: string
    installedFrom?: string
    backStored?: boolean
    frontStored?: boolean
}

const CONFIGMAP_SIZE_LIMIT = 800 * 1024

interface IDevPlugin {
    distPath: string
    meta: IPluginMeta
}

export class PluginManager {
    private configMaps: IConfigMaps
    private installedIds: string[] = []
    private cachedIndex: IPluginMeta[] = []
    private devPlugins = new Map<string, IDevPlugin>()
    private devWatchers = new Map<string, fs.FSWatcher>()
    onDevPluginReloaded?: (id: string, ChannelClass: TChannelConstructor) => void

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    async init(): Promise<void> {
        const index = await this.configMaps.read('kwirth-plugins-index', []) as IPluginMeta[]
        this.cachedIndex = index || []
        this.installedIds = this.cachedIndex.map(p => p.id)
    }

    getInstalledIds(): string[] {
        return this.installedIds
    }

    getDevIds(): string[] {
        return Array.from(this.devPlugins.keys())
    }

    isDevPlugin(id: string): boolean {
        return this.devPlugins.has(id)
    }

    getDevFrontJs(id: string): string | undefined {
        const dev = this.devPlugins.get(id)
        if (!dev) return undefined
        try { return fs.readFileSync(path.join(dev.distPath, 'front.js'), 'utf-8') } catch { return undefined }
    }

    getDevFrontMtime(id: string): number | undefined {
        const dev = this.devPlugins.get(id)
        if (!dev) return undefined
        try { return Math.floor(fs.statSync(path.join(dev.distPath, 'front.js')).mtimeMs) } catch { return undefined }
    }

    loadDevPlugins(registeredChannels: Map<string, TChannelConstructor>): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            // Support both legacy flat format { id: path } and new nested format { channels: { id: path }, providers: { id: path } }
            const channelsMap: Record<string, string> = raw.channels ?? raw
            if (raw.channels === undefined && typeof raw === 'object') {
                // flat format: filter out any non-string values (e.g. nested 'providers' object)
                for (const [id, distPath] of Object.entries(channelsMap)) {
                    if (typeof distPath === 'string') this.registerDevPlugin(id, distPath, registeredChannels)
                }
            } else {
                for (const [id, distPath] of Object.entries(channelsMap)) {
                    this.registerDevPlugin(id, distPath, registeredChannels)
                }
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json: ${err}`)
        }
    }

    private registerDevPlugin(id: string, distPath: string, registeredChannels: Map<string, TChannelConstructor>): void {
        const absPath = path.resolve(distPath)
        const backPath = path.join(absPath, 'back.js')
        const metaPath = path.join(absPath, 'package.json')

        const meta: IPluginMeta = { id, name: id, version: 'dev', description: 'dev plugin', installedFrom: 'dev' }
        try {
            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            meta.name = pkg.name ?? id
            meta.version = pkg.version ?? 'dev'
            meta.description = pkg.description ?? ''
            meta.icon = pkg.icon
            meta.website = pkg.website
        } catch {}

        this.devPlugins.set(id, { distPath: absPath, meta })
        this.installedIds = [...new Set([...this.installedIds, id])]

        this.reloadDevBack(id, backPath, registeredChannels)

        try {
            const dir = path.dirname(backPath)
            const filename = path.basename(backPath)
            const watcher = fs.watch(dir, (_, changedFile) => {
                if (changedFile === filename) {
                    logInfo(ELogComponent.CORE, `[dev] Daemon '${id}' back.js changed — hot-reloading`)
                    this.reloadDevBack(id, backPath, registeredChannels)
                }
            })
            this.devWatchers.set(id, watcher)
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Cannot watch '${backPath}': ${err}`)
        }

        logInfo(ELogComponent.CORE, `[dev] Plugin '${id}' registered from ${absPath}`)
    }

    private reloadDevBack(id: string, backPath: string, registeredChannels: Map<string, TChannelConstructor>): void {
        try {
            const resolved = require.resolve(backPath)
            if (require.cache[resolved]) {
                const mod = require.cache[resolved]
                if (mod?.parent) {
                    const idx = mod.parent.children.indexOf(mod)
                    if (idx >= 0) mod.parent.children.splice(idx, 1)
                }
                delete require.cache[resolved]
            }
            const pluginModule = require(backPath)
            const ChannelClass = pluginModule.default ?? Object.values(pluginModule).find(v => typeof v === 'function')
            if (ChannelClass) {
                const ctor = ChannelClass as TChannelConstructor
                registeredChannels.set(id, ctor)
                this.onDevPluginReloaded?.(id, ctor)
                logInfo(ELogComponent.CORE, `[dev] Plugin '${id}' backend channel reloaded`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Plugin '${id}' reload error: ${err}`)
        }
    }

    private async fetchJsFromSource(meta: IPluginMeta, filename: 'back.js' | 'front.js'): Promise<string | undefined> {
        const cacheFile = path.join(os.tmpdir(), `kwirth-plugin-${meta.id}-${filename}`)
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') {
            logError(ELogComponent.CORE, `Plugin '${meta.id}' ${filename} not stored and has no remote source — cannot recover`)
            return undefined
        }
        const tmpTgz = path.join(os.tmpdir(), `kwirth-plugin-${meta.id}-src-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-plugin-${meta.id}-src-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await this.downloadFile(meta.installedFrom, tmpTgz)
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            const content = fs.readFileSync(path.join(tmpDir, filename), 'utf-8')
            fs.writeFileSync(cacheFile, content)
            logInfo(ELogComponent.CORE, `Plugin '${meta.id}' ${filename} fetched from source and cached`)
            return content
        } catch (err) {
            logError(ELogComponent.CORE, `Plugin '${meta.id}' failed to fetch ${filename} from source: ${err}`)
            return undefined
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async listInstalled(): Promise<IPluginMeta[]> {
        const stored = (await this.configMaps.read('kwirth-plugins-index', [])) as IPluginMeta[]
        const devMetas = Array.from(this.devPlugins.entries()).map(([id, dev]) => {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(dev.distPath, 'package.json'), 'utf-8'))
                return { ...dev.meta, name: pkg.name ?? id, version: pkg.version ?? 'dev', description: pkg.description ?? '', icon: pkg.icon, website: pkg.website }
            } catch {
                return dev.meta
            }
        })
        const devIds = new Set(devMetas.map(m => m.id))
        return [...stored.filter(p => !devIds.has(p.id)), ...devMetas]
    }

    async install(tarGzUrl: string, registeredChannels: Map<string, TChannelConstructor>, installedFrom?: string): Promise<IPluginMeta> {
        let tmpTgz = path.join(os.tmpdir(), `kwirth-plugin-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-plugin-extract-${Date.now()}`)
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
            let frontPath = path.join(tmpDir, 'front.js')

            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath) || !fs.existsSync(frontPath)) {
                // try npmjs format (folder 'package' at top level)
                logWarning(ELogComponent.CORE, 'Cannot find artifacts. Trying npmjs format')
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                backPath = path.join(tmpDir, 'back.js')
                frontPath = path.join(tmpDir, 'front.js')
                if (!fs.existsSync(metaPath) || !fs.existsSync(backPath) || !fs.existsSync(frontPath)) {
                    throw new Error('Invalid plugin bundle: missing package.json, back.js or front.js')
                }
                else {

                }
            }

            const meta: IPluginMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))

            if (this.installedIds.includes(meta.id))
                throw new Error(`Plugin '${meta.id}' is already installed`)

            meta.installedFrom = installedFrom ?? tarGzUrl
            const backJs = fs.readFileSync(backPath, 'utf-8')
            const frontJs = fs.readFileSync(frontPath, 'utf-8')

            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            const frontCompressed = zlib.gzipSync(Buffer.from(frontJs, 'utf-8')).toString('base64')

            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT
            meta.frontStored = frontCompressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored) logInfo(ELogComponent.CORE, `Plugin '${meta.id}' back.js (${Math.round(backCompressed.length / 1024)}KB) exceeds configmap limit — will fetch from source on startup`)
            if (!meta.frontStored) logInfo(ELogComponent.CORE, `Plugin '${meta.id}' front.js (${Math.round(frontCompressed.length / 1024)}KB) exceeds configmap limit — will fetch from source on request`)

            const backEntry: Record<string, unknown> = { meta }
            if (meta.backStored) { backEntry.code = backCompressed; backEntry.compressed = true }
            await this.configMaps.write(`kwirth-plugin-${meta.id}-back`, backEntry)
            if (meta.frontStored) await this.configMaps.write(`kwirth-plugin-${meta.id}-front`, { code: frontCompressed, compressed: true })

            const index = (await this.configMaps.read('kwirth-plugins-index', []) as IPluginMeta[]) || []
            const existingIdx = index.findIndex(p => p.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta
            else index.push(meta)
            await this.configMaps.write('kwirth-plugins-index', index)
            if (!this.installedIds.includes(meta.id)) this.installedIds.push(meta.id)

            await this.loadBackPlugin(meta.id, backJs, registeredChannels)
            logInfo(ELogComponent.CORE, `Plugin '${meta.id}' v${meta.version} installed`)
            return meta
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer, registeredChannels: Map<string, TChannelConstructor>): Promise<IPluginMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-plugin-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, registeredChannels, 'local')
        } finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(id: string, registeredChannels: Map<string, TChannelConstructor>): Promise<void> {
        if (this.isDevPlugin(id)) throw new Error(`Plugin '${id}' is a dev plugin and cannot be uninstalled`)
        const index = (await this.configMaps.read('kwirth-plugins-index', []) as IPluginMeta[]) || []
        const meta = index.find(p => p.id === id)
        if (meta?.installedFrom === 'bundled') throw new Error(`Plugin '${id}' is bundled and cannot be uninstalled`)
        registeredChannels.delete(id)
        this.installedIds = this.installedIds.filter(i => i !== id)

        await this.configMaps.write('kwirth-plugins-index', index.filter(p => p.id !== id))
        await this.configMaps.write(`kwirth-plugin-${id}-back`, null)
        await this.configMaps.write(`kwirth-plugin-${id}-front`, null)
        await this.configMaps.write(`kwirth-plugin-${id}-config`, null)

        for (const f of [`kwirth-plugin-${id}-back.js`, `kwirth-plugin-${id}-front.js`]) {
            const p = path.join(os.tmpdir(), f)
            if (fs.existsSync(p)) fs.rmSync(p)
        }

        logInfo(ELogComponent.CORE, `Plugin '${id}' uninstalled`)
    }

    // Configuración de instalación por plugin (JSON genérico), persistida en ConfigMap. La edita el
    // plugin manager (front) y la consumen el back del plugin (IBackChannelObject.getPluginConfig) y
    // el front (GET /plugins/:id/config). Mismo patrón que ProviderManager.get/saveConfig.
    async getConfig(id: string): Promise<Record<string, unknown>> {
        const data = await this.configMaps.read(`kwirth-plugin-${id}-config`, {})
        return (data ?? {}) as Record<string, unknown>
    }

    async saveConfig(id: string, cfg: Record<string, unknown>): Promise<void> {
        await this.configMaps.write(`kwirth-plugin-${id}-config`, cfg)
    }

    async loadAll(registeredChannels: Map<string, TChannelConstructor>): Promise<void> {
        const devIds = this.getDevIdsFromConfig()
        const index = this.cachedIndex
        for (const meta of index) {
            if (devIds.has(meta.id)) {
                logInfo(ELogComponent.CORE, `Plugin '${meta.id}' is a dev plugin — skipping configmap load`)
                continue
            }
            try {
                let backJs: string | undefined
                if (meta.backStored === false) {
                    backJs = await this.fetchJsFromSource(meta, 'back.js')
                } else {
                    const backData = await this.configMaps.read(`kwirth-plugin-${meta.id}-back`)
                    if (backData?.code)
                        backJs = backData.compressed ? zlib.gunzipSync(Buffer.from(backData.code, 'base64')).toString('utf-8') : backData.code
                }
                if (backJs) await this.loadBackPlugin(meta.id, backJs, registeredChannels)
                else logError(ELogComponent.CORE, `Plugin '${meta.id}' has no back.js — skipping`)
            } catch (err) {
                logError(ELogComponent.CORE, `Failed to load plugin '${meta.id}': ${err}`)
            }
        }
    }

    private getDevIdsFromConfig(): Set<string> {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return new Set()
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const channelsMap: Record<string, string> = raw.channels ?? raw
            return new Set(Object.keys(channelsMap).filter(k => typeof channelsMap[k] === 'string'))
        } catch { return new Set() }
    }

    async getFrontJs(id: string): Promise<string | undefined> {
        const backData = await this.configMaps.read(`kwirth-plugin-${id}-back`) as { meta: IPluginMeta, code?: string, compressed?: boolean } | null
        const meta = backData?.meta
        if (!meta) return undefined
        if (meta.frontStored === false) return this.fetchJsFromSource(meta, 'front.js')
        const data = await this.configMaps.read(`kwirth-plugin-${id}-front`)
        if (!data?.code) return undefined
        if (data.compressed) return zlib.gunzipSync(Buffer.from(data.code, 'base64')).toString('utf-8')
        return data.code
    }

    private async loadBackPlugin(id: string, backJs: string, registeredChannels: Map<string, TChannelConstructor>): Promise<void> {
        const tmpPath = path.join(os.tmpdir(), `kwirth-plugin-${id}-back.js`)
        fs.writeFileSync(tmpPath, backJs)
        try {
            if (require.cache[require.resolve(tmpPath)]) delete require.cache[require.resolve(tmpPath)]
            const pluginModule = require(tmpPath)
            const ChannelClass = pluginModule.default ?? pluginModule.NewsChannel ?? Object.values(pluginModule).find(v => typeof v === 'function')
            if (ChannelClass) {
                registeredChannels.set(id, ChannelClass as TChannelConstructor)
                logInfo(ELogComponent.CORE, `Plugin '${id}' backend channel registered`)
            } else {
                logError(ELogComponent.CORE, `Plugin '${id}' back.js exports no channel class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Error loading plugin '${id}' backend: ${err}`)
        }
    }

    async installBundled(dir: string, registeredChannels: Map<string, TChannelConstructor>, licenseManager?: LicenseManager): Promise<void> {
        if (!fs.existsSync(dir)) return
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.tgz'))
        for (const file of files) {
            const id = path.basename(file, '.tgz')
            if (licenseManager && !licenseManager.isExtensionLicensed(EExtensionType.PLUGIN, id)) {
                logInfo(ELogComponent.CORE, `Bundled plugin '${id}' not licensed — skipping`)
                continue
            }
            const filePath = path.join(dir, file)
            let _bvVersion: string | undefined
            try {
                const _bvTmp = path.join(os.tmpdir(), `kwirth-bv-${id}`)
                fs.mkdirSync(_bvTmp, { recursive: true })
                await tar.x({ file: filePath, cwd: _bvTmp, filter: (p: string) => p.endsWith('package.json') })
                const _bvPkg = [path.join(_bvTmp, 'package.json'), path.join(_bvTmp, 'package', 'package.json')].find(p => fs.existsSync(p))
                if (_bvPkg) _bvVersion = JSON.parse(fs.readFileSync(_bvPkg, 'utf-8')).version
                fs.rmSync(_bvTmp, { recursive: true, force: true })
            } catch {}
            const _bvExisting = this.cachedIndex.find(p => p.id === id)
            if (_bvExisting && _bvVersion && _bvExisting.version === _bvVersion) {
                logInfo(ELogComponent.CORE, `Bundled plugin '${id}' v${_bvVersion} up to date — skipping`)
                continue
            }
            if (_bvExisting) {
                logInfo(ELogComponent.CORE, `Bundled plugin '${id}' updating v${_bvExisting.version} → v${_bvVersion ?? '?'}`)
                this.installedIds = this.installedIds.filter(i => i !== id)
            }
            try {
                const meta = await this.install(filePath, registeredChannels, 'bundled')
                logInfo(ELogComponent.CORE, `Bundled plugin '${meta.id}' v${meta.version} installed`)
            } catch (err: any) {
                if (err?.message?.includes('already installed')) {
                    logInfo(ELogComponent.CORE, `Bundled plugin '${file}' already installed — skipping`)
                } else {
                    logError(ELogComponent.CORE, `Failed to install bundled plugin '${file}': ${err}`)
                }
            }
        }
    }

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
