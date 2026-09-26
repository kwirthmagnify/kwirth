import { Palette } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { EChipIcon, EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionChip, IExtensionVerdict } from './extensionManagerModel'

/*
    Descriptor del tipo `theme` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    PRIMER manager a medida que se migro, y por eso importa: `aitoolset` era codigo nuevo y no tenia nada
    que romper; themes lo usa gente. Lo que este fichero tiene que conseguir es que la pantalla se vea y
    se comporte IGUAL, con 523 lineas menos.

    Es un .ts, no un .tsx, y eso no es casualidad: un descriptor DECLARA —chips, iconos, endpoints— y no
    pinta nada. Lo que antes traia de UI se subio al generico al ver que estaba copiado en varios tipos:
      · el `Select multiple` de plugins → `pluginSelector` (themes y aitoolset tenian su propia copia,
        y ademas cada tarjeta pedia /core/plugins por su cuenta)
      · los chips de procedencia (dev, fichero local, via pack, Kwirth) → los pone el generico

    Queda, que es lo unico de themes: el chip `active`, a quien se le asigna el tema, y cargar/descargar
    su front en caliente.

    ⚠️ Se quedo fuera la imagen de PREVIEW como fondo de la tarjeta. Estaba montada de punta a punta
    —endpoint, `hasPreview`, copia en los build.mjs— y NUNCA se alimento: no existe ni un `preview.png` en
    ningun tema. Se descarta al migrar (decision del usuario, 2026-09-17). Cuando haga falta un fondo, sera
    un atributo generico de la tarjeta, no un `previewUrl` de themes.
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
