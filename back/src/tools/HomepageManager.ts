import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo } from './Logging'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'
import zlib from 'zlib'

export interface IHomepageMeta {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    frontStored?: boolean
    hasPreview?: boolean
}

const CONFIGMAP_SIZE_LIMIT = 800 * 1024

interface IDevHomepage {
    distPath: string
    meta: IHomepageMeta
}

export class HomepageManager {
    private configMaps: IConfigMaps
    private installedIds: string[] = []
    private cachedIndex: IHomepageMeta[] = []
    private devHomepages = new Map<string, IDevHomepage>()

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    async init(): Promise<void> {
        const index = await this.configMaps.read('kwirth-homepages-index', []) as IHomepageMeta[]
        this.cachedIndex = index || []
        this.installedIds = this.cachedIndex.map(t => t.id)
    }

    getInstalledIds(): string[] {
        return this.installedIds
    }

    isDevHomepage(id: string): boolean {
        return this.devHomepages.has(id)
    }

    getDevFrontJs(id: string): string | undefined {
        const dev = this.devHomepages.get(id)
        if (!dev) return undefined
        try { return fs.readFileSync(path.join(dev.distPath, 'front.js'), 'utf-8') } catch { return undefined }
    }

    getDevPreviewPng(id: string): Buffer | undefined {
        const dev = this.devHomepages.get(id)
        if (!dev) return undefined
        const p = path.join(dev.distPath, 'preview.png')
        try { return fs.existsSync(p) ? fs.readFileSync(p) : undefined } catch { return undefined }
    }

    loadDevHomepages(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const homepagesMap: Record<string, string> = raw.homepages ?? {}
            for (const [id, distPath] of Object.entries(homepagesMap)) {
                if (typeof distPath === 'string') this.registerDevHomepage(id, distPath)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json homepages: ${err}`)
        }
    }

    private registerDevHomepage(id: string, distPath: string): void {
        const absPath = path.resolve(distPath)
        const metaPath = path.join(absPath, 'package.json')
        const meta: IHomepageMeta = { id, name: id, displayName: id, version: 'dev', description: 'dev homepage', installedFrom: 'dev' }
        try {
            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            meta.name = pkg.name ?? id
            meta.displayName = pkg.displayName ?? id
            meta.version = pkg.version ?? 'dev'
            meta.description = pkg.description ?? ''
            meta.website = pkg.website
            meta.hasPreview = fs.existsSync(path.join(absPath, 'preview.png'))
        } catch {}
        this.devHomepages.set(id, { distPath: absPath, meta })
        if (!this.installedIds.includes(id)) this.installedIds.push(id)
        logInfo(ELogComponent.CORE, `[dev] Homepage '${id}' registered from ${absPath}`)
    }

    async listInstalled(): Promise<IHomepageMeta[]> {
        const stored = (await this.configMaps.read('kwirth-homepages-index', [])) as IHomepageMeta[]
        const devMetas = Array.from(this.devHomepages.entries()).map(([id, dev]) => {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(dev.distPath, 'package.json'), 'utf-8'))
                return { ...dev.meta, name: pkg.name ?? id, displayName: pkg.displayName ?? id, version: pkg.version ?? 'dev', description: pkg.description ?? '', website: pkg.website, hasPreview: fs.existsSync(path.join(dev.distPath, 'preview.png')) }
            } catch { return dev.meta }
        })
        const devIds = new Set(devMetas.map(m => m.id))
        return [...stored.filter(t => !devIds.has(t.id)), ...devMetas]
    }

    async install(tarGzUrl: string, installedFrom?: string): Promise<IHomepageMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-homepage-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-homepage-extract-${Date.now()}`)
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
            let frontPath = path.join(tmpDir, 'front.js')

            if (!fs.existsSync(metaPath) || !fs.existsSync(frontPath)) {
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                frontPath = path.join(tmpDir, 'front.js')
                if (!fs.existsSync(metaPath) || !fs.existsSync(frontPath)) {
                    throw new Error('Invalid homepage bundle: missing package.json or front.js')
                }
            }

            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            const meta: IHomepageMeta = {
                id: pkg.id ?? pkg.name.split('/').pop(),
                name: pkg.name,
                displayName: pkg.displayName ?? pkg.id ?? pkg.name.split('/').pop(),
                version: pkg.version,
                description: pkg.description ?? '',
                website: pkg.website,
                installedFrom: installedFrom ?? tarGzUrl
            }

            if (this.installedIds.includes(meta.id))
                throw new Error(`Homepage '${meta.id}' is already installed`)

            const frontJs = fs.readFileSync(frontPath, 'utf-8')
            const frontCompressed = zlib.gzipSync(Buffer.from(frontJs, 'utf-8')).toString('base64')
            meta.frontStored = frontCompressed.length <= CONFIGMAP_SIZE_LIMIT

            await this.configMaps.write(`kwirth-homepage-${meta.id}`, { meta, code: meta.frontStored ? frontCompressed : undefined, compressed: true })

            const previewPath = path.join(tmpDir, 'preview.png')
            if (fs.existsSync(previewPath)) {
                const previewBuf = fs.readFileSync(previewPath)
                const previewB64 = previewBuf.toString('base64')
                if (previewB64.length <= CONFIGMAP_SIZE_LIMIT) {
                    await this.configMaps.write(`kwirth-homepage-${meta.id}-preview`, { data: previewB64 })
                    meta.hasPreview = true
                }
            }

            const index = (await this.configMaps.read('kwirth-homepages-index', []) as IHomepageMeta[]) || []
            const existingIdx = index.findIndex(t => t.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta
            else index.push(meta)
            await this.configMaps.write('kwirth-homepages-index', index)
            if (!this.installedIds.includes(meta.id)) this.installedIds.push(meta.id)

            logInfo(ELogComponent.CORE, `Homepage '${meta.id}' v${meta.version} installed`)
            return meta
        } finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IHomepageMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-homepage-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        } finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(id: string): Promise<void> {
        if (this.isDevHomepage(id)) throw new Error(`Homepage '${id}' is a dev homepage and cannot be uninstalled`)
        const index = (await this.configMaps.read('kwirth-homepages-index', []) as IHomepageMeta[]) || []
        const meta = index.find(t => t.id === id)
        if (meta?.installedFrom?.startsWith('pack:')) throw new Error(`Homepage '${id}' was installed by pack '${meta.installedFrom.slice(5)}' — uninstall the pack instead`)
        await this._doUninstall(id, index)
    }

    async uninstallFromPack(id: string): Promise<void> {
        const index = (await this.configMaps.read('kwirth-homepages-index', []) as IHomepageMeta[]) || []
        await this._doUninstall(id, index)
    }

    private async _doUninstall(id: string, index: IHomepageMeta[]): Promise<void> {
        this.installedIds = this.installedIds.filter(i => i !== id)
        await this.configMaps.write('kwirth-homepages-index', index.filter(t => t.id !== id))
        await this.configMaps.write(`kwirth-homepage-${id}`, null)
        await this.configMaps.write(`kwirth-homepage-${id}-preview`, null)
        const cacheFile = path.join(os.tmpdir(), `kwirth-homepage-${id}-front.js`)
        if (fs.existsSync(cacheFile)) fs.rmSync(cacheFile)
        logInfo(ELogComponent.CORE, `Homepage '${id}' uninstalled`)
    }

    async getFrontJs(id: string): Promise<string | undefined> {
        const data = await this.configMaps.read(`kwirth-homepage-${id}`) as { meta: IHomepageMeta; code?: string; compressed?: boolean } | null
        if (!data?.meta) return undefined
        if (data.meta.frontStored === false) return this.fetchJsFromSource(data.meta)
        if (!data.code) return undefined
        if (data.compressed) return zlib.gunzipSync(Buffer.from(data.code, 'base64')).toString('utf-8')
        return data.code
    }

    async getPreviewPng(id: string): Promise<Buffer | undefined> {
        const data = await this.configMaps.read(`kwirth-homepage-${id}-preview`) as { data?: string } | null
        if (!data?.data) return undefined
        return Buffer.from(data.data, 'base64')
    }

    private async fetchJsFromSource(meta: IHomepageMeta): Promise<string | undefined> {
        const cacheFile = path.join(os.tmpdir(), `kwirth-homepage-${meta.id}-front.js`)
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') return undefined
        const tmpTgz = path.join(os.tmpdir(), `kwirth-homepage-${meta.id}-src-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-homepage-${meta.id}-src-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await this.downloadFile(meta.installedFrom, tmpTgz)
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            let frontPath = path.join(tmpDir, 'front.js')
            if (!fs.existsSync(frontPath)) frontPath = path.join(tmpDir, 'package', 'front.js')
            const content = fs.readFileSync(frontPath, 'utf-8')
            fs.writeFileSync(cacheFile, content)
            return content
        } catch (err) {
            logError(ELogComponent.CORE, `Homepage '${meta.id}' failed to fetch front.js from source: ${err}`)
            return undefined
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
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
