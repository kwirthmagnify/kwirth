import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo } from './Logging'
import { ILoginFieldDef } from '@kwirthmagnify/kwirth-common-back'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
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
    // De que marketplace vino. Se GUARDA al instalar, no se deduce: la url del tarball apunta al
    // registro de paquetes, que es otro servidor, y con precedencia por id dos marketplaces pueden
    // servir la misma extension. Ausente = no vino de ningun marketplace (dev, fichero o url suelta).
    marketplaceId?: string
    marketplaceLabel?: string
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

// El tope no es nuestro: un ConfigMap de Kubernetes no pasa de ~1 MiB por objeto, y el fondo viaja dentro
// en base64. Se conserva como respaldo para cuando el almacenamiento no declara el suyo.
export const CONFIGMAP_SIZE_LIMIT = 800 * 1024

/** Cual de los dos fondos se guardo. Nunca comparar contra literales sueltos. */
export enum EBackgroundQuality {
    HI = 'hi',
    STANDARD = 'standard'
}

/** El fondo elegido para guardar, o el problema que impide guardar ninguno. */
export interface IBackgroundPick {
    backgroundB64?: string
    quality?: EBackgroundQuality
    problem?: string
}

/*
    Cual de los dos fondos se guarda, sabiendo lo que admite el almacenamiento.

    Un login puede traer DOS imagenes: `background-hi.png` (la buena) y `background.png` (la que cabe en
    cualquier sitio). Cual se usa no lo decide el login: lo decide donde va a guardarse. Con ConfigMaps de
    Kubernetes hay ~1 MiB por objeto; con almacenamiento en fichero —desktop, docker, KWIRTH_STORE— no hay
    ese techo, y ahi la buena entra sin problema. Por eso `limit` puede ser `undefined`: significa que cabe
    todo, no que no se sepa.

    Sin fondo no hay problema: un login puede no traer ninguno. El problema es traerlo y que no quepa,
    porque entonces la pagina sale distinta de como su autor la diseño.
*/
export const pickBackground = (hiB64: string|undefined, stdB64: string|undefined, limit: number|undefined): IBackgroundPick => {
    const cabe = (b64: string) => limit === undefined || b64.length <= limit
    if (hiB64 && cabe(hiB64)) return { backgroundB64: hiB64, quality: EBackgroundQuality.HI }
    if (stdB64 && cabe(stdB64)) return { backgroundB64: stdB64, quality: EBackgroundQuality.STANDARD }
    if (hiB64 || stdB64) return { problem: 'background-too-large' }
    return {}
}

// Que le pasa al fondo de un login, o undefined si nada. Se mantiene para quien solo tiene UNA imagen.
export const backgroundProblem = (backgroundB64: string|undefined, limit: number|undefined = CONFIGMAP_SIZE_LIMIT): string|undefined =>
    pickBackground(undefined, backgroundB64, limit).problem

// Lo que se guarda de un login instalado. `problem` marca que se instalo A MEDIAS: la extension funciona
// pero le falta algo, y la pagina de login lo dice para que quien la vea pueda avisar al administrador.
interface ILoginPayload {
    meta: ILoginMeta
    config: ILoginConfig
    background?: string
    backgroundQuality?: EBackgroundQuality
    problem?: string
}

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
                requiresExtension: pkg.requiresExtension ?? [],
                configSchema: Array.isArray(pkg.configSchema) ? pkg.configSchema : undefined
            }

            /*
                El payload se escribe ENTERO mas abajo, asi que actualizar no deja nada de la version
                anterior: si la nueva no trae fondo, el documento nuevo no lo lleva y el viejo desaparece
                con el. Es lo que se quiere —lo instalado es lo que trae el paquete—, y conviene no
                cambiar esa escritura por una parcial.
            */
            if (installedFrom !== 'bundled' && installedFrom !== 'dev')
                assertInstallable('Login extension', meta.id, this.cachedIndex.find(m => m.id === meta.id), meta.version, upgrade)

            const loginJsonPath = path.join(base, 'login.json')
            const loginConfig: ILoginConfig = fs.existsSync(loginJsonPath) ? JSON.parse(fs.readFileSync(loginJsonPath, 'utf-8')) : {}

            // Dos imagenes posibles: la buena y la que cabe en cualquier sitio. Cual se guarda lo decide
            // el ALMACENAMIENTO (ver pickBackground), no el login.
            const leer = (nombre: string) => {
                const p = path.join(base, nombre)
                return fs.existsSync(p) ? fs.readFileSync(p).toString('base64') : undefined
            }
            const limit = this.configMaps.storeLimit()
            const elegido = pickBackground(leer('background-hi.png'), leer('background.png'), limit)

            const payload: ILoginPayload = { meta, config: loginConfig }
            if (elegido.problem) {
                // Antes esto era SOLO una linea de log: el login salia sin fondo y nadie se enteraba. Paso
                // de verdad con un login instalado desde el marketplace. Ahora queda anotado en el propio
                // login, para que su pagina pueda avisar a quien la vea.
                logInfo(ELogComponent.CORE, `Login '${meta.id}': no background fits in ${limit} bytes; none will be stored`)
                payload.problem = elegido.problem
            }
            else if (elegido.backgroundB64) {
                payload.background = elegido.backgroundB64
                payload.backgroundQuality = elegido.quality
                // Se dice cual se guardo: con dos imagenes en juego, saber que se sirve la normal —y por
                // que— evita buscar el fallo en la imagen o en el navegador.
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

    async getConfigWithMeta(id: string): Promise<(ILoginConfig & { hasBackground: boolean; problem?: string }) | undefined> {
        const data = await this.configMaps.read(`kwirth-login-${id}`) as ILoginPayload | null
        if (!data?.config) return undefined
        let hasBackground = !!data.background
        if (!hasBackground && this.isDevLogin(id)) {
            const dev = this.devLogins.get(id)
            if (dev) hasBackground = await this.tgzHasBackground(dev.tgzPath)
        }
        // el problema viaja a una pagina SIN autenticar, asi que va como codigo, no como detalle interno
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
                // En dev el fondo NO pasa por el almacenamiento: se sirve del tgz, asi que no hay techo
                // que respetar y gana siempre la buena. Es tambien lo que se quiere al desarrollar un
                // login: verlo como se vera donde quepa.
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
