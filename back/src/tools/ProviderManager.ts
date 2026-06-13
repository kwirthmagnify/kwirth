import { IConfigMaps } from './IConfigMap'
import { TProviderConstructor } from '../providers/IProvider'
import { ELogComponent, logError, logInfo } from './Logging'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'
import zlib from 'zlib'

export interface IProviderSchemaField {
    name: string
    label: string
    type: 'string' | 'number' | 'boolean' | 'password'
    required?: boolean
    default?: string | number | boolean
}

export interface IProviderMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    backStored?: boolean
    hasFront?: boolean
    frontStored?: boolean
    hasSchema?: boolean
}

const CONFIGMAP_SIZE_LIMIT = 800 * 1024

interface IDevProvider {
    distPath: string
    meta: IProviderMeta
}

export class ProviderManager {
    private configMaps: IConfigMaps
    private installedIds: string[] = []
    private devProviders = new Map<string, IDevProvider>()
    private devSchemas = new Map<string, IProviderSchemaField[]>()

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    async init(): Promise<void> {
        const index = await this.configMaps.read('kwirth-providers-index', []) as IProviderMeta[]
        this.installedIds = (index || []).map(p => p.id)
    }

    getInstalledIds(): string[] {
        return this.installedIds
    }

    getDevIds(): string[] {
        return Array.from(this.devProviders.keys())
    }

    isDevProvider(id: string): boolean {
        return this.devProviders.has(id)
    }

    loadDevProviders(registeredProviders: Map<string, TProviderConstructor>): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const providersMap: Record<string, string> = raw.providers ?? {}
            for (const [id, distPath] of Object.entries(providersMap)) {
                this.registerDevProvider(id, distPath, registeredProviders)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (providers): ${err}`)
        }
    }

    private registerDevProvider(id: string, distPath: string, registeredProviders: Map<string, TProviderConstructor>): void {
        const absPath = path.resolve(distPath)
        const backPath = path.join(absPath, 'back.js')
        const metaPath = path.join(absPath, 'package.json')

        const meta: IProviderMeta = { id, name: id, version: 'dev', description: 'dev provider', installedFrom: 'dev' }
        try {
            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            meta.name = pkg.name ?? id
            meta.displayName = pkg.displayName
            meta.version = pkg.version ?? 'dev'
            meta.description = pkg.description ?? ''
            meta.website = pkg.website
        } catch {}

        this.devProviders.set(id, { distPath: absPath, meta })
        this.installedIds = [...new Set([...this.installedIds, id])]

        this.reloadDevBack(id, backPath, registeredProviders)

        fs.watchFile(backPath, { persistent: false, interval: 500 }, (curr, prev) => {
            if (curr.mtimeMs !== prev.mtimeMs) {
                logInfo(ELogComponent.CORE, `[dev] Provider '${id}' back.js changed — hot-reloading`)
                this.reloadDevBack(id, backPath, registeredProviders)
            }
        })

        logInfo(ELogComponent.CORE, `[dev] Provider '${id}' registered from ${absPath}`)
    }

    private reloadDevBack(id: string, backPath: string, registeredProviders: Map<string, TProviderConstructor>): void {
        try {
            const resolved = require.resolve(backPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const providerModule = require(backPath)
            const ProviderClass = providerModule.default ?? Object.values(providerModule).find(v => typeof v === 'function')
            if (ProviderClass) {
                registeredProviders.set(id, ProviderClass as TProviderConstructor)
                logInfo(ELogComponent.CORE, `[dev] Provider '${id}' backend reloaded`)
            }
            if (Array.isArray(providerModule.schema)) this.devSchemas.set(id, providerModule.schema)
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Provider '${id}' reload error: ${err}`)
        }
    }

    private async fetchJsFromSource(meta: IProviderMeta): Promise<string | undefined> {
        const cacheFile = path.join(os.tmpdir(), `kwirth-provider-${meta.id}-back.js`)
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') {
            logError(ELogComponent.CORE, `Provider '${meta.id}' back.js not stored and has no remote source — cannot recover`)
            return undefined
        }
        const tmpTgz = path.join(os.tmpdir(), `kwirth-provider-${meta.id}-src-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-provider-${meta.id}-src-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await this.downloadFile(meta.installedFrom, tmpTgz)
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            const content = fs.readFileSync(path.join(tmpDir, 'back.js'), 'utf-8')
            fs.writeFileSync(cacheFile, content)
            logInfo(ELogComponent.CORE, `Provider '${meta.id}' back.js fetched from source and cached`)
            return content
        } catch (err) {
            logError(ELogComponent.CORE, `Provider '${meta.id}' failed to fetch back.js from source: ${err}`)
            return undefined
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async listInstalled(): Promise<IProviderMeta[]> {
        const stored = (await this.configMaps.read('kwirth-providers-index', [])) as IProviderMeta[]
        const devMetas = Array.from(this.devProviders.entries()).map(([id, dev]) => {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(dev.distPath, 'package.json'), 'utf-8'))
                const hasFront = fs.existsSync(path.join(dev.distPath, 'front.js'))
                const hasSchema = this.devSchemas.has(id)
                return { ...dev.meta, name: pkg.name ?? id, displayName: pkg.displayName, version: pkg.version ?? 'dev', description: pkg.description ?? '', website: pkg.website, hasFront, hasSchema }
            } catch {
                return dev.meta
            }
        })
        return [...stored, ...devMetas]
    }

    async install(tarGzUrl: string, registeredProviders: Map<string, TProviderConstructor>, installedFrom?: string): Promise<IProviderMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-provider-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-provider-extract-${Date.now()}`)
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
                // try npmjs format (folder 'package' at top level)
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                backPath = path.join(tmpDir, 'back.js')
                if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) {
                    throw new Error('Invalid provider bundle: missing package.json or back.js')
                }
            }

            const meta: IProviderMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))

            if (this.installedIds.includes(meta.id))
                throw new Error(`Provider '${meta.id}' is already installed`)

            meta.installedFrom = installedFrom ?? tarGzUrl
            const backJs = fs.readFileSync(backPath, 'utf-8')

            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored) logInfo(ELogComponent.CORE, `Provider '${meta.id}' back.js (${Math.round(backCompressed.length / 1024)}KB) exceeds configmap limit — will fetch from source on startup`)

            const frontPath = path.join(tmpDir, 'front.js')
            meta.hasFront = fs.existsSync(frontPath)
            if (meta.hasFront) {
                const frontJs = fs.readFileSync(frontPath, 'utf-8')
                const frontCompressed = zlib.gzipSync(Buffer.from(frontJs, 'utf-8')).toString('base64')
                meta.frontStored = frontCompressed.length <= CONFIGMAP_SIZE_LIMIT
                if (meta.frontStored) await this.configMaps.write(`kwirth-provider-${meta.id}-front`, { code: frontCompressed, compressed: true })
                else logInfo(ELogComponent.CORE, `Provider '${meta.id}' front.js (${Math.round(frontCompressed.length / 1024)}KB) exceeds configmap limit`)
            }

            await this.configMaps.write(`kwirth-provider-${meta.id}-meta`, meta)
            if (meta.backStored) await this.configMaps.write(`kwirth-provider-${meta.id}-back`, { code: backCompressed, compressed: true })

            const index = (await this.configMaps.read('kwirth-providers-index', []) as IProviderMeta[]) || []
            const existingIdx = index.findIndex(p => p.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta
            else index.push(meta)
            await this.configMaps.write('kwirth-providers-index', index)
            if (!this.installedIds.includes(meta.id)) this.installedIds.push(meta.id)

            await this.loadBackProvider(meta.id, backJs, registeredProviders)

            try {
                const tmpModPath = path.join(os.tmpdir(), `kwirth-provider-${meta.id}-back.js`)
                const mod = require(tmpModPath)
                if (Array.isArray(mod.schema) && mod.schema.length > 0) {
                    await this.configMaps.write(`kwirth-provider-${meta.id}-schema`, mod.schema)
                    meta.hasSchema = true
                }
            } catch {}

            logInfo(ELogComponent.CORE, `Provider '${meta.id}' v${meta.version} installed`)
            return meta
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer, registeredProviders: Map<string, TProviderConstructor>): Promise<IProviderMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-provider-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, registeredProviders, 'local')
        } finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(id: string, registeredProviders: Map<string, TProviderConstructor>): Promise<void> {
        if (this.isDevProvider(id)) throw new Error(`Provider '${id}' is a dev provider and cannot be uninstalled`)
        const dev = this.devProviders.get(id)
        if (dev) fs.unwatchFile(path.join(dev.distPath, 'back.js'))
        registeredProviders.delete(id)
        this.installedIds = this.installedIds.filter(i => i !== id)

        const index = (await this.configMaps.read('kwirth-providers-index', []) as IProviderMeta[]) || []
        await this.configMaps.write('kwirth-providers-index', index.filter(p => p.id !== id))
        await this.configMaps.write(`kwirth-provider-${id}-meta`, null)
        await this.configMaps.write(`kwirth-provider-${id}-back`, null)
        await this.configMaps.write(`kwirth-provider-${id}-front`, null)
        await this.configMaps.write(`kwirth-provider-${id}-schema`, null)
        await this.configMaps.write(`kwirth-provider-${id}-config`, null)

        const cacheFile = path.join(os.tmpdir(), `kwirth-provider-${id}-back.js`)
        if (fs.existsSync(cacheFile)) fs.rmSync(cacheFile)

        logInfo(ELogComponent.CORE, `Provider '${id}' uninstalled`)
    }

    async loadAll(registeredProviders: Map<string, TProviderConstructor>): Promise<void> {
        const index = (await this.configMaps.read('kwirth-providers-index', []) as IProviderMeta[]) || []
        for (const meta of index) {
            try {
                let backJs: string | undefined
                if (meta.backStored === false) {
                    backJs = await this.fetchJsFromSource(meta)
                } else {
                    const backData = await this.configMaps.read(`kwirth-provider-${meta.id}-back`)
                    if (backData?.code)
                        backJs = backData.compressed ? zlib.gunzipSync(Buffer.from(backData.code, 'base64')).toString('utf-8') : backData.code
                }
                if (backJs) await this.loadBackProvider(meta.id, backJs, registeredProviders)
                else logError(ELogComponent.CORE, `Provider '${meta.id}' has no back.js — skipping`)
            } catch (err) {
                logError(ELogComponent.CORE, `Failed to load provider '${meta.id}': ${err}`)
            }
        }
    }

    private async loadBackProvider(id: string, backJs: string, registeredProviders: Map<string, TProviderConstructor>): Promise<void> {
        const tmpPath = path.join(os.tmpdir(), `kwirth-provider-${id}-back.js`)
        fs.writeFileSync(tmpPath, backJs)
        try {
            if (require.cache[require.resolve(tmpPath)]) delete require.cache[require.resolve(tmpPath)]
            const providerModule = require(tmpPath)
            const ProviderClass = providerModule.default ?? Object.values(providerModule).find(v => typeof v === 'function')
            if (ProviderClass) {
                registeredProviders.set(id, ProviderClass as TProviderConstructor)
                logInfo(ELogComponent.CORE, `Provider '${id}' backend registered`)
            } else {
                logError(ELogComponent.CORE, `Provider '${id}' back.js exports no provider class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Error loading provider '${id}' backend: ${err}`)
        }
    }

    providerHasFront(id: string): boolean {
        const dev = this.devProviders.get(id)
        if (dev) return fs.existsSync(path.join(dev.distPath, 'front.js'))
        // installed: hasFront set during install
        return false
    }

    async getFrontJs(id: string): Promise<string | undefined> {
        const dev = this.devProviders.get(id)
        if (dev) {
            try { return fs.readFileSync(path.join(dev.distPath, 'front.js'), 'utf-8') } catch { return undefined }
        }
        const cacheFile = path.join(os.tmpdir(), `kwirth-provider-${id}-front.js`)
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        const data = await this.configMaps.read(`kwirth-provider-${id}-front`)
        if (data?.code) {
            const content = data.compressed ? zlib.gunzipSync(Buffer.from(data.code, 'base64')).toString('utf-8') : data.code
            fs.writeFileSync(cacheFile, content)
            return content
        }
        return undefined
    }

    async getSchemaAsync(id: string): Promise<IProviderSchemaField[] | undefined> {
        const devSchema = this.devSchemas.get(id)
        if (devSchema) return devSchema
        const stored = await this.configMaps.read(`kwirth-provider-${id}-schema`)
        return Array.isArray(stored) ? stored as IProviderSchemaField[] : undefined
    }

    async getConfig(id: string): Promise<Record<string, unknown>> {
        const data = await this.configMaps.read(`kwirth-provider-${id}-config`, {})
        return (data ?? {}) as Record<string, unknown>
    }

    async saveConfig(id: string, cfg: Record<string, unknown>): Promise<void> {
        await this.configMaps.write(`kwirth-provider-${id}-config`, cfg)
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
