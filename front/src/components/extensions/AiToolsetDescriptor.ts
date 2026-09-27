import { Construction } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionChip, IExtensionVerdict } from './extensionManagerModel'

/*
    The `aitoolset` type's descriptor (plan: plans/ai-tools/PLAN.md) and the generic manager's FIRST
    client. It was premiered here on purpose: it was the only type without a dialog of its own, so
    premiering it could not break anything that already worked.

    The two sections, the filter, card/list, the version Select, installing from catalogue/URL/file, the
    provenance and the plugin selector are all put there by ExtensionManagerDialog.
*/

interface IAiToolsetEntry {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    url?: string
    marketplaceId?: string
    marketplaceLabel?: string
    installedFrom?: string
    requiresRestart?: boolean
    /** Installed only: how many tools it brings, for the chip. The back end's catalogue fills it in. */
    toolCount?: number
}

/** What the descriptor needs from the application in order to read and save the grants. */
interface IAiToolsetDescriptorDeps {
    loadGrants: () => Promise<Record<string, string[]>>
    saveGrants: (toolsetId: string, pluginIds: string[]) => Promise<void>
}

const toModel = (e: IAiToolsetEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: e.installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

// A core built-in toolset is neither installed nor uninstalled: it comes inside. And a dev one is
// governed by kwirth-dev.json, not by the dialog.
const canUninstall = (e: IAiToolsetEntry): IExtensionVerdict => {
    if (e.installedFrom === 'dev') return { allowed: false, reason: 'Dev toolsets cannot be uninstalled' }
    if (e.installedFrom === 'bundled') return { allowed: false, reason: 'Built-in toolsets cannot be uninstalled' }
    if (e.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

const makeAiToolsetDescriptor = (deps: IAiToolsetDescriptorDeps): IExtensionManagerDescriptor<IAiToolsetEntry, IAiToolsetEntry> => ({
    extensionType: EExtensionType.AITOOLSET,
    title: 'Manage AI toolsets',
    noun: { singular: 'AI toolset', plural: 'AI toolsets' },
    // The type's guide already exists (CL9 2026-09-16), so the dialog carries its help button (rule 7).
    // It points at the manager's section and not at the top of the page: whoever opens the help FROM the
    // dialog wants what they are looking at, not the introduction to the concept.
    helpSection: 'guide/extensions/aitoolsets/index?id=the-ai-toolsets-manager',
    icon: Construction,
    endpoints: {
        installed: '/core/aitoolsets',
        install: '/core/aitoolsets/install',
        upload: '/core/aitoolsets/upload',
        remove: e => `/core/aitoolsets/${e.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    /*
        THE GRANT: which plugins may use this toolset (plan: "El techo en dos fases", phase 1).

        It is granted from the TOOLSET and not from the plugin because the dangerous one is the toolset:
        `k8s-ops` is the eight writing tools, and this way "who can write to the cluster through AI?" is
        answered on ONE screen, instead of walking the installed channels one by one.

        ⚠️ By default nobody uses it: installing leaves the toolset available, not granted. Hence the
        control says 'No plugin' rather than staying blank.
    */
    pluginSelector: {
        tooltip: 'Plugins allowed to use this toolset',
        load: deps.loadGrants,
        save: (toolset, pluginIds) => deps.saveGrants(toolset.id, pluginIds)
    },

    extraChips: (e, section): IExtensionChip[] =>
        section === EManagerSection.INSTALLED && e.toolCount !== undefined
            ? [{ label: `${e.toolCount} tool${e.toolCount > 1 ? 's' : ''}`, variant: 'outlined' }]
            : []
})

export { makeAiToolsetDescriptor }
export type { IAiToolsetEntry }
