import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo } from './Logging'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'
import zlib from 'zlib'

export interface IThemeMeta {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    frontStored?: boolean
    hasPreview?: boolean
    requiresRestart?: boolean
    requiresExtension?: string[]
}

const CONFIGMAP_SIZE_LIMIT = 800 * 1024

interface IDevTheme {
    distPath: string
    meta: IThemeMeta
}

export class ThemeManager {
    private configMaps: IConfigMaps
    private installedIds: string[] = []
    private cachedIndex: IThemeMeta[] = []
    private devThemes = new Map<string, IDevTheme>()

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    async init(): Promise<void> {
        const index = await this.configMaps.read('kwirth-themes-index', []) as IThemeMeta[]
        this.cachedIndex = index || []
        this.installedIds = this.cachedIndex.map(t => t.id)
    }

    getInstalledIds(): string[] {
        return this.installedIds
    }

    isDevTheme(id: string): boolean {
        return this.devThemes.has(id)
    }

    getDevFrontJs(id: string): string | undefined {
        const dev = this.devThemes.get(id)
        if (!dev) return undefined
        try { return fs.readFileSync(path.join(dev.distPath, 'front.js'), 'utf-8') } catch { return undefined }
    }

    getDevPreviewPng(id: string): Buffer | undefined {
        const dev = this.devThemes.get(id)
        if (!dev) return undefined
        const p = path.join(dev.distPath, 'preview.png')
        try { return fs.existsSync(p) ? fs.readFileSync(p) : undefined } catch { return undefined }
    }

    loadDevThemes(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const themesMap: Record<string, string> = raw.themes ?? {}
            for (const [id, distPath] of Object.entries(themesMap)) {
                if (typeof distPath === 'string') this.registerDevTheme(id, distPath)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json themes: ${err}`)
        }
    }

    private registerDevTheme(id: string, distPath: string): void {
        const absPath = path.resolve(distPath)
        const metaPath = path.join(absPath, 'package.json')
        const meta: IThemeMeta = { id, name: id, displayName: id, version: 'dev', description: 'dev theme', installedFrom: 'dev' }
        try {
            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            meta.name = pkg.name ?? id
            meta.displayName = pkg.displayName ?? id
            meta.version = pkg.version ?? 'dev'
            meta.description = pkg.description ?? ''
            meta.website = pkg.website
            meta.hasPreview = fs.existsSync(path.join(absPath, 'preview.png'))
        } catch {}
        this.devThemes.set(id, { distPath: absPath, meta })
        if (!this.installedIds.includes(id)) this.installedIds.push(id)
        logInfo(ELogComponent.CORE, `[dev] Theme '${id}' registered from ${absPath}`)
    }

    async listInstalled(): Promise<IThemeMeta[]> {
        const stored = (await this.configMaps.read('kwirth-themes-index', [])) as IThemeMeta[]
        const devMetas = Array.from(this.devThemes.entries()).map(([id, dev]) => {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(dev.distPath, 'package.json'), 'utf-8'))
                return { ...dev.meta, name: pkg.name ?? id, displayName: pkg.displayName ?? id, version: pkg.version ?? 'dev', description: pkg.description ?? '', website: pkg.website, hasPreview: fs.existsSync(path.join(dev.distPath, 'preview.png')) }
            } catch { return dev.meta }
        })
        const devIds = new Set(devMetas.map(m => m.id))
        return [...stored.filter(t => !devIds.has(t.id)), ...devMetas]
    }

    async install(tarGzUrl: string, installedFrom?: string): Promise<IThemeMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-theme-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-theme-extract-${Date.now()}`)
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
                    throw new Error('Invalid theme bundle: missing package.json or front.js')
                }
            }

            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            const meta: IThemeMeta = {
                id: pkg.id ?? pkg.name.split('/').pop(),
                name: pkg.name,
                displayName: pkg.displayName ?? pkg.id ?? pkg.name.split('/').pop(),
                version: pkg.version,
                description: pkg.description ?? '',
                website: pkg.website,
                installedFrom: installedFrom ?? tarGzUrl,
                requiresRestart: pkg.requiresRestart ?? false,
                requiresExtension: pkg.requiresExtension ?? []
            }

            if (this.installedIds.includes(meta.id))
                throw new Error(`Theme '${meta.id}' is already installed`)

            const frontJs = fs.readFileSync(frontPath, 'utf-8')
            const frontCompressed = zlib.gzipSync(Buffer.from(frontJs, 'utf-8')).toString('base64')
            meta.frontStored = frontCompressed.length <= CONFIGMAP_SIZE_LIMIT

            await this.configMaps.write(`kwirth-theme-${meta.id}`, { meta, code: meta.frontStored ? frontCompressed : undefined, compressed: true })

            const previewPath = path.join(tmpDir, 'preview.png')
            if (fs.existsSync(previewPath)) {
                const previewBuf = fs.readFileSync(previewPath)
                const previewB64 = previewBuf.toString('base64')
                if (previewB64.length <= CONFIGMAP_SIZE_LIMIT) {
                    await this.configMaps.write(`kwirth-theme-${meta.id}-preview`, { data: previewB64 })
                    meta.hasPreview = true
                }
            }

            const index = (await this.configMaps.read('kwirth-themes-index', []) as IThemeMeta[]) || []
            const existingIdx = index.findIndex(t => t.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta
            else index.push(meta)
            await this.configMaps.write('kwirth-themes-index', index)
            if (!this.installedIds.includes(meta.id)) this.installedIds.push(meta.id)

            logInfo(ELogComponent.CORE, `Theme '${meta.id}' v${meta.version} installed`)
            return meta
        } finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IThemeMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-theme-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        } finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(id: string): Promise<void> {
        if (this.isDevTheme(id)) throw new Error(`Theme '${id}' is a dev theme and cannot be uninstalled`)
        const index = (await this.configMaps.read('kwirth-themes-index', []) as IThemeMeta[]) || []
        const meta = index.find(t => t.id === id)
        if (meta?.installedFrom?.startsWith('pack:')) throw new Error(`Theme '${id}' was installed by pack '${meta.installedFrom.slice(5)}' — uninstall the pack instead`)
        await this._doUninstall(id, index)
    }

    async uninstallFromPack(id: string): Promise<void> {
        const index = (await this.configMaps.read('kwirth-themes-index', []) as IThemeMeta[]) || []
        await this._doUninstall(id, index)
    }

    private async _doUninstall(id: string, index: IThemeMeta[]): Promise<void> {
        this.installedIds = this.installedIds.filter(i => i !== id)
        await this.configMaps.write('kwirth-themes-index', index.filter(t => t.id !== id))
        await this.configMaps.write(`kwirth-theme-${id}`, null)
        await this.configMaps.write(`kwirth-theme-${id}-preview`, null)
        const cacheFile = path.join(os.tmpdir(), `kwirth-theme-${id}-front.js`)
        if (fs.existsSync(cacheFile)) fs.rmSync(cacheFile)
        logInfo(ELogComponent.CORE, `Theme '${id}' uninstalled`)
    }

    async getFrontJs(id: string): Promise<string | undefined> {
        const data = await this.configMaps.read(`kwirth-theme-${id}`) as { meta: IThemeMeta; code?: string; compressed?: boolean } | null
        if (!data?.meta) return undefined
        if (data.meta.frontStored === false) return this.fetchJsFromSource(data.meta)
        if (!data.code) return undefined
        if (data.compressed) return zlib.gunzipSync(Buffer.from(data.code, 'base64')).toString('utf-8')
        return data.code
    }

    async getPreviewPng(id: string): Promise<Buffer | undefined> {
        const data = await this.configMaps.read(`kwirth-theme-${id}-preview`) as { data?: string } | null
        if (!data?.data) return undefined
        return Buffer.from(data.data, 'base64')
    }

    private async fetchJsFromSource(meta: IThemeMeta): Promise<string | undefined> {
        const cacheFile = path.join(os.tmpdir(), `kwirth-theme-${meta.id}-front.js`)
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') return undefined
        const tmpTgz = path.join(os.tmpdir(), `kwirth-theme-${meta.id}-src-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-theme-${meta.id}-src-${Date.now()}`)
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
            logError(ELogComponent.CORE, `Theme '${meta.id}' failed to fetch front.js from source: ${err}`)
            return undefined
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async getAssignments(): Promise<Record<string, string>> {
        return ((await this.configMaps.read('kwirth-theme-assignments', {})) as Record<string, string>) || {}
    }

    async setAssignments(assignments: Record<string, string>): Promise<void> {
        await this.configMaps.write('kwirth-theme-assignments', assignments)
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
