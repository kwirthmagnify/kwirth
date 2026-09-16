import { IAiToolset, registerToolset, unregisterToolset, isBuiltInToolsetId, getToolset } from '@kwirthmagnify/kwirth-common-ai/back'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'
import { downloadFile, packageHeaders } from './PackageRegistries'
import { listBundledOfType } from './BundledExtensions'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'

// Manager del tipo de extension `aitoolset` (plan: plans/ai-tools/PLAN.md, S1).
//
// Un aitoolset es SOLO back: un back.js que exporta la definicion de un toolset. No tiene front propio
// —el selector y el dialogo de configuracion son del core, compartidos por todos— asi que aqui no hay
// nada del front.js que si manejan plugins, providers, senders y webhooks.

export interface IAiToolsetMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    // De que marketplace vino. Se GUARDA al instalar, no se deduce: la url del tarball apunta al registro
    // de paquetes, que es otro servidor, y con precedencia por id dos marketplaces pueden servir el mismo
    // id. Ausente = no vino de ningun marketplace (dev, fichero o url suelta).
    marketplaceId?: string
    marketplaceLabel?: string
    backStored?: boolean
    requiresRestart?: boolean
    requiresExtension?: string[]
}

const CONFIGMAP_SIZE_LIMIT = 800 * 1024
const INDEX_KEY = 'kwirth-aitoolsets-index'

interface IDevAiToolset {
    tgzPath: string
    meta: IAiToolsetMeta
}

// Que sobra en el indice cuando se relee kwirth-dev.json. Solo se reconcilia lo marcado 'dev': lo
// instalado desde marketplace, url o fichero se queda donde esta, que es instalado de verdad.
// Funcion pura y exportada a proposito: es la logica que merece test, y probarla no deberia exigir
// levantar un manager entero.
export const staleDevAiToolsets = (index: IAiToolsetMeta[], declared: Set<string>): IAiToolsetMeta[] =>
    index.filter(m => m.installedFrom === 'dev' && !declared.has(m.id))

export class AiToolsetManager {
    private configMaps: IConfigMaps
    private cachedIndex: IAiToolsetMeta[] = []
    private devToolsets = new Map<string, IDevAiToolset>()

    constructor(configMaps: IConfigMaps) {
        this.configMaps = configMaps
    }

    async init(): Promise<void> {
        this.cachedIndex = (await this.configMaps.read(INDEX_KEY, []) as IAiToolsetMeta[]) || []
    }

    async listInstalled(): Promise<IAiToolsetMeta[]> {
        const stored = (await this.configMaps.read(INDEX_KEY, [])) as IAiToolsetMeta[] || []
        const devMetas = Array.from(this.devToolsets.values()).map(d => d.meta)
        const devIds = new Set(devMetas.map(m => m.id))
        return [...stored.filter(m => !devIds.has(m.id)), ...devMetas]
    }

    isDevToolset(id: string): boolean {
        return this.devToolsets.has(id)
    }

    // ── Carga ───────────────────────────────────────────────────────────────────

    /**
     * Carga un back.js y da de alta su toolset.
     *
     * El modulo solo EXPORTA su definicion; quien la registra es esto. Si el modulo se auto-registrara,
     * el alta seria un efecto secundario del import: el orden de carga pasaria a importar, un modulo
     * ajeno podria dar de alta lo que quisiera, y al desinstalar habria que adivinar que registro.
     */
    private loadBackToolset(id: string, backJs: string): boolean {
        const tmpPath = path.join(os.tmpdir(), `kwirth-aitoolset-${id}-back.js`)
        fs.writeFileSync(tmpPath, backJs)
        try {
            const resolved = require.resolve(tmpPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const mod = require(tmpPath)
            const toolset: IAiToolset | undefined = mod.default ?? mod.toolset
            if (!toolset || typeof toolset !== 'object' || !Array.isArray(toolset.tools)) {
                logError(ELogComponent.CORE, `AI toolset '${id}' back.js exports no toolset definition`)
                return false
            }
            // El id del paquete y el del toolset que exporta tienen que ser el mismo. Si divergen, el
            // indice diria una cosa y el registro otra: desinstalar dejaria el toolset vivo y el catalogo
            // mostraria algo que no existe.
            if (toolset.id !== id) {
                logError(ELogComponent.CORE, `AI toolset package '${id}' exports a toolset with id '${toolset.id}' — refusing to register`)
                return false
            }
            registerToolset(toolset)
            logInfo(ELogComponent.CORE, `AI toolset '${id}' v${toolset.version} registered (${toolset.tools.length} tools)`)
            return true
        }
        catch (err) {
            logError(ELogComponent.CORE, `Error loading AI toolset '${id}': ${err}`)
            return false
        }
    }

    private async fetchJsFromSource(meta: IAiToolsetMeta): Promise<string | undefined> {
        if (!meta.installedFrom || meta.installedFrom === 'dev' || meta.installedFrom === 'local') return undefined
        const tmpTgz = path.join(os.tmpdir(), `kwirth-aitoolset-src-${meta.id}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-aitoolset-src-${meta.id}`)
        try {
            await downloadFile(meta.installedFrom, tmpTgz, await packageHeaders(meta.installedFrom))
            fs.mkdirSync(tmpDir, { recursive: true })
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            const candidates = [path.join(tmpDir, 'back.js'), path.join(tmpDir, 'package', 'back.js')]
            const found = candidates.find(p => fs.existsSync(p))
            return found ? fs.readFileSync(found, 'utf-8') : undefined
        }
        catch (err) {
            logError(ELogComponent.CORE, `Could not fetch AI toolset '${meta.id}' from source: ${err}`)
            return undefined
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    /** Al arrancar: registra todos los toolsets instalados. */
    async loadAll(): Promise<void> {
        for (const meta of this.cachedIndex) {
            if (meta.installedFrom === 'dev') continue      // los lleva loadDevAiToolsets()
            try {
                let backJs: string | undefined
                if (meta.backStored === false) {
                    backJs = await this.fetchJsFromSource(meta)
                }
                else {
                    const backData = await this.configMaps.read(`kwirth-aitoolset-${meta.id}-back`)
                    if (backData?.code)
                        backJs = backData.compressed ? zlib.gunzipSync(Buffer.from(backData.code, 'base64')).toString('utf-8') : backData.code
                }
                if (backJs) this.loadBackToolset(meta.id, backJs)
                else logError(ELogComponent.CORE, `AI toolset '${meta.id}' has no back.js — skipping`)
            }
            catch (err) {
                logError(ELogComponent.CORE, `Failed to load AI toolset '${meta.id}': ${err}`)
            }
        }
    }

    // ── Instalacion ─────────────────────────────────────────────────────────────

    async install(tarGzUrl: string, installedFrom?: string, marketplaceId?: string, marketplaceLabel?: string): Promise<IAiToolsetMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-aitoolset-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-aitoolset-extract-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })

        const isLocalPath = tarGzUrl.startsWith('file://') || (!tarGzUrl.startsWith('http://') && !tarGzUrl.startsWith('https://'))
        const localPath = tarGzUrl.startsWith('file://') ? new URL(tarGzUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1') : tarGzUrl
        // En dev se apunta directamente a la carpeta dist —como hacen los plugins en kwirth-dev.json— para
        // no tener que empaquetar un tgz en cada build. Desde un marketplace o un fichero subido siempre es
        // un tarball.
        const isLocalDir = isLocalPath && fs.existsSync(localPath) && fs.statSync(localPath).isDirectory()

        try {
            if (isLocalDir) {
                tmpDir = localPath
            }
            else {
                if (isLocalPath) fs.copyFileSync(localPath, tmpTgz)
                else await downloadFile(tarGzUrl, tmpTgz, await packageHeaders(tarGzUrl))
                await tar.x({ file: tmpTgz, cwd: tmpDir })
            }

            let metaPath = path.join(tmpDir, 'package.json')
            let backPath = path.join(tmpDir, 'back.js')
            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) {
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                backPath = path.join(tmpDir, 'back.js')
                if (!fs.existsSync(metaPath) || !fs.existsSync(backPath))
                    throw new Error('Invalid AI toolset bundle: missing package.json or back.js')
            }

            const meta: IAiToolsetMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))

            // Se rechaza ANTES de tocar nada: un id reservado del core no se puede ocupar, y enterarse
            // despues de haber escrito el indice dejaria una entrada que no se puede registrar nunca.
            if (isBuiltInToolsetId(meta.id))
                throw new Error(`AI toolset id '${meta.id}' is reserved by a built-in toolset`)
            if (installedFrom !== 'dev' && installedFrom !== 'bundled' && getToolset(meta.id))
                throw new Error(`AI toolset '${meta.id}' is already installed`)

            meta.installedFrom = installedFrom ?? tarGzUrl
            meta.marketplaceId = marketplaceId
            meta.marketplaceLabel = marketplaceLabel
            meta.requiresRestart = meta.requiresRestart ?? false
            meta.requiresExtension = meta.requiresExtension ?? []

            const backJs = fs.readFileSync(backPath, 'utf-8')
            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored)
                logInfo(ELogComponent.CORE, `AI toolset '${meta.id}' back.js exceeds configmap limit — will fetch from source on startup`)

            await this.configMaps.write(`kwirth-aitoolset-${meta.id}-meta`, meta)
            if (meta.backStored) await this.configMaps.write(`kwirth-aitoolset-${meta.id}-back`, { code: backCompressed, compressed: true })

            const index = (await this.configMaps.read(INDEX_KEY, []) as IAiToolsetMeta[]) || []
            const existingIdx = index.findIndex(t => t.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta
            else index.push(meta)
            await this.configMaps.write(INDEX_KEY, index)
            this.cachedIndex = index

            // Reinstalar sobre algo ya registrado (dev, o una version nueva) tiene que reemplazar, no
            // chocar: registerToolset revienta si el id esta ocupado, asi que se retira primero.
            unregisterToolset(meta.id)
            this.loadBackToolset(meta.id, backJs)

            logInfo(ELogComponent.CORE, `AI toolset '${meta.id}' v${meta.version} installed`)
            return meta
        }
        finally {
            // ⚠️ SOLO se borra lo que hemos creado nosotros. Con una instalacion desde carpeta (dev),
            // tmpDir es el dist DE VERDAD del toolset: borrarlo aqui se llevaria por delante el build del
            // usuario en cada arranque del core.
            if (!isLocalDir) fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IAiToolsetMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-aitoolset-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(id: string): Promise<void> {
        if (isBuiltInToolsetId(id)) throw new Error(`AI toolset '${id}' is built-in and cannot be uninstalled`)

        unregisterToolset(id)
        await this.configMaps.write(`kwirth-aitoolset-${id}-meta`, null)
        await this.configMaps.write(`kwirth-aitoolset-${id}-back`, null)

        const index = ((await this.configMaps.read(INDEX_KEY, []) as IAiToolsetMeta[]) || []).filter(t => t.id !== id)
        await this.configMaps.write(INDEX_KEY, index)
        this.cachedIndex = index
        this.devToolsets.delete(id)

        logInfo(ELogComponent.CORE, `AI toolset '${id}' uninstalled`)
    }

    async installBundled(bundledDir: string): Promise<void> {
        // El directorio bundled es COMPARTIDO por todos los tipos: hay que filtrar por extensionType, no
        // tragarse todos los .tgz que haya. listBundledOfType mira dentro de cada uno.
        for (const full of await listBundledOfType(bundledDir, EExtensionType.AITOOLSET)) {
            const file = path.basename(full)
            try {
                await this.install(full, 'bundled')
            }
            catch (err: any) {
                if (err?.message?.includes('already installed'))
                    logInfo(ELogComponent.CORE, `Bundled AI toolset '${file}' already installed — skipping`)
                else
                    logError(ELogComponent.CORE, `Failed to install bundled AI toolset '${file}': ${err}`)
            }
        }
    }

    // ── Dev ─────────────────────────────────────────────────────────────────────

    // kwirth-dev.json es DECLARATIVO: lo que figura aqui queda instalado y lo que se quita del fichero se
    // desinstala. Hace falta decirlo porque un toolset de dev es una instalacion REAL —se escribe en
    // ConfigMaps—, asi que borrar la linea solo dejaba de reinstalarlo: la entrada sobrevivia en el
    // indice y el manager lo seguia dando por instalado para siempre.
    loadDevAiToolsets(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        let entries: [string, unknown][] = []
        try {
            entries = Object.entries(JSON.parse(fs.readFileSync(devConfigPath, 'utf-8')).aitoolsets ?? {})
        }
        catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (aitoolsets): ${err}`)
            return
        }

        ;(async () => {
            const declared = new Set<string>()
            for (const [id, tgzPath] of entries) {
                if (typeof tgzPath !== 'string') continue
                const resolved = path.resolve(process.cwd(), tgzPath)
                if (!fs.existsSync(resolved)) {
                    logWarning(ELogComponent.CORE, `[dev] AI toolset '${id}' tgz not found at ${resolved} — run its build first`)
                    continue
                }
                try {
                    const meta = await this.install(resolved, 'dev')
                    declared.add(meta.id)
                    this.devToolsets.set(meta.id, { tgzPath: resolved, meta })
                    logInfo(ELogComponent.CORE, `[dev] AI toolset '${meta.id}' v${meta.version} installed`)
                }
                catch (err) {
                    logError(ELogComponent.CORE, `[dev] Failed to install AI toolset '${id}': ${err}`)
                }
            }
            await this.pruneDevAiToolsets(declared)
        })().catch(err => logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (aitoolsets): ${err}`))
    }

    private async pruneDevAiToolsets(declared: Set<string>): Promise<void> {
        const index = (await this.configMaps.read(INDEX_KEY, []) as IAiToolsetMeta[]) || []
        for (const meta of staleDevAiToolsets(index, declared)) {
            await this.uninstall(meta.id)
            logInfo(ELogComponent.CORE, `[dev] AI toolset '${meta.id}' no longer in kwirth-dev.json — uninstalled`)
        }
    }
}
