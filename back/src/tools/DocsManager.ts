import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'

export interface IDocsMeta {
    id: string
    targetType: string
    name: string
    version: string
    description: string
    icon?: string
    website?: string
    installedFrom?: string
}

export class DocsManager {
    private configMaps: IConfigMaps
    private cachedIndex: IDocsMeta[] = []
    private docsPath: string

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
        this.docsPath = process.env.KWIRTH_DOCS_PATH || path.join(os.tmpdir(), 'kwirth-docs')
        fs.mkdirSync(this.docsPath, { recursive: true })
    }

    async init(): Promise<void> {
        const index = await this.configMaps.read('kwirth-docs-index', []) as IDocsMeta[]
        this.cachedIndex = index || []
    }

    getDocsDir(targetType: string, id: string): string | undefined {
        const dir = path.join(this.docsPath, targetType, id)
        return fs.existsSync(dir) ? dir : undefined
    }

    async listInstalled(): Promise<IDocsMeta[]> {
        return (await this.configMaps.read('kwirth-docs-index', [])) as IDocsMeta[] || []
    }

    async install(tarGzUrl: string, installedFrom?: string): Promise<IDocsMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-docs-${Date.now()}.tgz`)
        const isLocalPath = tarGzUrl.startsWith('file://') || (!tarGzUrl.startsWith('http://') && !tarGzUrl.startsWith('https://'))

        try {
            if (isLocalPath) {
                const localPath = tarGzUrl.startsWith('file://') ? new URL(tarGzUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1') : tarGzUrl
                fs.copyFileSync(localPath, tmpTgz)
            }
            else {
                await this.downloadFile(tarGzUrl, tmpTgz)
            }

            const peekDir = path.join(os.tmpdir(), `kwirth-docs-peek-${Date.now()}`)
            fs.mkdirSync(peekDir, { recursive: true })
            try {
                await tar.x({ file: tmpTgz, cwd: peekDir, filter: (p: string) => p.endsWith('package.json') })
                let metaPath = path.join(peekDir, 'package.json')
                let stripLevel = 0
                if (!fs.existsSync(metaPath)) {
                    metaPath = path.join(peekDir, 'package', 'package.json')
                    stripLevel = 1
                }
                if (!fs.existsSync(metaPath)) throw new Error('Invalid docs bundle: missing package.json')
                const meta: IDocsMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
                if (!meta.targetType) throw new Error(`Invalid docs bundle: missing targetType in package.json`)

                const index = (await this.configMaps.read('kwirth-docs-index', []) as IDocsMeta[]) || []
                const existing = index.find(d => d.targetType === meta.targetType && d.id === meta.id)
                if (existing && installedFrom !== 'bundled' && installedFrom !== 'dev') throw new Error(`Docs '${meta.targetType}/${meta.id}' is already installed`)

                const destDir = path.join(this.docsPath, meta.targetType, meta.id)
                if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
                fs.mkdirSync(destDir, { recursive: true })
                await tar.x({ file: tmpTgz, cwd: destDir, strip: stripLevel })

                meta.installedFrom = installedFrom ?? tarGzUrl
                const updatedIndex = [...index.filter(d => !(d.targetType === meta.targetType && d.id === meta.id)), meta]
                await this.configMaps.write('kwirth-docs-index', updatedIndex)
                this.cachedIndex = updatedIndex

                logInfo(ELogComponent.CORE, `Docs '${meta.targetType}/${meta.id}' v${meta.version} installed`)
                return meta
            }
            finally {
                fs.rmSync(peekDir, { recursive: true, force: true })
            }
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IDocsMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-docs-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(targetType: string, id: string): Promise<void> {
        const index = (await this.configMaps.read('kwirth-docs-index', []) as IDocsMeta[]) || []
        const meta = index.find(d => d.targetType === targetType && d.id === id)
        if (meta?.installedFrom === 'bundled' || meta?.installedFrom === 'dev') throw new Error(`Docs '${targetType}/${id}' is bundled/dev and cannot be uninstalled`)

        const destDir = path.join(this.docsPath, targetType, id)
        if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
        const updatedIndex = index.filter(d => !(d.targetType === targetType && d.id === id))
        await this.configMaps.write('kwirth-docs-index', updatedIndex)
        this.cachedIndex = updatedIndex
        logInfo(ELogComponent.CORE, `Docs '${targetType}/${id}' uninstalled`)
    }

    async installBundled(dir: string): Promise<void> {
        if (!fs.existsSync(dir)) return
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.tgz'))
        for (const file of files) {
            const filePath = path.join(dir, file)
            let bundleId: string | undefined
            let bundleTargetType: string | undefined
            let bundleVersion: string | undefined
            try {
                const peekTmp = path.join(os.tmpdir(), `kwirth-docs-bv-${path.basename(file, '.tgz')}`)
                fs.mkdirSync(peekTmp, { recursive: true })
                await tar.x({ file: filePath, cwd: peekTmp, filter: (p: string) => p.endsWith('package.json') })
                const pkgCandidates = [path.join(peekTmp, 'package.json'), path.join(peekTmp, 'package', 'package.json')]
                const pkgPath = pkgCandidates.find(p => fs.existsSync(p))
                if (pkgPath) {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
                    bundleId = pkg.id
                    bundleTargetType = pkg.targetType
                    bundleVersion = pkg.version
                }
                fs.rmSync(peekTmp, { recursive: true, force: true })
            }
            catch {}

            const existing = bundleId && bundleTargetType ? this.cachedIndex.find(d => d.targetType === bundleTargetType && d.id === bundleId) : undefined
            if (existing && bundleVersion && existing.version === bundleVersion) {
                logInfo(ELogComponent.CORE, `Bundled docs '${bundleTargetType}/${bundleId}' v${bundleVersion} up to date — skipping`)
                continue
            }
            try {
                const meta = await this.install(filePath, 'bundled')
                logInfo(ELogComponent.CORE, `Bundled docs '${meta.targetType}/${meta.id}' v${meta.version} installed`)
            }
            catch (err: any) {
                if (err?.message?.includes('already installed'))
                    logInfo(ELogComponent.CORE, `Bundled docs '${file}' already installed — skipping`)
                else
                    logError(ELogComponent.CORE, `Failed to install bundled docs '${file}': ${err}`)
            }
        }
    }

    // Re-downloads and extracts a docs package from its source URL into docsPath.
    // Only runs for URL-installed docs; bundled docs are handled by installBundled().
    // Locally-uploaded docs (installedFrom === 'local') cannot be re-hydrated.
    private async rehydrate(meta: IDocsMeta): Promise<void> {
        if (!meta.installedFrom || meta.installedFrom === 'local') {
            logWarning(ELogComponent.CORE, `Docs '${meta.targetType}/${meta.id}' was installed from a local file and cannot be restored — reinstall manually`)
            return
        }
        if (meta.installedFrom === 'bundled') return  // handled by installBundled()
        if (meta.installedFrom === 'dev') return      // handled by loadDevDocs()

        const tmpTgz = path.join(os.tmpdir(), `kwirth-docs-rehydrate-${meta.id}.tgz`)
        const peekDir = path.join(os.tmpdir(), `kwirth-docs-rehydrate-peek-${meta.id}`)
        try {
            await this.downloadFile(meta.installedFrom, tmpTgz)
            fs.mkdirSync(peekDir, { recursive: true })
            await tar.x({ file: tmpTgz, cwd: peekDir, filter: (p: string) => p.endsWith('package.json') })
            const strip = fs.existsSync(path.join(peekDir, 'package.json')) ? 0 : 1
            const destDir = path.join(this.docsPath, meta.targetType, meta.id)
            if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true, force: true })
            fs.mkdirSync(destDir, { recursive: true })
            await tar.x({ file: tmpTgz, cwd: destDir, strip })
            logInfo(ELogComponent.CORE, `Docs '${meta.targetType}/${meta.id}' v${meta.version} rehydrated from ${meta.installedFrom}`)
        }
        catch (err) {
            logError(ELogComponent.CORE, `Failed to rehydrate docs '${meta.targetType}/${meta.id}': ${err}`)
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
            if (fs.existsSync(peekDir)) fs.rmSync(peekDir, { recursive: true, force: true })
        }
    }

    loadDevDocs(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
        const entries = Object.entries(raw.docs ?? {})
        if (entries.length === 0) return
        ;(async () => {
            for (const [label, tgzPath] of entries) {
                const resolved = path.resolve(process.cwd(), tgzPath as string)
                if (!fs.existsSync(resolved)) {
                    logWarning(ELogComponent.CORE, `[dev] Docs '${label}' tgz not found at ${resolved} — run 'npm run build' in back/ first`)
                    continue
                }
                try {
                    const meta = await this.install(resolved, 'dev')
                    logInfo(ELogComponent.CORE, `[dev] Docs '${meta.targetType}/${meta.id}' v${meta.version} installed`)
                }
                catch (err) {
                    if ((err as Error)?.message?.includes('already installed'))
                        logInfo(ELogComponent.CORE, `[dev] Docs '${label}' already installed — skipping`)
                    else
                        logError(ELogComponent.CORE, `[dev] Failed to install docs '${label}': ${err}`)
                }
            }
        })().catch(err => logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (docs): ${err}`))
    }

    // On startup, re-downloads all URL-installed docs whose filesystem dir is missing.
    // In k8s /tmp is ephemeral so all URL-installed docs need rehydration after restart.
    async loadAll(): Promise<void> {
        for (const meta of this.cachedIndex) {
            const destDir = path.join(this.docsPath, meta.targetType, meta.id)
            if (fs.existsSync(destDir)) continue
            await this.rehydrate(meta)
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
