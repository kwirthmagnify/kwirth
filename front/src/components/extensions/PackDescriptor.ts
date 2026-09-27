import { Extension } from '../../icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { IExtensionManagerDescriptor, IExtensionCardModel, IExtensionVerdict } from './extensionManagerModel'

/*
    The `pack` type's descriptor for the generic manager (plan: plans/extension-managers-ui/PLAN.md).

    The plan marked it as a candidate NOT to migrate, along with IdP, because a pack CONTAINS other
    extensions and installing it means loading each one's front. Migrated, it turns out that fits
    entirely in `onInstalled` / `onUninstalled`, which is where themes' and homepages' effects already
    lived: a pack simply fires them in a loop, one per member.

    The only thing that had to be added to the generic one is the MEMBERS LINE ('2 plugins, 1 theme'),
    which no other type has because no other one contains anything, and the uninstall button's warning.

    ⚠️ A pack has no dev version: it is installed whole or it is not there. That is why there is no 'dev'
    chip here nor a verdict contemplating one.
*/

/** An extension the pack brings inside. */
interface IPackExtensionRef {
    extensionType: string
    id: string
    tgz: string
}

interface IPackManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
    /** Which types it brings, according to the catalogue: what is inside is unknown until it is installed. */
    extensionTypes?: string[]
}

interface IInstalledPack {
    id: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    extensions: IPackExtensionRef[]
    requiresRestart?: boolean
}

/** What the descriptor needs from the application: loading and unloading each member's front end. */
interface IPackDescriptorDeps {
    onPluginLoad: (id: string) => void
    onPluginUnload: (id: string) => void
    onThemeLoad: (id: string) => void
    onThemeUnload: (id: string) => void
    onHomepageLoad: (id: string) => void
    onHomepageUnload: (id: string) => void
}

/** '2 plugins, 1 theme': what the pack brings, grouped by type. */
const membersSummary = (extensions: IPackExtensionRef[]): string => {
    const counts: Record<string, number> = {}
    for (const e of extensions) counts[e.extensionType] = (counts[e.extensionType] ?? 0) + 1
    return Object.entries(counts).map(([type, n]) => `${n} ${type}${n > 1 ? 's' : ''}`).join(', ')
}

const toModel = (e: IInstalledPack | IPackManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledPack).installedFrom,
    marketplaceLabel: e.marketplaceLabel,
    /*
        What the pack brings. It carries 'Includes:' in front on purpose: without it, the line fell below
        a truncated description and read as its continuation instead of as the list of what it brings.

        Once installed what is INSIDE is known; from the catalogue, only which types it promises to bring.
    */
    subtitle: (e as IInstalledPack).extensions
        ? `Includes: ${membersSummary((e as IInstalledPack).extensions)}`
        : ((e as IPackManifestEntry).extensionTypes?.length ? `Includes: ${(e as IPackManifestEntry).extensionTypes!.join(', ')}` : undefined)
})

// A pack is removed whole, wherever it comes from: there are no dev packs and no packs installed by another pack.
const canUninstall = (): IExtensionVerdict => ({ allowed: true })

/** Walks the pack's members applying to each one what is its own according to its type. */
const forEachMember = (pack: IInstalledPack, deps: IPackDescriptorDeps, cargar: boolean) => {
    for (const ext of pack.extensions) {
        switch (ext.extensionType as EExtensionType) {
            case EExtensionType.PLUGIN:
                if (cargar) deps.onPluginLoad(ext.id)
                else deps.onPluginUnload(ext.id)
                break
            case EExtensionType.THEME:
                if (cargar) deps.onThemeLoad(ext.id)
                else deps.onThemeUnload(ext.id)
                break
            case EExtensionType.HOMEPAGE:
                if (cargar) deps.onHomepageLoad(ext.id)
                else deps.onHomepageUnload(ext.id)
                break
            // The remaining types have no front end to load hot: the back end already serves them.
        }
    }
}

const makePackDescriptor = (deps: IPackDescriptorDeps): IExtensionManagerDescriptor<IInstalledPack, IPackManifestEntry> => ({
    extensionType: EExtensionType.PACK,
    title: 'Manage extension packs',
    noun: { singular: 'pack', plural: 'packs' },
    helpSection: 'guide/extensions/packs/index',
    icon: Extension,
    endpoints: {
        installed: '/core/packs',
        install: '/core/packs/install',
        upload: '/core/packs/upload',
        remove: p => `/core/packs/${p.id}`
    },
    // Removing a pack takes with it everything it brought, and that is warned about BEFORE pressing.
    uninstallTooltip: 'Uninstall pack (removes all member extensions)',
    /*
        The only type that is NOT updated by installing on top. Installing a pack also refuses if any of
        its members is already in place, so replacing it is not replacing one extension: it is updating
        every one it brings, with their restarts and their configuration. Until the back end does that,
        the button says so instead of offering something that is going to fail.
    */
    updateBlockedReason: () => 'Packs cannot be updated in place — uninstall this pack and install the new version',
    keyOf: e => e.id,
    toModel,
    canUninstall,

    onInstalled: pack => forEachMember(pack, deps, true),
    onUninstalled: pack => forEachMember(pack, deps, false)
})

export { makePackDescriptor }
export type { IInstalledPack, IPackManifestEntry }
