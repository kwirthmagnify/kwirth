import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'
import tar from 'tar'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'
import { EIdpConnectorKind, IIdpConnector, IIdpConfigFieldDef, IIdpInstanceConfig, TIdpConnectorConstructor } from '@kwirthmagnify/kwirth-common-back'
import { EExtensionTag, EExtensionType, IConfigValidationError, IExtensionRequirement, extensionTagsOf, pruneConfig, validateConfig } from '@kwirthmagnify/kwirth-common'
import { ExtensionConfigStore } from './ExtensionConfigStore'
import { listBundledOfType } from './BundledExtensions'
import { downloadFile, packageHeaders } from './PackageRegistries'
import { assertInstallable } from './ExtensionInstallGuard'
import { assertExtensionRequirements, normalizeRequires } from './ExtensionDeps'

// An instance's id names its Secret (kwirth-idp-<id>-config): a DNS-1123 label, which the ids in use
// (the connector's: github, google, entraid) already are
const isValidInstanceId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9]([-a-z0-9]{0,40}[a-z0-9])?$/.test(id)

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
    tags?: EExtensionTag[]
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
    tags?: EExtensionTag[]
    installedFrom?: string
    // Which marketplace it came from. It is STORED on install, not deduced: the tarball's url points at
    // the package registry, which is another server, and with precedence by id two marketplaces can
    // serve the same extension. Absent = it came from no marketplace (dev, a file or a loose url).
    marketplaceId?: string
    marketplaceLabel?: string
    backStored?: boolean
    requiresRestart?: boolean
    requiresExtension?: IExtensionRequirement[]
}

/*
    Manages the IdP connectors (the registry) and the configured instances.
    - Connectors: bundled (registerConnector at startup), dev (loadDevIdps) and installable (EPIC G).
    - Instances: ONE Secret per instance, `kwirth-idp-<instanceId>-config`, in the common
      ExtensionConfigStore (plans/extension-config, S5). Per INSTANCE and not per connector because the
      whole core finds one by its id alone (the auth routes, the OAuth state, IUser.idp), so it stays a
      direct read; a connector's instances are found by their connectorId.
*/
// What is known about a connector at runtime, for crossing it with its class when listing them in the UI.
interface IConnectorRuntimeMeta {
    version?: string
    requiresRestart?: boolean
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    website?: string
    tags?: EExtensionTag[]
    description?: string
}

export class IdpManager {
    private configStore: ExtensionConfigStore
    private configMaps: IConfigMaps
    private registeredIdps: Map<string, TIdpConnectorConstructor>
    private installedConnectorIds = new Set<string>()
    // metadata per connector (version/origin/website) for the UI, crossed in listConnectors; populated in init/install/loadDevIdps
    private connectorMeta = new Map<string, IConnectorRuntimeMeta>()

    constructor(configStore: ExtensionConfigStore, configMaps: IConfigMaps, registeredIdps: Map<string, TIdpConnectorConstructor>) {
        this.configStore = configStore
        this.configMaps = configMaps
        this.registeredIdps = registeredIdps
    }

    // ---------------- connectors (types) ----------------

    registerConnector(connectorId: string, ctor: TIdpConnectorConstructor, installed = false): void {
        this.registeredIdps.set(connectorId, ctor)
        if (installed) this.installedConnectorIds.add(connectorId)
    }

    /*
        A connector is THIRD-PARTY code, so constructing it can throw — and it does, for a real reason:
        a connector built against a newer common-back calls an export the running core does not have
        yet, which is exactly what happens between installing the connector and restarting the core.

        It used to throw out of here. From an async route Express does not catch it, so it surfaced as an
        unhandledRejection and took the whole core down. listConnectors() already guarded it; these two
        did not, and that asymmetry was the bug.
    */
    getConnector(connectorId: string): IIdpConnector | undefined {
        const Ctor = this.registeredIdps.get(connectorId)
        if (!Ctor) return undefined
        try {
            return new Ctor()
        }
        catch (err) {
            logError(ELogComponent.AUTH, `Error instantiating IdP connector '${connectorId}': ${err}`)
            return undefined
        }
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
                    tags: m?.tags,
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

    /*
        undefined means 'the schema could NOT be read', which is not the same as a connector with no
        fields ([]). Whoever masks secrets has to tell them apart: with no schema there is no way to know
        which fields are passwords, and treating that as 'no password fields' would hand them over in
        the clear.
    */
    getConnectorSchema(connectorId: string): IIdpConfigFieldDef[] | undefined {
        const c = this.getConnector(connectorId)
        if (!c) return undefined
        try {
            return c.getConfigSchema()
        }
        catch (err) {
            logError(ELogComponent.AUTH, `Error reading the config schema of IdP connector '${connectorId}': ${err}`)
            return undefined
        }
    }

    // ---------------- installable connectors (tgz), a mirror of ProviderManager ----------------

    // loads the index of installed connectors (it only marks ids; the code is loaded in loadAll)
    async init(): Promise<void> {
        const index = (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
        for (const m of index) {
            this.installedConnectorIds.add(m.id)
            this.connectorMeta.set(m.id, { version: m.version, requiresRestart: m.requiresRestart, installedFrom: m.installedFrom, marketplaceId: m.marketplaceId, marketplaceLabel: m.marketplaceLabel, website: m.website, tags: m.tags, description: m.description })
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
                tags: extensionTagsOf(pkg.tags),
                installedFrom: installedFrom ?? tarGzUrl,
                marketplaceId,
                marketplaceLabel,
                requiresRestart: pkg.requiresRestart ?? false,
                requiresExtension: normalizeRequires(pkg.requiresExtension)
            }
            // A connector that requires an extension is not installed without it (plans/completed/dce/PRD.md, RF8).
            await assertExtensionRequirements('IdP connector', meta.id, meta.requiresExtension, installedFrom)
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
            this.connectorMeta.set(meta.id, { version: meta.version, requiresRestart: meta.requiresRestart, installedFrom: meta.installedFrom, marketplaceId: meta.marketplaceId, marketplaceLabel: meta.marketplaceLabel, website: meta.website, tags: meta.tags, description: meta.description })

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

    // deleteConfig: the connector's instances go too only when asked (plans/extension-config, P5). Kept,
    // they are not offered on the login while the connector is missing (AuthApi skips them), and they are
    // back as they were on a reinstall.
    async uninstall(connectorId: string, deleteConfig = false): Promise<void> {
        const meta = this.connectorMeta.get(connectorId)
        if (meta?.installedFrom?.startsWith('pack:')) throw new Error(`IdP connector '${connectorId}' was installed by pack '${meta.installedFrom.slice(5)}' — uninstall the pack instead`)
        await this._doUninstall(connectorId, deleteConfig)
    }

    async uninstallFromPack(connectorId: string, deleteConfig = false): Promise<void> {
        await this._doUninstall(connectorId, deleteConfig)
    }

    private async _doUninstall(connectorId: string, deleteConfig: boolean): Promise<void> {
        this.registeredIdps.delete(connectorId)
        this.installedConnectorIds.delete(connectorId)
        this.connectorMeta.delete(connectorId)
        const index = (await this.configMaps.read(CONNECTORS_INDEX, []) as IIdpConnectorMeta[]) || []
        await this.configMaps.write(CONNECTORS_INDEX, index.filter(m => m.id !== connectorId))
        await this.configMaps.write(`kwirth-idp-connector-${connectorId}-meta`, null)
        await this.configMaps.write(`kwirth-idp-connector-${connectorId}-back`, null)
        let removed = 0
        if (deleteConfig) {
            const orphans = (await this.listInstances()).filter(i => i.connectorId === connectorId)
            for (const inst of orphans) await this.deleteInstance(inst.id)
            removed = orphans.length
        }
        logInfo(ELogComponent.AUTH, `IdP connector '${connectorId}' uninstalled${removed ? ` (removed ${removed} instance(s))` : ''}`)
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
            /*
                The sourceURL is what gives the connector a NAME in the stack, and without it the core
                dies for its mistakes. Compiled with new Function the code is anonymous, so a failure
                born inside it shows up as 'eval at loadBackConnector (…), <anonymous>' — and
                failureOrigin() attributes by file name. With nothing to attribute, an extension's
                failure is counted as the core's and the process exits (see tools/FailureOrigin.ts).

                The name is the shape that file already has everywhere else — kwirth-<type>-<id>-back.js
                — so the existing heuristic recognises it without being told about IdPs. Note the
                __filename ARGUMENT below does not do this: it is a variable the module can read, not
                the name V8 writes in the stack.
            */
            const wrap = new Function('module', 'exports', 'require', '__filename', '__dirname',
                `${backJs}\n//# sourceURL=kwirth-idp-${connectorId}-back.js`)
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

    // ---------------- instances (one Secret each, in the ExtensionConfigStore) ----------------

    async listInstances(): Promise<IIdpInstanceConfig[]> {
        const result: IIdpInstanceConfig[] = []
        for (const id of await this.configStore.list(EExtensionType.IDP)) {
            const inst = await this.getInstance(id)
            if (inst) result.push(inst)
        }
        return result
    }

    // What is stored, if it has the shape of an instance; anything else is reported and read as absent
    async getInstance(id: string): Promise<IIdpInstanceConfig | undefined> {
        const stored = await this.configStore.read(EExtensionType.IDP, id)
        if (stored === undefined) return undefined
        const inst = stored as IIdpInstanceConfig
        if (typeof stored !== 'object' || stored === null || typeof inst.connectorId !== 'string' || !inst.config || typeof inst.config !== 'object') {
            logWarning(ELogComponent.AUTH, `IdP instance '${id}' is not readable as an instance: it is treated as absent`)
            return undefined
        }
        return { ...inst, id }
    }

    async getEnabledInstances(): Promise<IIdpInstanceConfig[]> {
        return (await this.listInstances()).filter(i => i.enabled)
    }

    /*
        Stores the instance WHOLE (no merge): what arrives is what stays. Its `config` is pruned and
        validated against its connector's schema, as every other family's config; the errors are returned
        and nothing is stored. With no schema (a broken connector) it is stored as it comes and a warning
        logged — validation must not stop an admin from repairing it (plan, P2).

        The id names a Kubernetes Secret, so it has to be a valid name: lower case, digits and '-'.
    */
    async saveInstance(instance: IIdpInstanceConfig): Promise<IConfigValidationError[]> {
        if (!isValidInstanceId(instance.id)) return [{ field: 'id', message: `'${instance.id}' is not a valid id: lower case letters, digits and '-'` }]
        const schema = this.getConnectorSchema(instance.connectorId)
        let config = instance.config ?? {}
        if (!schema || schema.length === 0) {
            logWarning(ELogComponent.AUTH, `IdP instance '${instance.id}' saved without validation: the schema of connector '${instance.connectorId}' is not available`)
        }
        else {
            config = pruneConfig(schema, config)
            const errors = validateConfig(schema, config)
            if (errors.length > 0) return errors
        }
        await this.configStore.write(EExtensionType.IDP, instance.id, { ...instance, config })
        logInfo(ELogComponent.AUTH, `IdP instance '${instance.id}' (connector '${instance.connectorId}') saved`)
        return []
    }

    async deleteInstance(id: string): Promise<void> {
        await this.configStore.delete(EExtensionType.IDP, id)
        logInfo(ELogComponent.AUTH, `IdP instance '${id}' deleted`)
    }

    // ---------------- export / import ----------------

    async exportConfig(): Promise<Record<string, IIdpInstanceConfig>> {
        const rec: Record<string, IIdpInstanceConfig> = {}
        for (const inst of await this.listInstances()) rec[inst.id] = inst
        return rec
    }

    // Each one through saveInstance, so the same validation as the dialog: what does not fit is not stored
    async importConfig(rec: Record<string, IIdpInstanceConfig>): Promise<string[]> {
        const warnings: string[] = []
        let applied = 0
        for (const [id, inst] of Object.entries(rec)) {
            const errors = await this.saveInstance({ ...inst, id })
            if (errors.length > 0) warnings.push(`IdP instance '${id}' not applied: ${errors.map(e => e.message).join('; ')}`)
            else applied++
        }
        logInfo(ELogComponent.AUTH, `Imported ${applied} IdP instance(s)${warnings.length ? `, ${warnings.length} not applied` : ''}`)
        return warnings
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
                    this.connectorMeta.set(id, { version: pkg.version, website: pkg.website, tags: extensionTagsOf(pkg.tags), description: pkg.description, installedFrom: 'dev' })
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
                const errors = await this.saveInstance(interpolated)
                if (errors.length > 0) {
                    logWarning(ELogComponent.AUTH, `[dev] IdP instance '${id}' from kwirth-dev.json not preloaded: ${errors.map(e => e.message).join('; ')}`)
                    continue
                }
                logInfo(ELogComponent.AUTH, `[dev] IdP instance '${id}' preloaded from kwirth-dev.json`)
            }
        }
        catch (err) {
            logError(ELogComponent.AUTH, `Failed to load kwirth-dev.json (idpConfigs): ${err}`)
        }
    }
}

export { IIdpConnectorInfo }
