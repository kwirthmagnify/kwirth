import fs from 'fs'
import path from 'path'
import { ISecrets } from '../ISecrets'
import { ELogComponent, logError, logInfo } from '../Logging'
import { EIdpConnectorKind, IIdpConnector, IIdpInstanceConfig, TIdpConnectorConstructor } from './IIdpConnector'
import type { IProviderSchemaField } from '../ProviderManager'

const IDPS_SECRET = 'kwirth-idps'

// info publica de un tipo de conector (para la UI de gestion)
interface IIdpConnectorInfo {
    connectorId: string
    label: string
    kind: EIdpConnectorKind
    schema: IProviderSchemaField[]
    installed: boolean          // false = bundled/dev registrado en codigo; true = instalado en runtime
}

/*
    Gestiona los conectores de IdP (registry) y las instancias configuradas.
    - Conectores: bundled (registerConnector en arranque), dev (loadDevIdps) e instalables (EPIC G).
    - Instancias: se persisten TODAS en un unico Secret 'kwirth-idps' (incluye secretos como clientSecret).
    Espejo del patron de ProviderManager, pero la config va a Secret (no ConfigMap) y en un unico documento.
*/
export class IdpManager {
    private secrets: ISecrets
    private registeredIdps: Map<string, TIdpConnectorConstructor>
    private installedConnectorIds = new Set<string>()

    constructor(secrets: ISecrets, registeredIdps: Map<string, TIdpConnectorConstructor>) {
        this.secrets = secrets
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
                result.push({
                    connectorId,
                    label: c.label,
                    kind: c.kind,
                    schema: c.getConfigSchema(),
                    installed: this.installedConnectorIds.has(connectorId)
                })
            }
            catch (err) {
                logError(ELogComponent.AUTH, `Error instantiating IdP connector '${connectorId}': ${err}`)
            }
        }
        return result
    }

    getConnectorSchema(connectorId: string): IProviderSchemaField[] | undefined {
        const c = this.getConnector(connectorId)
        return c ? c.getConfigSchema() : undefined
    }

    // ---------------- instancias (Secret kwirth-idps) ----------------

    private async readRecord(): Promise<Record<string, IIdpInstanceConfig>> {
        try {
            const rec = await this.secrets.read(IDPS_SECRET)
            return (rec && typeof rec === 'object') ? rec : {}
        }
        catch (err) {
            return {}
        }
    }

    private async writeRecord(rec: Record<string, IIdpInstanceConfig>): Promise<void> {
        await this.secrets.write(IDPS_SECRET, rec)
    }

    async listInstances(): Promise<IIdpInstanceConfig[]> {
        const rec = await this.readRecord()
        return Object.values(rec)
    }

    async getInstance(id: string): Promise<IIdpInstanceConfig | undefined> {
        const rec = await this.readRecord()
        return rec[id]
    }

    async getEnabledInstances(): Promise<IIdpInstanceConfig[]> {
        const rec = await this.readRecord()
        return Object.values(rec).filter(i => i.enabled)
    }

    async saveInstance(instance: IIdpInstanceConfig): Promise<void> {
        const rec = await this.readRecord()
        rec[instance.id] = instance
        await this.writeRecord(rec)
        logInfo(ELogComponent.AUTH, `IdP instance '${instance.id}' (connector '${instance.connectorId}') saved`)
    }

    async deleteInstance(id: string): Promise<void> {
        const rec = await this.readRecord()
        if (rec[id]) {
            delete rec[id]
            await this.writeRecord(rec)
            logInfo(ELogComponent.AUTH, `IdP instance '${id}' deleted`)
        }
    }

    // ---------------- export / import ----------------

    async exportConfig(): Promise<Record<string, IIdpInstanceConfig>> {
        return this.readRecord()
    }

    async importConfig(rec: Record<string, IIdpInstanceConfig>): Promise<void> {
        await this.writeRecord(rec)
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
                this.reloadDevConnector(id, path.join(path.resolve(distPath), 'back.js'))
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
                const interpolated = IdpManager.interpolateEnvDeep(cfg) as IIdpInstanceConfig
                interpolated.id = id
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
