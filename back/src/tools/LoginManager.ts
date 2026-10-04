import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo } from './Logging'
import { assertExtensionRequirements, normalizeRequires } from './ExtensionDeps'
import { ILoginFieldDef } from '@kwirthmagnify/kwirth-common-back'
import { EExtensionType, IExtensionRequirement } from '@kwirthmagnify/kwirth-common'
import { listBundledOfType } from './BundledExtensions'
import { downloadFile, packageHeaders } from './PackageRegistries'
import { assertInstallable } from './ExtensionInstallGuard'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'

export interface ILoginMeta {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    // Which marketplace it came from. It is STORED on install, not deduced: the tarball's url points at
    // the package registry, which is another server, and with precedence by id two marketplaces can
    // serve the same extension. Absent = it came from no marketplace (dev, a file or a loose url).
    marketplaceId?: string
    marketplaceLabel?: string
    requiresRestart?: boolean
    requiresExtension?: IExtensionRequirement[]
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

// The ceiling is not ours: a Kubernetes ConfigMap does not go beyond ~1 MiB per object, and the background
// travels inside it in base64. It is kept as a fallback for when the storage does not declare its own.
export const CONFIGMAP_SIZE_LIMIT = 800 * 1024

/** Which of the two backgrounds was stored. Never compare against loose literals. */
export enum EBackgroundQuality {
    HI = 'hi',
    STANDARD = 'standard'
}

/** The background chosen for storing, or the problem preventing any from being stored. */
export interface IBackgroundPick {
    backgroundB64?: string
    quality?: EBackgroundQuality
    problem?: string
}

/*
    Which of the two backgrounds gets stored, knowing what the storage admits.

    A login can carry TWO images: `background-hi.png` (the good one) and `background.png` (the one that
    fits anywhere). Which one is used is not the login's decision: it is decided by where it is going to be
    stored. With Kubernetes ConfigMaps there is ~1 MiB per object; with file storage — desktop, docker,
    KWIRTH_STORE — there is no such ceiling, and there the good one fits without trouble. That is why
    `limit` can be `undefined`: it means everything fits, not that it is unknown.

    With no background there is no problem: a login may carry none. The problem is carrying one that does
    not fit, because then the page comes out different from how its author designed it.
*/
export const pickBackground = (hiB64: string|undefined, stdB64: string|undefined, limit: number|undefined): IBackgroundPick => {
    const cabe = (b64: string) => limit === undefined || b64.length <= limit
    if (hiB64 && cabe(hiB64)) return { backgroundB64: hiB64, quality: EBackgroundQuality.HI }
    if (stdB64 && cabe(stdB64)) return { backgroundB64: stdB64, quality: EBackgroundQuality.STANDARD }
    if (hiB64 || stdB64) return { problem: 'background-too-large' }
    return {}
}

// What happens to a login's background, or undefined when nothing does. It is kept for whoever has only ONE image.
export const backgroundProblem = (backgroundB64: string|undefined, limit: number|undefined = CONFIGMAP_SIZE_LIMIT): string|undefined =>
    pickBackground(undefined, backgroundB64, limit).problem

// What is stored about an installed login. `problem` marks that it was installed HALFWAY: the extension
// works but something is missing, and the login page says so, so that whoever sees it can tell the administrator.
interface ILoginPayload {
    meta: ILoginMeta
    config: ILoginConfig
    background?: string
    backgroundQuality?: EBackgroundQuality
    problem?: string
}

// What is surplus in the index when kwirth-dev.json is re-read. Only what is marked 'dev' is reconciled:
// what is bundled, what comes from a pack and what was installed from a marketplace, a URL or a file stays
// where it is, because it is really installed. Both the id the tgz carries and the dev file's key will do,
// so that a login that is declared but not yet built does not lose its place for not having been
// installable today.
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

    async install(tarGzUrl: string, installedFrom?: string, marketplaceId?: string, marketplaceLabel?: string, upgrade?: boolean): Promise<ILoginMeta> {
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
                await downloadFile(tarGzUrl, tmpTgz, await packageHeaders(tarGzUrl))
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
                marketplaceId,
                marketplaceLabel,
                requiresRestart: pkg.requiresRestart ?? false,
                requiresExtension: normalizeRequires(pkg.requiresExtension),
                configSchema: Array.isArray(pkg.configSchema) ? pkg.configSchema : undefined
            }
            // A login that requires an extension is not installed without it.
            await assertExtensionRequirements('Login', meta.id, meta.requiresExtension, installedFrom)

            /*
                The payload is written WHOLE further down, so updating leaves nothing of the previous
                version: if the new one carries no background, the new document does not have it and the
                old one disappears with it. That is what is wanted — what is installed is what the package
                carries — and it is better not to change that write for a partial one.
            */
            if (installedFrom !== 'bundled' && installedFrom !== 'dev')
                assertInstallable('Login extension', meta.id, this.cachedIndex.find(m => m.id === meta.id), meta.version, upgrade)

            const loginJsonPath = path.join(base, 'login.json')
            const loginConfig: ILoginConfig = fs.existsSync(loginJsonPath) ? JSON.parse(fs.readFileSync(loginJsonPath, 'utf-8')) : {}

            // Two possible images: the good one and the one that fits anywhere. Which gets stored is
            // decided by the STORAGE (see pickBackground), not by the login.
            const leer = (nombre: string) => {
                const p = path.join(base, nombre)
                return fs.existsSync(p) ? fs.readFileSync(p).toString('base64') : undefined
            }
            const limit = this.configMaps.storeLimit()
            const elegido = pickBackground(leer('background-hi.png'), leer('background.png'), limit)

            const payload: ILoginPayload = { meta, config: loginConfig }
            if (elegido.problem) {
                // This used to be ONLY a log line: the login came out with no background and nobody found
                // out. It really happened with a login installed from the marketplace. Now it is noted on
                // the login itself, so that its page can warn whoever sees it.
                logInfo(ELogComponent.CORE, `Login '${meta.id}': no background fits in ${limit} bytes; none will be stored`)
                payload.problem = elegido.problem
            }
            else if (elegido.backgroundB64) {
                payload.background = elegido.backgroundB64
                payload.backgroundQuality = elegido.quality
                // Which one was stored is stated: with two images in play, knowing that the normal one is
                // being served — and why — saves looking for the fault in the image or in the browser.
                logInfo(ELogComponent.CORE, `Login '${meta.id}': stored '${elegido.quality}' background` +
                    (elegido.quality === EBackgroundQuality.STANDARD && limit !== undefined ? ` (the hi-res one does not fit in ${limit} bytes)` : ''))
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

    // kwirth-dev.json is DECLARATIVE: what is listed here stays installed and what is removed from the
    // file gets uninstalled. It is worth saying because a dev login is a REAL installation — it is written
    // into ConfigMaps, which is where the login screen is served from before authenticating anybody — so
    // deleting the line merely stopped it being reinstalled: the entry survived in the index and the
    // manager went on considering it installed forever.
    //
    // Only what is marked 'dev' is reconciled. What was installed from a marketplace, a URL, a file or a
    // pack is not touched: that is really installed and is kept.
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
        // Sequential on purpose: every install does read-index / add / write-index, and in parallel they
        // overwrite each other and entries are lost.
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

    async getConfigWithMeta(id: string): Promise<(ILoginConfig & { hasBackground: boolean; problem?: string }) | undefined> {
        const data = await this.configMaps.read(`kwirth-login-${id}`) as ILoginPayload | null
        if (!data?.config) return undefined
        let hasBackground = !!data.background
        if (!hasBackground && this.isDevLogin(id)) {
            const dev = this.devLogins.get(id)
            if (dev) hasBackground = await this.tgzHasBackground(dev.tgzPath)
        }
        // the problem travels to a page served WITHOUT authentication, so it goes as a code, not as internal detail
        return { ...data.config, hasBackground, ...(data.problem && !hasBackground ? { problem: data.problem } : {}) }
    }

    private async tgzHasBackground(tgzPath: string): Promise<boolean> {
        let found = false
        try {
            await tar.t({ file: tgzPath, onentry: (entry: any) => {
                const p = String(entry.path)
                if (p.endsWith('background.png') || p.endsWith('background-hi.png')) found = true
            } })
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
                await tar.x({ file: dev.tgzPath, cwd: tmpDir, filter: (p: string) => p.endsWith('background.png') || p.endsWith('background-hi.png') })
                // In dev the background does NOT go through the storage: it is served from the tgz, so
                // there is no ceiling to honour and the good one always wins. It is also what one wants
                // when developing a login: seeing it as it will look wherever it fits.
                const candidates = ['background-hi.png', 'background.png'].flatMap(n => [path.join(tmpDir, n), path.join(tmpDir, 'package', n)])
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
}
