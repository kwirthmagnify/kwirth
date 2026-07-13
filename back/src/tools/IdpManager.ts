import fs from 'fs'
import path from 'path'
import os from 'os'
import https from 'https'
import http from 'http'
import zlib from 'zlib'
import tar from 'tar'
import { ISecrets } from './ISecrets'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo } from './Logging'
import { EIdpConnectorKind, IIdpConnector, IIdpConfigFieldDef, IIdpInstanceConfig, TIdpConnectorConstructor } from '@kwirthmagnify/kwirth-common-back'

const IDPS_SECRET = 'kwirth-idps'
const CONNECTORS_INDEX = 'kwirth-idp-connectors-index'
const CONFIGMAP_SIZE_LIMIT = 800 * 1024

// info publica de un tipo de conector (para la UI de gestion)
interface IIdpConnectorInfo {
    id: string
    label: string
    kind: EIdpConnectorKind
    schema: IIdpConfigFieldDef[]
    installed: boolean          // false = bundled/dev registrado en codigo; true = instalado en runtime
    version?: string
    installedFrom?: string      // 'dev' | 'bundled' | 'local' | URL de origen
    website?: string
    description?: string
}

// metadatos de un conector INSTALADO (persistidos en configmap; el codigo back.js va aparte)
interface IIdpConnectorMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description?: string
    website?: string
    installedFrom?: string
    backStored?: boolean
}

/*
    Gestiona los conectores de IdP (registry) y las instancias configuradas.
    - Conectores: bundled (registerConnector en arranque), dev (loadDevIdps) e instalables (EPIC G).
    - Instancias: se persisten TODAS en un unico Secret 'kwirth-idps' (incluye secretos como clientSecret).
    Espejo del patron de ProviderManager, pero la config va a Secret (no ConfigMap) y en un unico documento.
*/
export class IdpManager {
    private secrets: ISecrets
    private configMaps: IConfigMaps
    private registeredIdps: Map<string, TIdpConnectorConstructor>
    private installedConnectorIds = new Set<string>()
    // meta por conector (version/origen/website) para la UI, cruzada en listConnectors; poblada en init/install/loadDevIdps
    private connectorMeta = new Map<string, { version?: string, installedFrom?: string, website?: string, description?: string }>()

    constructor(secrets: ISecrets, configMaps: IConfigMaps, registeredIdps: Map<string, TIdpConnectorConstructor>) {
        this.secrets = secrets
        this.configMaps = configMaps
        this.registeredIdps = registeredIdps
    }

    // ---------------- conectores (tipos) ----------------

    registerConnector(connectorId: string, ctor: TIdpConnectorConstructor, installed = false): void {
        this.registeredIdps.set(connectorId, ctor)
        if (installed) this.installedConnectorIds.add(connectorId)
    }

    getConnector(connectorId: string): IIdpConnector | undefined {
        const Ctor = this.registeredIdps.get(connectorId)
        if (!Ctor) return undefined
        return new Ctor()
    }

    listConnectors(): IIdpConnectorInfo[] {
        const result: IIdpConnectorInfo[] = []
        for (const [connectorId, Ctor] of this.registeredIdps) {
            try {
                const c = new Ctor()
                const m = this.connectorMeta.get(connectorId)
                result.push({
                    id: connectorId,
                    label: c.label,
                    kind: c.kind,
                    schema: c.getConfigSchema(),
                    installed: this.installedConnectorIds.has(connectorId),
                    version: m?.version,
                    installedFrom: m?.installedFrom,
                    website: m?.website,
                    description: m?.description
                })
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error instantiating IdP connector '${connectorId}': ${err}`)
            }
        }
        return result
    }

    getConnectorSchema(connectorId: string): IIdpConfigFieldDef[] | undefined {
        const c = this.getConnector(connectorId)
        return c ? c.getConfigSchema() : undefined
    }

    // ---------------- conectores instalables (tgz), espejo de ProviderManager ----------------

    // carga el índice de conectores instalados (solo marca ids; el código se carga en loadAll)
    async init(): Promise<void> {
        const index = (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
        for (const m of index) {
            this.installedConnectorIds.add(m.id)
            this.connectorMeta.set(m.id, { version: m.version, installedFrom: m.installedFrom, website: m.website, description: m.description })
        }
    }

    async listInstalledMeta(): Promise<IIdpConnectorMeta[]> {
        return (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
    }

    // instala un conector desde un tgz (URL http(s), file:// o ruta local). El back.js se guarda
    // comprimido en configmap y se registra en registeredIdps.
    async install(tarGzUrl: string, installedFrom?: string): Promise<IIdpConnectorMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-idp-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-idp-extract-${Date.now()}`)
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

            let metaPath = path.join(tmpDir, 'package.json')
            let backPath = path.join(tmpDir, 'back.js')
            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) {
                // formato npm (carpeta 'package' al nivel superior)
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                backPath = path.join(tmpDir, 'back.js')
                if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) throw new Error('Invalid connector bundle: missing package.json or back.js')
            }

            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            const meta: IIdpConnectorMeta = {
                id: pkg.id ?? pkg.name,
                name: pkg.name,
                displayName: pkg.displayName,
                version: pkg.version,
                description: pkg.description,
                website: pkg.website,
                installedFrom: installedFrom ?? tarGzUrl
            }
            if (this.installedConnectorIds.has(meta.id) && !this.registeredIdps.has(meta.id)) {
                // reinstalación permitida (sobrescribe)
            }
            const backJs = fs.readFileSync(backPath, 'utf-8')
            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored) logError(ELogComponent.AUTH, `IdP connector '${meta.id}' back.js (${Math.round(backCompressed.length / 1024)}KB) exceeds configmap limit`)

            await this.configMaps.write(`kwirth-idp-connector-${meta.id}-meta`, meta)
            if (meta.backStored) await this.configMaps.write(`kwirth-idp-connector-${meta.id}-back`, { code: backCompressed, compressed: true })

            const index = (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
            const existing = index.findIndex(m => m.id === meta.id)
            if (existing >= 0) index[existing] = meta
            else index.push(meta)
            await this.configMaps.write(CONNECTORS_INDEX, index)
            this.installedConnectorIds.add(meta.id)
            this.connectorMeta.set(meta.id, { version: meta.version, installedFrom: meta.installedFrom, website: meta.website, description: meta.description })

            this.loadBackConnector(meta.id, backJs)
            logInfo(ELogComponent.AUTH, `IdP connector '${meta.id}' v${meta.version} installed`)
            return meta
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IIdpConnectorMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-idp-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        }
        finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    // instala conectores bundled desde un directorio de tgz (fetch-bundled.mjs los deja ahí)
    async installBundled(dir: string): Promise<void> {
        if (!fs.existsSync(dir)) return
        for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.tgz'))) {
            try {
                await this.install(path.join(dir, file), 'bundled')
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Failed to install bundled IdP connector '${file}': ${err}`)
            }
        }
    }

    async uninstall(connectorId: string): Promise<void> {
        this.registeredIdps.delete(connectorId)
        this.installedConnectorIds.delete(connectorId)
        this.connectorMeta.delete(connectorId)
        const index = (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
        await this.configMaps.write(CONNECTORS_INDEX, index.filter(m => m.id !== connectorId))
        await this.configMaps.write(`kwirth-idp-connector-${connectorId}-meta`, null)
        await this.configMaps.write(`kwirth-idp-connector-${connectorId}-back`, null)
        logInfo(ELogComponent.AUTH, `IdP connector '${connectorId}' uninstalled`)
    }

    // carga (registra) todos los conectores instalados desde configmap (en arranque)
    async loadAll(): Promise<void> {
        const index = (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
        for (const meta of index) {
            try {
                const backData = await this.configMaps.read(`kwirth-idp-connector-${meta.id}-back`)
                if (backData?.code) {
                    const backJs = backData.compressed ? zlib.gunzipSync(Buffer.from(backData.code, 'base64')).toString('utf-8') : backData.code
                    this.loadBackConnector(meta.id, backJs)
                }
                else {
                    logError(ELogComponent.AUTH, `IdP connector '${meta.id}' has no stored back.js — skipping`)
                }
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Failed to load IdP connector '${meta.id}': ${err}`)
            }
        }
    }

    // evalúa el back.js del conector (que referencia el global __kwirth_back__) y registra su clase
    private loadBackConnector(connectorId: string, backJs: string): void {
        try {
            const { createRequire } = require('module')
            const localRequire = createRequire(path.join(process.cwd(), 'package.json'))
            const mod: { exports: Record<string, unknown> } = { exports: {} }
            const wrap = new Function('module', 'exports', 'require', '__filename', '__dirname', backJs)
            wrap(mod, mod.exports, localRequire, `kwirth-idp-connector-${connectorId}-back.js`, process.cwd())
            const Ctor = (mod.exports.default as TIdpConnectorConstructor) ?? Object.values(mod.exports).find(v => typeof v === 'function') as TIdpConnectorConstructor | undefined
            if (Ctor) {
                this.registeredIdps.set(connectorId, Ctor)
                this.installedConnectorIds.add(connectorId)
                logInfo(ELogComponent.AUTH, `IdP connector '${connectorId}' registered`)
            }
            else {
                logError(ELogComponent.AUTH, `IdP connector '${connectorId}' back.js exports no connector class`)
            }
        }
        catch (err) {
            logError(ELogComponent.AUTH, `Error loading IdP connector '${connectorId}': ${err}`)
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

    // ---------------- instancias (Secret kwirth-idps) ----------------

    // el Secret 'kwirth-idps' guarda UNA CLAVE POR INSTANCIA (writeKey/readAllKeys hacen el
    // base64/JSON por clave; los valores de un Secret de K8s deben ser strings, no objetos).
    private async readRecord(): Promise<Record<string, IIdpInstanceConfig>> {
        try {
            const rec = await this.secrets.readAllKeys(IDPS_SECRET)
            return (rec && typeof rec === 'object') ? rec as Record<string, IIdpInstanceConfig> : {}
        }
        catch (err) {
            return {}
        }
    }

    async listInstances(): Promise<IIdpInstanceConfig[]> {
        return Object.values(await this.readRecord())
    }

    async getInstance(id: string): Promise<IIdpInstanceConfig | undefined> {
        return (await this.readRecord())[id]
    }

    async getEnabledInstances(): Promise<IIdpInstanceConfig[]> {
        return Object.values(await this.readRecord()).filter(i => i.enabled)
    }

    async saveInstance(instance: IIdpInstanceConfig): Promise<void> {
        await this.secrets.writeKey(IDPS_SECRET, instance.id, instance)
        logInfo(ELogComponent.AUTH, `IdP instance '${instance.id}' (connector '${instance.connectorId}') saved`)
    }

    async deleteInstance(id: string): Promise<void> {
        await this.secrets.writeKey(IDPS_SECRET, id, null)
        logInfo(ELogComponent.AUTH, `IdP instance '${id}' deleted`)
    }

    // ---------------- export / import ----------------

    async exportConfig(): Promise<Record<string, IIdpInstanceConfig>> {
        return this.readRecord()
    }

    async importConfig(rec: Record<string, IIdpInstanceConfig>): Promise<void> {
        for (const [id, inst] of Object.entries(rec)) {
            await this.secrets.writeKey(IDPS_SECRET, id, inst)
        }
        logInfo(ELogComponent.AUTH, `Imported ${Object.keys(rec).length} IdP instance(s)`)
    }

    // ---------------- dev (kwirth-dev.json) ----------------

    // reemplaza ${VAR} por process.env.VAR en strings, recursivamente (para no meter secretos en el json)
    static interpolateEnvDeep(value: unknown): unknown {
        if (typeof value === 'string') {
            return value.replace(/\$\{([^}]+)\}/g, (_m, name: string) => process.env[name] ?? '')
        }
        if (Array.isArray(value)) {
            return value.map(v => IdpManager.interpolateEnvDeep(v))
        }
        if (value && typeof value === 'object') {
            const out: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = IdpManager.interpolateEnvDeep(v)
            return out
        }
        return value
    }

    // carga conectores en dev desde kwirth-dev.json → idps: { id: distPath }
    loadDevIdps(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const idpsMap: Record<string, string> = raw.idps ?? {}
            for (const [id, distPath] of Object.entries(idpsMap)) {
                const abs = path.resolve(distPath)
                this.reloadDevConnector(id, path.join(abs, 'back.js'))
                try {
                    const pkg = JSON.parse(fs.readFileSync(path.join(abs, 'package.json'), 'utf-8'))
                    this.connectorMeta.set(id, { version: pkg.version, website: pkg.website, description: pkg.description, installedFrom: 'dev' })
                }
                catch { this.connectorMeta.set(id, { installedFrom: 'dev' }) }
            }
        }
        catch (err) {
            logError(ELogComponent.AUTH, `Failed to load kwirth-dev.json (idps): ${err}`)
        }
    }

    private reloadDevConnector(connectorId: string, backPath: string): void {
        try {
            const resolved = require.resolve(backPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const mod = require(backPath)
            const Ctor = mod.default ?? Object.values(mod).find(v => typeof v === 'function')
            if (Ctor) {
                this.registeredIdps.set(connectorId, Ctor as TIdpConnectorConstructor)
                logInfo(ELogComponent.AUTH, `[dev] IdP connector '${connectorId}' registered from ${backPath}`)
            }
            else {
                logError(ELogComponent.AUTH, `[dev] IdP connector '${connectorId}' back.js exports no connector class`)
            }
        }
        catch (err) {
            logError(ELogComponent.AUTH, `[dev] IdP connector '${connectorId}' reload error: ${err}`)
        }
    }

    // precarga instancias en el Secret desde kwirth-dev.json → idpConfigs (con interpolacion ${ENV})
    async loadDevIdpConfigs(): Promise<void> {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const configs: Record<string, IIdpInstanceConfig> = raw.idpConfigs ?? {}
            for (const [id, cfg] of Object.entries(configs)) {
                // seed solo-si-no-existe: NO pisar una instancia ya configurada (UI o seed previo)
                if (await this.getInstance(id)) continue
                const interpolated = IdpManager.interpolateEnvDeep(cfg) as IIdpInstanceConfig
                interpolated.id = id
                // no sembrar instancias sin config real (p.ej. faltan las env vars → todo vacío)
                const hasValues = Object.values(interpolated.config || {}).some(v => v !== '' && v !== null && v !== undefined)
                if (!hasValues) continue
                await this.saveInstance(interpolated)
                logInfo(ELogComponent.AUTH, `[dev] IdP instance '${id}' preloaded from kwirth-dev.json`)
            }
        }
        catch (err) {
            logError(ELogComponent.AUTH, `Failed to load kwirth-dev.json (idpConfigs): ${err}`)
        }
    }
}

export { IIdpConnectorInfo }
