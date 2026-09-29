import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'
import tar from 'tar'
import { ISecrets } from './ISecrets'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo } from './Logging'
import { EIdpConnectorKind, IIdpConnector, IIdpConfigFieldDef, IIdpInstanceConfig, TIdpConnectorConstructor } from '@kwirthmagnify/kwirth-common-back'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { listBundledOfType } from './BundledExtensions'
import { downloadFile, packageHeaders } from './PackageRegistries'
import { assertInstallable } from './ExtensionInstallGuard'
import { assertDceRequirements } from './ExtensionDeps'

const IDPS_SECRET = 'kwirth-idps'
const CONNECTORS_INDEX = 'kwirth-idp-connectors-index'
const CONFIGMAP_SIZE_LIMIT = 800 * 1024

// public information about a connector type (for the management UI)
interface IIdpConnectorInfo {
    id: string
    label: string
    kind: EIdpConnectorKind
    schema: IIdpConfigFieldDef[]
    installed: boolean          // false = bundled/dev registrado en codigo; true = instalado en runtime
    version?: string
    installedFrom?: string      // 'dev' | 'bundled' | 'local' | URL de origen
    // Which marketplace it came from. It is STORED on install, not deduced: the tarball's url points at
    // the package registry, which is another server, and with precedence by id two marketplaces can
    // serve the same extension. Absent = it came from no marketplace (dev, a file or a loose url).
    marketplaceId?: string
    marketplaceLabel?: string
    website?: string
    description?: string
    // It is needed in the LIST, not only when installing: on uninstalling one has to be able to warn
    // that the connector stays hooked in until the core is restarted.
    requiresRestart?: boolean
}

// metadata of an INSTALLED connector (persisted in a configmap; the back.js code goes separately)
interface IIdpConnectorMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description?: string
    website?: string
    installedFrom?: string
    // Which marketplace it came from. It is STORED on install, not deduced: the tarball's url points at
    // the package registry, which is another server, and with precedence by id two marketplaces can
    // serve the same extension. Absent = it came from no marketplace (dev, a file or a loose url).
    marketplaceId?: string
    marketplaceLabel?: string
    backStored?: boolean
    requiresRestart?: boolean
    requiresExtension?: string[]
}

/*
    Manages the IdP connectors (the registry) and the configured instances.
    - Connectors: bundled (registerConnector at startup), dev (loadDevIdps) and installable (EPIC G).
    - Instances: ALL of them are persisted in a single Secret 'kwirth-idps' (it holds secrets such as clientSecret).
    A mirror of ProviderManager's pattern, but the config goes to a Secret (not a ConfigMap) and in a single document.
*/
// What is known about a connector at runtime, for crossing it with its class when listing them in the UI.
interface IConnectorRuntimeMeta {
    version?: string
    requiresRestart?: boolean
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    website?: string
    description?: string
}

export class IdpManager {
    private secrets: ISecrets
    private configMaps: IConfigMaps
    private registeredIdps: Map<string, TIdpConnectorConstructor>
    private installedConnectorIds = new Set<string>()
    // metadata per connector (version/origin/website) for the UI, crossed in listConnectors; populated in init/install/loadDevIdps
    private connectorMeta = new Map<string, IConnectorRuntimeMeta>()

    constructor(secrets: ISecrets, configMaps: IConfigMaps, registeredIdps: Map<string, TIdpConnectorConstructor>) {
        this.secrets = secrets
        this.configMaps = configMaps
        this.registeredIdps = registeredIdps
    }

    // ---------------- connectors (types) ----------------

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
                    marketplaceId: m?.marketplaceId,
                    marketplaceLabel: m?.marketplaceLabel,
                    website: m?.website,
                    description: m?.description,
                    requiresRestart: m?.requiresRestart
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

    // ---------------- installable connectors (tgz), a mirror of ProviderManager ----------------

    // loads the index of installed connectors (it only marks ids; the code is loaded in loadAll)
    async init(): Promise<void> {
        const index = (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
        for (const m of index) {
            this.installedConnectorIds.add(m.id)
            this.connectorMeta.set(m.id, { version: m.version, requiresRestart: m.requiresRestart, installedFrom: m.installedFrom, marketplaceId: m.marketplaceId, marketplaceLabel: m.marketplaceLabel, website: m.website, description: m.description })
        }
    }

    async listInstalledMeta(): Promise<IIdpConnectorMeta[]> {
        return (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
    }

    // installs a connector from a tgz (an http(s) URL, file:// or a local path). The back.js is stored
    // compressed in a configmap and registered in registeredIdps.
    async install(tarGzUrl: string, installedFrom?: string, marketplaceId?: string, marketplaceLabel?: string, upgrade?: boolean): Promise<IIdpConnectorMeta> {
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
                await downloadFile(tarGzUrl, tmpTgz, await packageHeaders(tarGzUrl))
            }
            await tar.x({ file: tmpTgz, cwd: tmpDir })

            let metaPath = path.join(tmpDir, 'package.json')
            let backPath = path.join(tmpDir, 'back.js')
            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) {
                // the npm format (a 'package' folder at the top level)
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
                installedFrom: installedFrom ?? tarGzUrl,
                marketplaceId,
                marketplaceLabel,
                requiresRestart: pkg.requiresRestart ?? false,
                requiresExtension: pkg.requiresExtension ?? []
            }
            // A connector that requires a DCE is not installed without it (plans/completed/dce/PRD.md, RF8).
            await assertDceRequirements('IdP connector', meta.id, meta.requiresExtension, installedFrom)
            const index = (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
            /*
                This was the only one of the eleven that let an installation be overwritten without asking
                permission — the gap where the others have their guard was literally empty, with a comment
                in it. Now it follows the same rule as the rest: replacing is asked for, and only forwards.

                What is bundled and what comes from dev are left out, as in logins and docs: they are
                reinstalled on every startup and do not come through here to update anything.
            */
            if (installedFrom !== 'bundled' && installedFrom !== 'dev')
                assertInstallable('IdP connector', meta.id, this.installedConnectorIds.has(meta.id) ? (index.find(m => m.id === meta.id) ?? {}) : undefined, meta.version, upgrade)
            const backJs = fs.readFileSync(backPath, 'utf-8')
            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored) logError(ELogComponent.AUTH, `IdP connector '${meta.id}' back.js (${Math.round(backCompressed.length / 1024)}KB) exceeds configmap limit`)

            await this.configMaps.write(`kwirth-idp-connector-${meta.id}-meta`, meta)
            // null and not skipping the write: when updating, if the previous back end fitted and the
            // current one does not, skipping it would leave the OLD code there. What is installed has to
            // be what the package carries.
            await this.configMaps.write(`kwirth-idp-connector-${meta.id}-back`, meta.backStored ? { code: backCompressed, compressed: true } : null)

            const existing = index.findIndex(m => m.id === meta.id)
            if (existing >= 0) index[existing] = meta
            else index.push(meta)
            await this.configMaps.write(CONNECTORS_INDEX, index)
            this.installedConnectorIds.add(meta.id)
            this.connectorMeta.set(meta.id, { version: meta.version, requiresRestart: meta.requiresRestart, installedFrom: meta.installedFrom, marketplaceId: meta.marketplaceId, marketplaceLabel: meta.marketplaceLabel, website: meta.website, description: meta.description })

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

    // installs bundled connectors from a directory of tgz files (tools/scripts/fetch-bundled.mjs leaves them there)
    // The bundled directory is shared: without filtering by type any tgz was attempted as an IdP
    // connector, leaning on the later failure to discard it.
    async installBundled(dir: string): Promise<void> {
        for (const filePath of await listBundledOfType(dir, EExtensionType.IDP)) {
            const file = path.basename(filePath)
            try {
                await this.install(filePath, 'bundled')
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Failed to install bundled IdP connector '${file}': ${err}`)
            }
        }
    }

    async uninstall(connectorId: string): Promise<void> {
        const meta = this.connectorMeta.get(connectorId)
        if (meta?.installedFrom?.startsWith('pack:')) throw new Error(`IdP connector '${connectorId}' was installed by pack '${meta.installedFrom.slice(5)}' — uninstall the pack instead`)
        await this._doUninstall(connectorId)
    }

    async uninstallFromPack(connectorId: string): Promise<void> {
        await this._doUninstall(connectorId)
    }

    private async _doUninstall(connectorId: string): Promise<void> {
        this.registeredIdps.delete(connectorId)
        this.installedConnectorIds.delete(connectorId)
        this.connectorMeta.delete(connectorId)
        const index = (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
        await this.configMaps.write(CONNECTORS_INDEX, index.filter(m => m.id !== connectorId))
        await this.configMaps.write(`kwirth-idp-connector-${connectorId}-meta`, null)
        await this.configMaps.write(`kwirth-idp-connector-${connectorId}-back`, null)
        // deletes the instances that depended on this connector: leaving them orphaned would have the
        // login offer them and have them fail with 'connector not available'
        const orphans = (await this.listInstances()).filter(i => i.connectorId === connectorId)
        for (const inst of orphans) await this.deleteInstance(inst.id)
        logInfo(ELogComponent.AUTH, `IdP connector '${connectorId}' uninstalled${orphans.length ? ` (removed ${orphans.length} instance(s))` : ''}`)
    }

    // loads (registers) every installed connector from the configmap (at startup)
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

    // evaluates the connector's back.js (which references the __kwirth_back__ global) and registers its class
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

    // ---------------- instancias (Secret kwirth-idps) ----------------

    // the 'kwirth-idps' Secret stores ONE KEY PER INSTANCE (writeKey/readAllKeys do the base64/JSON per
    // key; the values of a K8s Secret must be strings, not objects).
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

    // replaces ${VAR} with process.env.VAR in strings, recursively (so as not to put secrets in the json)
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

    // loads connectors in dev from kwirth-dev.json → idps: { id: distPath }
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

    // preloads instances into the Secret from kwirth-dev.json → idpConfigs (with ${ENV} interpolation)
    async loadDevIdpConfigs(): Promise<void> {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const configs: Record<string, IIdpInstanceConfig> = raw.idpConfigs ?? {}
            for (const [id, cfg] of Object.entries(configs)) {
                // seed only-if-absent: do NOT overwrite an already configured instance (from the UI or a previous seed)
                if (await this.getInstance(id)) continue
                const interpolated = IdpManager.interpolateEnvDeep(cfg) as IIdpInstanceConfig
                interpolated.id = id
                // do not seed instances with no real config (missing env vars, for instance → everything empty)
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
