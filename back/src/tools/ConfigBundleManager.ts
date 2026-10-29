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

/** A candidate extension, with the two interlocutors that may answer for it. */
export interface IExtensionRef {
    type: EExtensionType
    id: string
    displayName: string
    version?: string
    marketplace?: string
    /*
        What the CORE keeps about this extension, presented as one more `IExtension` (see
        `CoreManagedConfig`). Nearly every extension has one, and that is why nearly every extension
        exports something from day one without its author lifting a finger.
    */
    coreInstance?: IExtension
    /*
        And what the extension keeps on its own account, which only its live instance can answer for.
        With no instance there is nobody to ask. It really happens: of the channels, only the required
        ones are instantiated, and never those announced as REMOTE, so an installed plugin may have none.
        A temporary one is not created, on purpose — a channel's constructor opens informers and
        connections, and waking half a plugin up in order to read a configuration off it is a
        disproportionate side effect and hard to undo.
    */
    instance?: IExtension
    /*
        Whether this entry CAN have a live instance of its own at all. A channel or a provider can, so its
        absence is missing configuration and is reported as PARTIAL. An IdP connector, a toolset or a DCE
        cannot — their configuration is the core's by design — so the same absence takes nothing away and
        must not be shown as a loss.
    */
    instantiable?: boolean
}

/** Where the live extensions come from. Injected so this can be tested without half a core. */
export type TExtensionSource = () => Promise<IExtensionRef[]>

/** What the core contributes on its own account. Injected for the same reason. */
export interface ICorePortableConfig {
    readSettings: (includeCredentials: boolean) => Promise<unknown>
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

/*
    The state of a bundle entry at export time.

    The interesting case is the one in the middle: the core has something to export and the extension's
    instance is not there to be asked. That is NOT "available" — what would travel is half of it — and it
    is not "not instantiated" either, because something does travel. It is PARTIAL, and saying so is the
    whole point: an export that looks complete and is not is the worst outcome of the lot.
*/
export const exportStatusOf = (ref: IExtensionRef): EBundleEntryStatus => {
    if (ref.instance?.exportConfig) return EBundleEntryStatus.AVAILABLE
    const core = Boolean(ref.coreInstance?.exportConfig)
    // With a live instance there is no doubt: it was asked, and it has nothing of its own to give.
    if (ref.instance) return core ? EBundleEntryStatus.AVAILABLE : EBundleEntryStatus.NOT_SUPPORTED
    if (!core) return EBundleEntryStatus.NOT_INSTANTIATED
    return ref.instantiable ? EBundleEntryStatus.PARTIAL : EBundleEntryStatus.AVAILABLE
}

/*
    The state of a bundle entry at import time. The order of the checks matters: "not installed" has to
    beat "does not support", because they are two different messages for the user — install something, or
    wait for its author to adopt the contract — and confusing them sends one looking in the wrong place.
    A difference in version prevents nothing: it warns.
*/
export const importStatusOf = (entry: IConfigBundleEntry, ref: IExtensionRef | undefined, formatVersion = CONFIG_BUNDLE_FORMAT_VERSION): EBundleEntryStatus => {
    if (!ref) return EBundleEntryStatus.NOT_INSTALLED
    const own = Boolean(ref.instance?.importConfig)
    const core = Boolean(ref.coreInstance?.importConfig)
    if (!own && !core) return ref.instance ? EBundleEntryStatus.NOT_SUPPORTED : EBundleEntryStatus.NOT_INSTANTIATED
    /*
        The file carries the extension's own part and there is nobody here to receive it. It comes before
        the version warning on purpose: losing a piece of the configuration matters more than a version
        that does not match, and only one state can be shown.
    */
    const { config } = normalizeEntry(entry, formatVersion)
    if (config !== undefined && !own && ref.instantiable) return EBundleEntryStatus.PARTIAL
    if (entry.version && ref.version && entry.version !== ref.version) return EBundleEntryStatus.VERSION_DIFFERS
    return EBundleEntryStatus.AVAILABLE
}

/*
    An entry's two parts, whatever format version the file was written in.

    In format 1 both travelled inside `config`, and in two shapes: `{ core, own }` when the extension had
    something of its own, and the core's part bare when it did not. Reading that bare shape as the
    extension's own would hand a plugin a configuration that was never its and —worse— would silently
    drop the installation configuration of every entry exported before the extensions adopted the
    contract. Which is exactly what used to happen.

    🔴 THE FORMAT VERSION DECIDES, not the shape of the content. A format 2 entry whose only part is the
    extension's own is indistinguishable from a bare format 1 entry by looking at it, and guessing would
    swap the two parts round in silence. The file says which it is; that is what it is for.
*/
export const normalizeEntry = (entry: IConfigBundleEntry, formatVersion: number): { coreConfig?: unknown, config?: unknown } => {
    if (formatVersion >= 2) return { coreConfig: entry.coreConfig, config: entry.config }
    const legacy = entry.config as Record<string, unknown>
    if (legacy && typeof legacy === 'object' && ('core' in legacy || 'own' in legacy)) {
        return { coreConfig: legacy.core, config: legacy.own }
    }
    // Format 1 with no wrapper: it is the core's part, and never the extension's.
    return { coreConfig: entry.config, config: undefined }
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

        if (quiere(CORE_SETTINGS_KEY)) bundle.core.settings = await this.core.readSettings(request.includeCredentials)
        if (quiere(CORE_SHARED_AI_KEY)) bundle.core.sharedAi = await this.core.readSharedAi(request.includeCredentials)

        const options = { includeCredentials: request.includeCredentials }
        /*
            Each interlocutor is asked INSIDE ITS OWN try. An extension failing must not take the whole
            export down with it — that much was already true — and neither must it take down the part the
            core keeps about it, which is right there and is not its to lose.
        */
        const preguntar = async (who: IExtension | undefined, key: string, part: string): Promise<unknown> => {
            if (!who?.exportConfig) return undefined
            try {
                return await who.exportConfig(options)
            }
            catch (err) {
                logWarning(ELogComponent.CORE, `Config export: the ${part} part of '${key}' failed and was left out: ${err}`)
                return undefined
            }
        }

        for (const ref of await this.extensionSource()) {
            const key = bundleEntryKey(ref.type, ref.id)
            if (!quiere(key)) continue

            const coreConfig = await preguntar(ref.coreInstance, key, 'core')
            const config = await preguntar(ref.instance, key, 'own')
            // Nothing to carry: it is not written as an empty entry, which at the destination would look
            // like a configuration that was deliberately blanked.
            if (coreConfig === undefined && config === undefined) continue

            bundle.extensions.push({
                type: ref.type,
                id: ref.id,
                version: ref.version,
                marketplace: ref.marketplace,
                coreConfig,
                config
            })
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
                status: importStatusOf(entry, ref, bundle.formatVersion)
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
            const status = importStatusOf(entry, ref, bundle.formatVersion)

            // Not installed, with no instance or without the method: it is warned about and ignored. The
            // core installs NOTHING — installing would mean reaching a marketplace, resolving licences
            // and waiting for startups in the middle of an import, and that is a fragile process inside
            // another one.
            if (status === EBundleEntryStatus.NOT_INSTALLED || status === EBundleEntryStatus.NOT_INSTANTIATED || status === EBundleEntryStatus.NOT_SUPPORTED) {
                logWarning(ELogComponent.CORE, `Config import: '${key}' skipped (${status})`)
                entries.push({ type: entry.type, id: entry.id, status })
                continue
            }

            const { coreConfig, config } = normalizeEntry(entry, bundle.formatVersion)
            const result: IExtensionImportResult = { applied: 0, skipped: 0, warnings: [] }
            let error: string | undefined

            // Both parts are handed over separately, and one failing does not cancel the other: they are
            // two different stores, and half an import applied is better than none and said out loud.
            const entregar = async (who: IExtension | undefined, data: unknown, part: string): Promise<void> => {
                if (!who?.importConfig || data === undefined) return
                try {
                    const r = await who.importConfig(data)
                    result.applied += r.applied
                    result.skipped += r.skipped
                    result.warnings.push(...r.warnings)
                }
                catch (err) {
                    // An entry that blows up does not stop the rest: that is the contract with the user.
                    logWarning(ELogComponent.CORE, `Config import: the ${part} part of '${key}' failed: ${err}`)
                    error = error ? `${error}; ${err}` : String(err)
                }
            }

            await entregar(ref!.coreInstance, coreConfig, 'core')
            await entregar(ref!.instance, config, 'own')

            if (config !== undefined && !ref!.instance?.importConfig) {
                result.warnings.push('this extension had configuration of its own in the file, and there was no live instance here to receive it: open it and import again')
            }
            entries.push({ type: entry.type, id: entry.id, status, result, error })
        }

        logInfo(ELogComponent.CORE, `Config bundle imported: ${entries.filter(e => e.result && !e.error).length} applied, ` +
            `${entries.filter(e => !e.result || e.error).length} skipped or failed`)
        return { entries, coreApplied }
    }
}
