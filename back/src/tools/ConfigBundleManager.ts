import { IExtension } from '@kwirthmagnify/kwirth-common-back'
import {
    EExtensionType, EBundleEntryStatus, IConfigBundle, IConfigBundleEntry, IExportableEntry,
    IImportPreviewEntry, IImportEntryOutcome, IImportReport, IExtensionImportResult,
    CONFIG_BUNDLE_KIND, CONFIG_BUNDLE_FORMAT_VERSION, CORE_SETTINGS_KEY, CORE_SHARED_AI_KEY, bundleEntryKey
} from '@kwirthmagnify/kwirth-common'
import { ELogComponent, logInfo, logWarning } from './Logging'

/*
    Portabilidad de configuracion: llevarse la configuracion de un Kwirth a otro.

    ESTE FICHERO NO ENTIENDE LO QUE TRANSPORTA, y es a proposito. Los plugins con back propio guardan su
    configuracion donde quieren —Excubitor y Agora en su propio Postgres, y ahi conviven sus reglas y
    sus salas (configuracion) con sus findings y sus mensajes (datos de trabajo, que NO deben viajar)—.
    Solo la extension sabe cual es cual, asi que el core se limita a:

      - preguntar a quien pueda responder (`IExtension.exportConfig`)
      - meter lo que le den en un fichero, sin mirarlo
      - en el otro extremo, localizar al destinatario y entregarle su parte (`importConfig`)

    Lo que el core SI aporta por su cuenta es lo suyo: los ajustes globales y el almacen comun de IA,
    que no pertenece a ninguna extension.

    Ver `plans/config-portability/PRD.md` y `PLAN.md`.
*/

/** Una extension candidata, con su instancia viva si es que la hay. */
export interface IExtensionRef {
    type: EExtensionType
    id: string
    displayName: string
    version?: string
    marketplace?: string
    /*
        Sin instancia no hay a quien preguntar. Pasa de verdad: de los canales solo se instancian los
        requeridos, y nunca los anunciados como REMOTE, asi que un plugin instalado puede no tener
        ninguna. No se crea una temporal a proposito — un constructor de canal abre informers y
        conexiones, y despertar medio plugin para leerle una configuracion es un efecto secundario
        desproporcionado y dificil de deshacer.
    */
    instance?: IExtension
}

/** De donde salen las extensiones vivas. Inyectado para que esto se pueda testear sin medio core. */
export type TExtensionSource = () => Promise<IExtensionRef[]>

/** Lo que el core aporta de su parte. Inyectado por el mismo motivo. */
export interface ICorePortableConfig {
    readSettings: () => Promise<unknown>
    writeSettings: (data: unknown) => Promise<void>
    readSharedAi: (includeCredentials: boolean) => Promise<unknown>
    writeSharedAi: (data: unknown) => Promise<void>
}

export interface IExportRequest {
    /** Claves a incluir. Si no se pasa, entra todo lo disponible. */
    include?: string[]
    includeCredentials: boolean
    source?: string
}

export interface IImportRequest {
    bundle: IConfigBundle
    /** Claves a aplicar. Si no se pasa, se aplica todo lo aplicable. */
    include?: string[]
}

/** El estado de una entrada del bundle a la hora de exportar. */
export const exportStatusOf = (ref: IExtensionRef): EBundleEntryStatus => {
    if (!ref.instance) return EBundleEntryStatus.NOT_INSTANTIATED
    if (!ref.instance.exportConfig) return EBundleEntryStatus.NOT_SUPPORTED
    return EBundleEntryStatus.AVAILABLE
}

/*
    El estado de una entrada del bundle a la hora de importar. El orden de las comprobaciones importa:
    "no instalada" tiene que ganar a "no soporta", porque son dos mensajes distintos para el usuario
    —instalar algo, o esperar a que su autor adopte el contrato— y confundirlos manda a buscar donde no
    es. La diferencia de version no impide nada: avisa.
*/
export const importStatusOf = (entry: IConfigBundleEntry, ref: IExtensionRef | undefined): EBundleEntryStatus => {
    if (!ref) return EBundleEntryStatus.NOT_INSTALLED
    if (!ref.instance) return EBundleEntryStatus.NOT_INSTANTIATED
    if (!ref.instance.importConfig) return EBundleEntryStatus.NOT_SUPPORTED
    if (entry.version && ref.version && entry.version !== ref.version) return EBundleEntryStatus.VERSION_DIFFERS
    return EBundleEntryStatus.AVAILABLE
}

/** Un bundle que no sea de Kwirth, o de un formato que no sabemos leer, se rechaza ANTES de tocar nada. */
export const validateBundle = (data: unknown): string | undefined => {
    if (!data || typeof data !== 'object') return 'not an object'
    const b = data as Partial<IConfigBundle>
    if (b.kind !== CONFIG_BUNDLE_KIND) return `not a Kwirth configuration bundle (kind: ${String(b.kind)})`
    if (typeof b.formatVersion !== 'number') return 'missing formatVersion'
    // Un formato mas nuevo no se intenta adivinar: se dice que no se sabe leer, que es informacion util.
    if (b.formatVersion > CONFIG_BUNDLE_FORMAT_VERSION) {
        return `bundle format ${b.formatVersion} is newer than supported (${CONFIG_BUNDLE_FORMAT_VERSION}); upgrade Kwirth to read it`
    }
    if (!Array.isArray(b.extensions)) return 'missing extensions array'
    if (!b.core || typeof b.core !== 'object') return 'missing core section'
    return undefined
}

export class ConfigBundleManager {
    private extensionSource: TExtensionSource
    private core: ICorePortableConfig
    private kwirthVersion: string

    constructor(extensionSource: TExtensionSource, core: ICorePortableConfig, kwirthVersion: string) {
        this.extensionSource = extensionSource
        this.core = core
        this.kwirthVersion = kwirthVersion
    }

    /** Que hay para exportar y en que estado esta cada cosa. Es lo que pinta el dialogo. */
    async listExportable(): Promise<IExportableEntry[]> {
        const refs = await this.extensionSource()
        return refs.map(ref => ({
            type: ref.type,
            id: ref.id,
            displayName: ref.displayName,
            version: ref.version,
            marketplace: ref.marketplace,
            status: exportStatusOf(ref)
        }))
    }

    async export(request: IExportRequest): Promise<IConfigBundle> {
        const quiere = (key: string): boolean => !request.include || request.include.includes(key)

        const bundle: IConfigBundle = {
            kind: CONFIG_BUNDLE_KIND,
            formatVersion: CONFIG_BUNDLE_FORMAT_VERSION,
            meta: {
                exportedAt: new Date().toISOString(),
                kwirthVersion: this.kwirthVersion,
                source: request.source,
                // El fichero declara si lleva secretos. Quien lo guarda en su carpeta de descargas
                // merece poder saberlo sin leerse el JSON entero.
                includesCredentials: request.includeCredentials
            },
            core: {},
            extensions: []
        }

        if (quiere(CORE_SETTINGS_KEY)) bundle.core.settings = await this.core.readSettings()
        if (quiere(CORE_SHARED_AI_KEY)) bundle.core.sharedAi = await this.core.readSharedAi(request.includeCredentials)

        for (const ref of await this.extensionSource()) {
            const key = bundleEntryKey(ref.type, ref.id)
            if (!quiere(key)) continue
            if (exportStatusOf(ref) !== EBundleEntryStatus.AVAILABLE) continue
            try {
                const config = await ref.instance!.exportConfig!({ includeCredentials: request.includeCredentials })
                bundle.extensions.push({
                    type: ref.type,
                    id: ref.id,
                    version: ref.version,
                    marketplace: ref.marketplace,
                    config
                })
            }
            catch (err) {
                // Que una extension falle no puede llevarse por delante el export entero: se deja fuera
                // y se dice en el log. El diálogo ya avisó de que podía no estar todo.
                logWarning(ELogComponent.CORE, `Config export: '${key}' failed and was left out: ${err}`)
            }
        }

        logInfo(ELogComponent.CORE, `Config bundle exported: ${bundle.extensions.length} extension(s)` +
            `${request.includeCredentials ? ' WITH credentials' : ''}`)
        return bundle
    }

    /** Que pasaria con cada entrada del bundle. No toca nada. */
    async preview(bundle: IConfigBundle): Promise<IImportPreviewEntry[]> {
        const refs = await this.extensionSource()
        const porClave = new Map(refs.map(r => [bundleEntryKey(r.type, r.id), r]))
        return bundle.extensions.map(entry => {
            const ref = porClave.get(bundleEntryKey(entry.type, entry.id))
            return {
                type: entry.type,
                id: entry.id,
                displayName: ref?.displayName ?? entry.id,
                version: entry.version,
                installedVersion: ref?.version,
                status: importStatusOf(entry, ref)
            }
        })
    }

    async import(request: IImportRequest): Promise<IImportReport> {
        const { bundle } = request
        const quiere = (key: string): boolean => !request.include || request.include.includes(key)
        const refs = await this.extensionSource()
        const porClave = new Map(refs.map(r => [bundleEntryKey(r.type, r.id), r]))

        const coreApplied: string[] = []
        if (bundle.core.settings !== undefined && quiere(CORE_SETTINGS_KEY)) {
            await this.core.writeSettings(bundle.core.settings)
            coreApplied.push(CORE_SETTINGS_KEY)
        }
        if (bundle.core.sharedAi !== undefined && quiere(CORE_SHARED_AI_KEY)) {
            await this.core.writeSharedAi(bundle.core.sharedAi)
            coreApplied.push(CORE_SHARED_AI_KEY)
        }

        const entries: IImportEntryOutcome[] = []
        for (const entry of bundle.extensions) {
            const key = bundleEntryKey(entry.type, entry.id)
            if (!quiere(key)) continue

            const ref = porClave.get(key)
            const status = importStatusOf(entry, ref)

            // No instalada, sin instancia o sin el metodo: se avisa y se ignora. El core NO instala
            // nada — instalar significaria alcanzar un marketplace, resolver licencias y esperar
            // arranques en medio de un import, y eso es un proceso fragil dentro de otro.
            if (status === EBundleEntryStatus.NOT_INSTALLED || status === EBundleEntryStatus.NOT_INSTANTIATED || status === EBundleEntryStatus.NOT_SUPPORTED) {
                logWarning(ELogComponent.CORE, `Config import: '${key}' skipped (${status})`)
                entries.push({ type: entry.type, id: entry.id, status })
                continue
            }

            try {
                const result: IExtensionImportResult = await ref!.instance!.importConfig!(entry.config)
                entries.push({ type: entry.type, id: entry.id, status, result })
            }
            catch (err) {
                // Una entrada que revienta no detiene a las demas: ese es el contrato con el usuario.
                logWarning(ELogComponent.CORE, `Config import: '${key}' failed: ${err}`)
                entries.push({ type: entry.type, id: entry.id, status, error: String(err) })
            }
        }

        logInfo(ELogComponent.CORE, `Config bundle imported: ${entries.filter(e => e.result).length} applied, ` +
            `${entries.filter(e => !e.result).length} skipped or failed`)
        return { entries, coreApplied }
    }
}
