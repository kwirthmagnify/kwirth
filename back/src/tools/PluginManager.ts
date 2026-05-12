import { IConfigMaps } from './IConfigMap'
import { TChannelConstructor } from '../channels/IChannel'
import { ELogComponent, logError, logInfo } from './Logging'
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
}

interface IDevPlugin {
    distPath: string
    meta: IPluginMeta
}

export class PluginManager {
    private configMaps: IConfigMaps
    private installedIds: string[] = []
    private devPlugins = new Map<string, IDevPlugin>()

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    async init(): Promise<void> {
        const index = await this.configMaps.read('kwirth-plugins-index', []) as IPluginMeta[]
        this.installedIds = (index || []).map(p => p.id)
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
            const devConfig = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8')) as Record<string, string>
            for (const [id, distPath] of Object.entries(devConfig)) {
                this.registerDevPlugin(id, distPath, registeredChannels)
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
            fs.watch(backPath, { persistent: false }, () => {
                logInfo(ELogComponent.CORE, `[dev] Plugin '${id}' back.js changed — hot-reloading`)
                this.reloadDevBack(id, backPath, registeredChannels)
            })
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Cannot watch '${backPath}': ${err}`)
        }

        logInfo(ELogComponent.CORE, `[dev] Plugin '${id}' registered from ${absPath}`)
    }

    private reloadDevBack(id: string, backPath: string, registeredChannels: Map<string, TChannelConstructor>): void {
        try {
            const resolved = require.resolve(backPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const pluginModule = require(backPath)
            const ChannelClass = pluginModule.default ?? Object.values(pluginModule).find(v => typeof v === 'function')
            if (ChannelClass) {
                registeredChannels.set(id, ChannelClass as TChannelConstructor)
                logInfo(ELogComponent.CORE, `[dev] Plugin '${id}' backend channel reloaded`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Plugin '${id}' reload error: ${err}`)
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
        return [...stored, ...devMetas]
    }

    async install(tarGzUrl: string, registeredChannels: Map<string, TChannelConstructor>, installedFrom?: string): Promise<IPluginMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-plugin-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-plugin-extract-${Date.now()}`)
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

            const metaPath = path.join(tmpDir, 'package.json')
            const backPath = path.join(tmpDir, 'back.js')
            const frontPath = path.join(tmpDir, 'front.js')

            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath) || !fs.existsSync(frontPath))
                throw new Error('Invalid plugin bundle: missing package.json, back.js or front.js')

            const meta: IPluginMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            meta.installedFrom = installedFrom ?? tarGzUrl
            const backJs = fs.readFileSync(backPath, 'utf-8')
            const frontJs = fs.readFileSync(frontPath, 'utf-8')

            await this.configMaps.write(`kwirth-plugin-${meta.id}-meta`, meta)
            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            await this.configMaps.write(`kwirth-plugin-${meta.id}-back`, { code: backCompressed, compressed: true })
            const frontCompressed = zlib.gzipSync(Buffer.from(frontJs, 'utf-8')).toString('base64')
            await this.configMaps.write(`kwirth-plugin-${meta.id}-front`, { code: frontCompressed, compressed: true })

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
        registeredChannels.delete(id)
        this.installedIds = this.installedIds.filter(i => i !== id)

        const index = (await this.configMaps.read('kwirth-plugins-index', []) as IPluginMeta[]) || []
        await this.configMaps.write('kwirth-plugins-index', index.filter(p => p.id !== id))
        await this.configMaps.write(`kwirth-plugin-${id}-meta`, null)
        await this.configMaps.write(`kwirth-plugin-${id}-back`, null)
        await this.configMaps.write(`kwirth-plugin-${id}-front`, null)

        const tmpPath = path.join(os.tmpdir(), `kwirth-plugin-${id}-back.js`)
        if (fs.existsSync(tmpPath)) fs.rmSync(tmpPath)

        logInfo(ELogComponent.CORE, `Plugin '${id}' uninstalled`)
    }

    async loadAll(registeredChannels: Map<string, TChannelConstructor>): Promise<void> {
        const index = await this.listInstalled()
        for (const meta of index) {
            try {
                const backData = await this.configMaps.read(`kwirth-plugin-${meta.id}-back`)
                if (backData?.code) {
                    const backJs = backData.compressed ? zlib.gunzipSync(Buffer.from(backData.code, 'base64')).toString('utf-8') : backData.code
                    await this.loadBackPlugin(meta.id, backJs, registeredChannels)
                } else {
                    logError(ELogComponent.CORE, `Plugin '${meta.id}' has no stored back.js — skipping`)
                }
            } catch (err) {
                logError(ELogComponent.CORE, `Failed to load plugin '${meta.id}': ${err}`)
            }
        }
    }

    async getFrontJs(id: string): Promise<string | undefined> {
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
