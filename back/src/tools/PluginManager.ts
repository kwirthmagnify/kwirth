import { IConfigMaps } from './IConfigMap'
import { TChannelConstructor } from '../channels/IChannel'
import { ELogComponent, logError, logInfo } from './Logging'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'

export interface IPluginMeta {
    id: string
    name: string
    version: string
    description: string
    icon?: string
}

export class PluginManager {
    private configMaps: IConfigMaps
    private installedIds: string[] = []

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

    async listInstalled(): Promise<IPluginMeta[]> {
        return (await this.configMaps.read('kwirth-plugins-index', [])) as IPluginMeta[]
    }

    async install(tarGzUrl: string, registeredChannels: Map<string, TChannelConstructor>): Promise<IPluginMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-plugin-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-plugin-extract-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })

        try {
            await this.downloadFile(tarGzUrl, tmpTgz)
            await tar.x({ file: tmpTgz, cwd: tmpDir })

            const metaPath = path.join(tmpDir, 'package.json')
            const backPath = path.join(tmpDir, 'back.js')
            const frontPath = path.join(tmpDir, 'front.js')

            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath) || !fs.existsSync(frontPath))
                throw new Error('Invalid plugin bundle: missing package.json, back.js or front.js')

            const meta: IPluginMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            const backJs = fs.readFileSync(backPath, 'utf-8')
            const frontJs = fs.readFileSync(frontPath, 'utf-8')

            await this.configMaps.write(`kwirth-plugin-${meta.id}-meta`, meta)
            await this.configMaps.write(`kwirth-plugin-${meta.id}-back`, { code: backJs })
            await this.configMaps.write(`kwirth-plugin-${meta.id}-front`, { code: frontJs })

            const index = await this.listInstalled()
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

    async uninstall(id: string, registeredChannels: Map<string, TChannelConstructor>): Promise<void> {
        registeredChannels.delete(id)
        this.installedIds = this.installedIds.filter(i => i !== id)

        const index = await this.listInstalled()
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
                    await this.loadBackPlugin(meta.id, backData.code, registeredChannels)
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
        return data?.code
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
