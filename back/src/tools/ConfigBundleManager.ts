import { IExtension } from '@kwirthmagnify/kwirth-common-back'
import {
    EExtensionType, EBundleEntryStatus, IConfigBundle, IConfigBundleEntry, IExportableEntry,
    IImportPreviewEntry, IImportEntryOutcome, IImportReport, IExtensionImportResult,
    CONFIG_BUNDLE_KIND, CONFIG_BUNDLE_FORMAT_VERSION, CORE_SETTINGS_KEY, CORE_SHARED_AI_KEY, bundleEntryKey
} from '@kwirthmagnify/kwirth-common'
import { ELogComponent, logInfo, logWarning } from './Logging'

/*
    Configuration portability: taking one Kwirth's configuration to another.

    THIS FILE DOES NOT UNDERSTAND WHAT IT CARRIES, and that is on purpose. Plugins with a back end of
    their own store their configuration wherever they like — Excubitor and Agora in their own Postgres,
    and there their rules and their rooms (configuration) live alongside their findings and their
    messages (working data, which must NOT travel). Only the extension knows which is which, so the core
    confines itself to:

      - asking whoever can answer (`IExtension.exportConfig`)
      - putting what they give it into a file, without looking at it
      - at the other end, locating the recipient and handing it its part (`importConfig`)

    What the core DOES contribute on its own account is its own: the global settings and the common AI
    store, which belongs to no extension.

    See `plans/config-portability/PRD.md` and `PLAN.md`.
*/

/** A candidate extension, with its live instance should there be one. */
export interface IExtensionRef {
    type: EExtensionType
    id: string
    displayName: string
    version?: string
    marketplace?: string
    /*
        With no instance there is nobody to ask. It really happens: of the channels, only the required
        ones are instantiated, and never those announced as REMOTE, so an installed plugin may have none.
        A temporary one is not created, on purpose — a channel's constructor opens informers and
        connections, and waking half a plugin up in order to read a configuration off it is a
        disproportionate side effect and hard to undo.
    */
    instance?: IExtension
}

/** Where the live extensions come from. Injected so this can be tested without half a core. */
export type TExtensionSource = () => Promise<IExtensionRef[]>

/** What the core contributes on its own account. Injected for the same reason. */
export interface ICorePortableConfig {
    readSettings: () => Promise<unknown>
    writeSettings: (data: unknown) => Promise<void>
    readSharedAi: (includeCredentials: boolean) => Promise<unknown>
    writeSharedAi: (data: unknown) => Promise<void>
}

export interface IExportRequest {
    /** The keys to include. When it is not passed, everything available goes in. */
    include?: string[]
    includeCredentials: boolean
    source?: string
}

export interface IImportRequest {
    bundle: IConfigBundle
    /** The keys to apply. When it is not passed, everything applicable is applied. */
    include?: string[]
}

/** The state of a bundle entry at export time. */
export const exportStatusOf = (ref: IExtensionRef): EBundleEntryStatus => {
    if (!ref.instance) return EBundleEntryStatus.NOT_INSTANTIATED
    if (!ref.instance.exportConfig) return EBundleEntryStatus.NOT_SUPPORTED
    return EBundleEntryStatus.AVAILABLE
}

/*
    The state of a bundle entry at import time. The order of the checks matters: "not installed" has to
    beat "does not support", because they are two different messages for the user — install something, or
    wait for its author to adopt the contract — and confusing them sends one looking in the wrong place.
    A difference in version prevents nothing: it warns.
*/
export const importStatusOf = (entry: IConfigBundleEntry, ref: IExtensionRef | undefined): EBundleEntryStatus => {
    if (!ref) return EBundleEntryStatus.NOT_INSTALLED
    if (!ref.instance) return EBundleEntryStatus.NOT_INSTANTIATED
    if (!ref.instance.importConfig) return EBundleEntryStatus.NOT_SUPPORTED
    if (entry.version && ref.version && entry.version !== ref.version) return EBundleEntryStatus.VERSION_DIFFERS
    return EBundleEntryStatus.AVAILABLE
}

/** A bundle that is not Kwirth's, or of a format we cannot read, is rejected BEFORE anything is touched. */
export const validateBundle = (data: unknown): string | undefined => {
    if (!data || typeof data !== 'object') return 'not an object'
    const b = data as Partial<IConfigBundle>
    if (b.kind !== CONFIG_BUNDLE_KIND) return `not a Kwirth configuration bundle (kind: ${String(b.kind)})`
    if (typeof b.formatVersion !== 'number') return 'missing formatVersion'
    // A newer format is not guessed at: it is stated that it cannot be read, which is useful information.
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

    /** What there is to export and what state each thing is in. It is what the dialog draws. */
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
                // The file declares whether it carries secrets. Whoever stores it in their downloads
                // folder deserves to be able to know it without reading the whole JSON.
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
                // An extension failing must not take the whole export down with it: it is left out and
                // said in the log. The dialog already warned that not everything might be there.
                logWarning(ELogComponent.CORE, `Config export: '${key}' failed and was left out: ${err}`)
            }
        }

        logInfo(ELogComponent.CORE, `Config bundle exported: ${bundle.extensions.length} extension(s)` +
            `${request.includeCredentials ? ' WITH credentials' : ''}`)
        return bundle
    }

    /** What would happen with each bundle entry. It touches nothing. */
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

            // Not installed, with no instance or without the method: it is warned about and ignored. The
            // core installs NOTHING — installing would mean reaching a marketplace, resolving licences
            // and waiting for startups in the middle of an import, and that is a fragile process inside
            // another one.
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
                // An entry that blows up does not stop the rest: that is the contract with the user.
                logWarning(ELogComponent.CORE, `Config import: '${key}' failed: ${err}`)
                entries.push({ type: entry.type, id: entry.id, status, error: String(err) })
            }
        }

        logInfo(ELogComponent.CORE, `Config bundle imported: ${entries.filter(e => e.result).length} applied, ` +
            `${entries.filter(e => !e.result).length} skipped or failed`)
        return { entries, coreApplied }
    }
}
