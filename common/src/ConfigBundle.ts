import { EExtensionType } from './ExtensionType'

/*
    Configuration portability: taking one Kwirth's configuration to another.

    The idea that governs everything — and that is worth keeping in mind while reading these types — is
    that THE CORE DOES NOT UNDERSTAND WHAT IT CARRIES. It cannot: plugins with a back end of their own
    store their configuration wherever they like, and the two biggest ones store it in their own Postgres,
    mixed with working data that must NOT travel. Only the extension knows which is which.

    So the division of labour is:
      - the extension  decides what counts as its configuration, what it exports and what it does with
                       whatever it receives
      - the core       gathers, writes the file, and at the other end locates the recipient and hands it
                       its part; it never looks inside
      - whoever uses it  ticks which entries travel, at the source and at the destination

    See `plans/config-portability/PRD.md`.
*/

/** What is asked of an extension when its configuration is requested. */
export interface IExtensionExportOptions {
    /*
        When false, the extension must return its secret fields EMPTY, not omit them: the destination
        needs to know they exist in order to ask for them to be filled in. It is unchecked by default in
        the UI — a bundle with credentials ends up in somebody's downloads folder.
    */
    includeCredentials: boolean
}

/*
    What an extension answers on import. It is the ONLY thing the core knows about the content, so it is
    the only thing it can show in the final report: hence it being the same for all of them.
*/
export interface IExtensionImportResult {
    applied: number
    skipped: number
    /** Why something was discarded, or what needs reviewing. Shown to the user as it is. */
    warnings: string[]
}

/** State of an entry, both when listing what is exportable and when previewing an import. */
export enum EBundleEntryStatus {
    /** It can be exported / it is going to be applied. */
    AVAILABLE = 'available',
    /** The extension is there, but does not implement the method: `IExtension` is optional. */
    NOT_SUPPORTED = 'not-supported',
    /*
        Installed but with no live instance to ask. It happens with channels: only the required ones are
        instantiated, and never those announced as REMOTE. A temporary one is not instantiated on
        purpose: a channel constructor may open informers and connections, and waking half a plugin up
        to read a configuration off it is a disproportionate side effect.
    */
    NOT_INSTANTIATED = 'not-instantiated',
    /** Import only: the bundle carries it and it is not installed here. The core installs NOTHING. */
    NOT_INSTALLED = 'not-installed',
    /** It will be applied, but the version here is not the source's. It warns; it transforms nothing. */
    VERSION_DIFFERS = 'version-differs'
}

/** An extension inside the bundle. */
export interface IConfigBundleEntry {
    type: EExtensionType
    id: string
    /** The source's. Not useful for installing — the core does not install — but for knowing what is missing. */
    version?: string
    /** Where it came from at the source, for the same reason. */
    marketplace?: string
    /*
        OPAQUE to the core: the extension's `exportConfig` produces it and its `importConfig` eats it.
        Hence the `unknown`: it is not type sloppiness, it is that typing it would be a lie.
    */
    config: unknown
}

/** What the core contributes on its own. None of this belongs to an extension. */
export interface IConfigBundleCore {
    /** Metrics interval, marketplaces and package registries. */
    settings?: unknown
    /** The common store: AI providers and models. It belongs to nobody, so it goes apart. */
    sharedAi?: unknown
}

export interface IConfigBundleMeta {
    exportedAt: string
    kwirthVersion: string
    /** Free-form source label, to know where the file came from when opening it months later. */
    source?: string
    /** The file declares whether it carries secrets. Whoever stores it deserves to know. */
    includesCredentials: boolean
}

export const CONFIG_BUNDLE_KIND = 'kwirth-config-bundle'

/*
    The WRAPPER's version, not the content's. It exists from day one so that an old Kwirth can say "I
    cannot read this" instead of breaking halfway through a format it does not know.
*/
export const CONFIG_BUNDLE_FORMAT_VERSION = 1

export interface IConfigBundle {
    kind: typeof CONFIG_BUNDLE_KIND
    formatVersion: number
    meta: IConfigBundleMeta
    core: IConfigBundleCore
    extensions: IConfigBundleEntry[]
}

/*
    How an entry is named in order to tick or untick it. It lives here, and not in the back end, because
    the front end builds the same keys in order to say what it wants: two implementations of the same
    format would end up diverging the day an id carries an odd character.
*/
export const CORE_SETTINGS_KEY = 'core/settings'
export const CORE_SHARED_AI_KEY = 'core/sharedAi'
export const bundleEntryKey = (type: EExtensionType, id: string): string => `${type}/${id}`

/** A row of the export dialog: what there is to export and whether it can be. */
export interface IExportableEntry {
    type: EExtensionType
    id: string
    displayName: string
    version?: string
    marketplace?: string
    status: EBundleEntryStatus
}

/** A row of the import preview: what would happen to it. */
export interface IImportPreviewEntry {
    type: EExtensionType
    id: string
    displayName: string
    /** The one the bundle carries. */
    version?: string
    /** The one that is here, if it is installed. */
    installedVersion?: string
    status: EBundleEntryStatus
}

/** What the import returns: what each entry did. */
export interface IImportEntryOutcome {
    type: EExtensionType
    id: string
    status: EBundleEntryStatus
    /** What the extension answered, when it could be called. */
    result?: IExtensionImportResult
    /** Why it could not be, or what failed. A broken entry does NOT stop the others. */
    error?: string
}

export interface IImportReport {
    entries: IImportEntryOutcome[]
    coreApplied: string[]
}
