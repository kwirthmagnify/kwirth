import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo } from './Logging'
import { ILoginFieldDef } from '@kwirthmagnify/kwirth-common-back'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { listBundledOfType } from './BundledExtensions'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import https from 'https'
import http from 'http'

export interface ILoginMeta {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    requiresRestart?: boolean
    requiresExtension?: string[]
    configSchema?: ILoginFieldDef[]
}

export interface ILoginConfig {
    top?: string
    left?: string
    width?: string
    height?: string
    pageBackground?: string
    dialogBackground?: string
    textColor?: string
    title?: string
    userLabel?: string
    passwordLabel?: string
    newPasswordLabel?: string
    repeatPasswordLabel?: string
    changePasswordMessage?: string
    changePasswordButton?: string
    okButton?: string
    orSeparator?: string
    idpButton?: string
    startChannel?: string
    allowedIdps?: string[]
    autoUser?: string
    autoPassword?: string
}

const CONFIGMAP_SIZE_LIMIT = 800 * 1024

export class LoginManager {
    private configMaps: IConfigMaps
    private cachedIndex: ILoginMeta[] = []
    private devLogins = new Map<string, { tgzPath: string; meta: ILoginMeta }>()

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    async init(): Promise<void> {
        const index = await this.configMaps.read('kwirth-logins-index', []) as ILoginMeta[]
        this.cachedIndex = index || []
    }

    async listInstalled(): Promise<ILoginMeta[]> {
        const stored = (await this.configMaps.read('kwirth-logins-index', [])) as ILoginMeta[]
        const devMetas = Array.from(this.devLogins.values()).map(d => d.meta)
        const devIds = new Set(devMetas.map(m => m.id))
        return [...stored.filter(m => !devIds.has(m.id)), ...devMetas]
    }

    isDevLogin(id: string): boolean {
        return this.devLogins.has(id)
    }

    async install(tarGzUrl: string, installedFrom?: string): Promise<ILoginMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-login-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-login-extract-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })

        const isLocalPath = tarGzUrl.startsWith('file://') || (!tarGzUrl.startsWith('http://') && !tarGzUrl.startsWith('https://'))

        try {
            if (isLocalPath) {
                const localPath = tarGzUrl.startsWith('file://') ? new URL(tarGzUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1') : tarGzUrl
                fs.copyFileSync(localPath, tmpTgz)
            }
            else {
                await this.downloadFile(tarGzUrl, tmpTgz)
            }
            await tar.x({ file: tmpTgz, cwd: tmpDir })

            let base = tmpDir
            let metaPath = path.join(base, 'package.json')
            if (!fs.existsSync(metaPath)) {
                base = path.join(tmpDir, 'package')
                metaPath = path.join(base, 'package.json')
            }
            if (!fs.existsSync(metaPath)) throw new Error('Invalid login bundle: missing package.json')

            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            const meta: ILoginMeta = {
                id: pkg.id ?? pkg.name.split('/').pop(),
                name: pkg.name,
                displayName: pkg.displayName ?? pkg.id ?? pkg.name.split('/').pop(),
                version: pkg.version,
                description: pkg.description ?? '',
                website: pkg.website,
                installedFrom: installedFrom ?? tarGzUrl,
                requiresRestart: pkg.requiresRestart ?? false,
                requiresExtension: pkg.requiresExtension ?? [],
                configSchema: Array.isArray(pkg.configSchema) ? pkg.configSchema : undefined
            }

            const existing = this.cachedIndex.find(m => m.id === meta.id)
            if (existing && installedFrom !== 'bundled' && installedFrom !== 'dev')
                throw new Error(`Login extension '${meta.id}' is already installed`)

            const loginJsonPath = path.join(base, 'login.json')
            const loginConfig: ILoginConfig = fs.existsSync(loginJsonPath) ? JSON.parse(fs.readFileSync(loginJsonPath, 'utf-8')) : {}

            const backgroundPath = path.join(base, 'background.png')
            const backgroundB64 = fs.existsSync(backgroundPath) ? fs.readFileSync(backgroundPath).toString('base64') : undefined

            const payload: { meta: ILoginMeta; config: ILoginConfig; background?: string } = { meta, config: loginConfig }
            if (backgroundB64) {
                if (backgroundB64.length <= CONFIGMAP_SIZE_LIMIT) payload.background = backgroundB64
                else logInfo(ELogComponent.CORE, `Login '${meta.id}': background.png exceeds ${CONFIGMAP_SIZE_LIMIT} bytes and will not be stored in ConfigMap`)
            }

            await this.configMaps.write(`kwirth-login-${meta.id}`, payload)

            const index = (await this.configMaps.read('kwirth-logins-index', []) as ILoginMeta[]) || []
            const existingIdx = index.findIndex(m => m.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta
            else index.push(meta)
            await this.configMaps.write('kwirth-logins-index', index)
            this.cachedIndex = index

            logInfo(ELogComponent.CORE, `Login extension '${meta.id}' v${meta.version} installed`)
            return meta
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<ILoginMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-login-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installBundled(bundledDir: string): Promise<void> {
        for (const filePath of await listBundledOfType(bundledDir, EExtensionType.LOGIN)) {
            const file = path.basename(filePath)
            try {
                await this.install(filePath, 'bundled')
            }
            catch (err: any) {
                if (err?.message?.includes('already installed'))
                    logInfo(ELogComponent.CORE, `Bundled login '${file}' already installed — skipping`)
                else
                    logError(ELogComponent.CORE, `Failed to install bundled login '${file}': ${err}`)
            }
        }
    }

    loadDevLogins(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const loginsMap: Record<string, string> = raw.logins ?? {}
            for (const [id, tgzPath] of Object.entries(loginsMap)) {
                if (typeof tgzPath === 'string') this.registerDevLogin(id, tgzPath)
            }
        }
        catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json logins: ${err}`)
        }
    }

    private registerDevLogin(id: string, tgzPath: string): void {
        const absPath = path.resolve(tgzPath)
        const meta: ILoginMeta = { id, name: id, displayName: id, version: 'dev', description: 'dev login', installedFrom: 'dev' }
        ;(async () => {
            try {
                const installed = await this.install(absPath, 'dev')
                this.devLogins.set(id, { tgzPath: absPath, meta: installed })
                logInfo(ELogComponent.CORE, `[dev] Login extension '${id}' registered from ${absPath}`)
            }
            catch (err) {
                if ((err as Error)?.message?.includes('already installed'))
                    logInfo(ELogComponent.CORE, `[dev] Login extension '${id}' already installed — skipping`)
                else
                    logError(ELogComponent.CORE, `[dev] Failed to register login extension '${id}': ${err}`)
            }
        })()
    }

    async uninstall(id: string): Promise<void> {
        if (this.isDevLogin(id)) throw new Error(`Login extension '${id}' is a dev login and cannot be uninstalled`)
        const index = (await this.configMaps.read('kwirth-logins-index', []) as ILoginMeta[]) || []
        const meta = index.find(m => m.id === id)
        if (meta?.installedFrom?.startsWith('pack:')) throw new Error(`Login extension '${id}' was installed by pack '${meta.installedFrom.slice(5)}' — uninstall the pack instead`)
        await this._doUninstall(id, index)
    }

    async uninstallFromPack(id: string): Promise<void> {
        const index = (await this.configMaps.read('kwirth-logins-index', []) as ILoginMeta[]) || []
        await this._doUninstall(id, index)
    }

    private async _doUninstall(id: string, index: ILoginMeta[]): Promise<void> {
        await this.configMaps.write('kwirth-logins-index', index.filter(m => m.id !== id))
        await this.configMaps.write(`kwirth-login-${id}`, null)
        this.cachedIndex = this.cachedIndex.filter(m => m.id !== id)
        logInfo(ELogComponent.CORE, `Login extension '${id}' uninstalled`)
    }

    async getConfig(id: string): Promise<ILoginConfig | undefined> {
        const data = await this.configMaps.read(`kwirth-login-${id}`) as { meta: ILoginMeta; config: ILoginConfig } | null
        return data?.config
    }

    async getConfigWithMeta(id: string): Promise<(ILoginConfig & { hasBackground: boolean }) | undefined> {
        const data = await this.configMaps.read(`kwirth-login-${id}`) as { meta: ILoginMeta; config: ILoginConfig; background?: string } | null
        if (!data?.config) return undefined
        let hasBackground = !!data.background
        if (!hasBackground && this.isDevLogin(id)) {
            const dev = this.devLogins.get(id)
            if (dev) hasBackground = await this.tgzHasBackground(dev.tgzPath)
        }
        return { ...data.config, hasBackground }
    }

    private async tgzHasBackground(tgzPath: string): Promise<boolean> {
        let found = false
        try {
            await tar.t({ file: tgzPath, onentry: (entry: any) => { if (String(entry.path).endsWith('background.png')) found = true } })
        }
        catch {}
        return found
    }

    async updateConfig(id: string, partial: Partial<ILoginConfig>): Promise<void> {
        const data = await this.configMaps.read(`kwirth-login-${id}`) as { meta: ILoginMeta; config: ILoginConfig; background?: string } | null
        if (!data) throw new Error(`Login extension '${id}' not found`)
        await this.configMaps.write(`kwirth-login-${id}`, { ...data, config: { ...data.config, ...partial } })
        logInfo(ELogComponent.CORE, `Login extension '${id}' config updated`)
    }

    async getBackground(id: string): Promise<Buffer | undefined> {
        if (this.isDevLogin(id)) {
            const dev = this.devLogins.get(id)
            if (!dev) return undefined
            const tmpDir = path.join(os.tmpdir(), `kwirth-login-bg-${id}`)
            try {
                fs.mkdirSync(tmpDir, { recursive: true })
                await tar.x({ file: dev.tgzPath, cwd: tmpDir, filter: (p: string) => p.endsWith('background.png') })
                const candidates = [path.join(tmpDir, 'background.png'), path.join(tmpDir, 'package', 'background.png')]
                const found = candidates.find(p => fs.existsSync(p))
                return found ? fs.readFileSync(found) : undefined
            }
            catch { return undefined }
            finally { fs.rmSync(tmpDir, { recursive: true, force: true }) }
        }
        const data = await this.configMaps.read(`kwirth-login-${id}`) as { meta: ILoginMeta; config: ILoginConfig; background?: string } | null
        if (!data?.background) return undefined
        return Buffer.from(data.background, 'base64')
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
