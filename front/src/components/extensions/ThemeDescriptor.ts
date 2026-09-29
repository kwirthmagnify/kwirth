import { Palette } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { EChipIcon, EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionChip, IExtensionVerdict } from './extensionManagerModel'

/*
    The `theme` type's descriptor for the generic manager (plan: plans/completed/extension-managers-ui/PLAN.md).

    The FIRST bespoke manager to be migrated, and that is why it matters: `aitoolset` was new code with
    nothing to break; themes is used by people. What this file has to achieve is that the screen looks
    and behaves THE SAME, with 523 lines fewer.

    It is a .ts, not a .tsx, and that is no accident: a descriptor DECLARES —chips, icons, endpoints— and
    paints nothing. What it used to bring in UI was moved up to the generic one on seeing it copied
    across several types:
      · the plugins `Select multiple` → `pluginSelector` (themes and aitoolset each had their own copy,
        and on top of that every card asked /core/plugins on its own account)
      · the provenance chips (dev, local file, via pack, Kwirth) → put there by the generic one

    What is left, which is the only thing that is themes': the `active` chip, who the theme is assigned
    to, and loading/unloading its front hot.

    ⚠️ The PREVIEW image as the card's background was left out. It was wired end to end —endpoint,
    `hasPreview`, a copy in the build.mjs files— and it was NEVER fed: there is not a single `preview.png`
    in any theme. It is dropped on migration (the user's decision, 2026-09-17). When a background is
    needed, it will be a generic attribute of the card, not a themes `previewUrl`.
*/

interface IThemeManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
}

interface IInstalledTheme {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    requiresRestart?: boolean
}

/** What the descriptor needs from the application: which theme is active and who uses it. */
interface IThemeDescriptorDeps {
    activeThemeName: string | undefined
    assignments: Record<string, string>
    onAssignmentsChange: (a: Record<string, string>) => void
    onThemeLoad: (id: string) => void
    onThemeUnload: (id: string) => void
    /** Saving the whole assignment map. Whoever holds the session does it, not the descriptor. */
    saveAssignments: (a: Record<string, string>) => Promise<void>
}

const toModel = (e: IInstalledTheme | IThemeManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledTheme).installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (t: IInstalledTheme): IExtensionVerdict => {
    if (t.installedFrom === 'dev') return { allowed: false, reason: 'Dev themes cannot be uninstalled' }
    if (t.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

/**
 * The descriptor is a FACTORY because it needs application state (which theme is active, who uses it).
 * `aitoolset`'s does not need it, and that is why it is a constant.
 */
const makeThemeDescriptor = (deps: IThemeDescriptorDeps): IExtensionManagerDescriptor<IInstalledTheme, IThemeManifestEntry> => ({
    extensionType: EExtensionType.THEME,
    title: 'Manage themes',
    noun: { singular: 'theme', plural: 'themes' },
    helpSection: 'guide/extensions/themes/index?id=admin-guide',
    icon: Palette,
    endpoints: {
        installed: '/core/themes',
        install: '/core/themes/install',
        upload: '/core/themes/upload',
        remove: t => `/core/themes/${t.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    // The theme that is really in use. It is the first thing one looks for on opening this screen.
    extraChips: (e, section): IExtensionChip[] =>
        section === EManagerSection.INSTALLED && deps.activeThemeName === e.id
            ? [{ label: 'active', color: 'primary', icon: EChipIcon.ACTIVE }]
            : [],

    pluginSelector: {
        tooltip: 'Plugins using this theme',
        // The assignments come from the back end the other way round from how they are drawn — plugin →
        // theme, because a plugin can only have ONE — so here they are flipped: theme → plugins using it.
        load: async () => {
            const porTema: Record<string, string[]> = {}
            for (const [pluginId, themeId] of Object.entries(deps.assignments)) {
                (porTema[themeId] ||= []).push(pluginId)
            }
            return porTema
        },
        save: async (theme, pluginIds) => {
            // The whole map is rebuilt: assigning this theme to a plugin implies taking away the one
            // it had, because there can only be one.
            const next: Record<string, string> = {}
            for (const [pid, tid] of Object.entries(deps.assignments)) {
                if (tid !== theme.id) next[pid] = tid
            }
            for (const pid of pluginIds) next[pid] = theme.id
            await deps.saveAssignments(next)
            deps.onAssignmentsChange(next)
        }
    },

    // The theme's front end is loaded and unloaded hot: without this the page would have to be reloaded
    // to see a freshly installed theme.
    onInstalled: meta => deps.onThemeLoad(meta.id),
    onUninstalled: t => deps.onThemeUnload(t.id)
})

export { makeThemeDescriptor }
export type { IInstalledTheme, IThemeManifestEntry }
