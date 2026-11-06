import { EExtensionType } from './ExtensionType'

/*
    What the core lends of its installed extensions, of ANY type, read-only (ClusterInfo.extensions).

    The bare facts every manager knows of what it has installed — id, version, where it came from — for
    whoever has to show them (the Status channel's tables). Types with a richer access of their own
    (plugins, DCEs) are listed here too, so the contract has no holes; what they add (state, instances,
    consumers…) stays in their own access.
*/

/** One installed extension, as its manager lists it. */
export interface IInstalledExtension {
    id: string
    version: string
    /** Where it was installed from: a marketplace URL, 'dev', 'bundled', 'local'… */
    installedFrom?: string
}

/** What the core lends of its installed extensions, read-only (ClusterInfo.extensions). */
export interface IExtensionAccess {
    listInstalled(type: EExtensionType): Promise<IInstalledExtension[]>
}
