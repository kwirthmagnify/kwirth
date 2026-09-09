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

// Que sobra en el indice cuando se relee kwirth-dev.json. Solo se reconcilia lo marcado 'dev': lo bundled,
// lo de un pack y lo instalado desde marketplace, URL o fichero se queda donde esta, que es instalado de
// verdad. Vale tanto el id que trae el tgz como la clave del fichero de dev, para que un login declarado
// pero todavia sin construir no pierda su sitio por no haberse podido instalar hoy.
export const staleDevLogins = (index: ILoginMeta[], declared: Set<string>): ILoginMeta[] =>
    index.filter(m => m.installedFrom === 'dev' && !declared.has(m.id))

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

    // kwirth-dev.json es DECLARATIVO: lo que figura aqui queda instalado y lo que se quita del fichero se
    // desinstala. Hace falta decirlo porque un login de dev es una instalacion REAL —se escribe en
    // ConfigMaps, que es de donde se sirve la pantalla de login antes de autenticar a nadie—, asi que
    // borrar la linea solo dejaba de reinstalarlo: la entrada sobrevivia en el indice y el manager lo
    // seguia dando por instalado para siempre.
    //
    // Solo se reconcilia lo marcado 'dev'. Lo instalado desde un marketplace, una URL, un fichero o un
    // pack no se toca: eso es instalado de verdad y se mantiene.
    loadDevLogins(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        let loginsMap: Record<string, string> = {}
        try {
            loginsMap = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8')).logins ?? {}
        }
        catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json logins: ${err}`)
            return
        }
        // Secuencial a proposito: cada install hace leer-indice / anadir / escribir-indice, y en paralelo
        // se pisan entre ellos y se pierden entradas.
        ;(async () => {
            const declared = new Set<string>()
            for (const [id, tgzPath] of Object.entries(loginsMap)) {
                if (typeof tgzPath !== 'string') continue
                declared.add(id)
                const installedId = await this.registerDevLogin(id, tgzPath)
                if (installedId) declared.add(installedId)
            }
            await this.pruneDevLogins(declared)
        })().catch(err => logError(ELogComponent.CORE, `Failed to load kwirth-dev.json logins: ${err}`))
    }

    private async pruneDevLogins(declared: Set<string>): Promise<void> {
        let index = (await this.configMaps.read('kwirth-logins-index', []) as ILoginMeta[]) || []
        for (const meta of staleDevLogins(index, declared)) {
            this.devLogins.delete(meta.id)
            await this._doUninstall(meta.id, index)
            index = index.filter(m => m.id !== meta.id)
            logInfo(ELogComponent.CORE, `[dev] Login extension '${meta.id}' no longer in kwirth-dev.json — uninstalled`)
        }
    }

    private async registerDevLogin(id: string, tgzPath: string): Promise<string | undefined> {
        const absPath = path.resolve(tgzPath)
        try {
            const installed = await this.install(absPath, 'dev')
            this.devLogins.set(id, { tgzPath: absPath, meta: installed })
            logInfo(ELogComponent.CORE, `[dev] Login extension '${id}' registered from ${absPath}`)
            return installed.id
        }
        catch (err) {
            if ((err as Error)?.message?.includes('already installed'))
                logInfo(ELogComponent.CORE, `[dev] Login extension '${id}' already installed — skipping`)
            else
                logError(ELogComponent.CORE, `[dev] Failed to register login extension '${id}': ${err}`)
            return undefined
        }
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
