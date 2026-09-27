import { ComponentType, ReactNode } from 'react'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'

/*
    The GENERIC extension manager's model (plan: plans/extension-managers-ui/PLAN.md).

    There were eleven management dialogs with the same skeleton copied eleven times, and the copies
    drifted: every fix had to be applied eleven times and forgetting one was enough for the symptom to
    reappear. It was measured before writing this: they only shared 22-59% of the code LITERALLY, that
    is, they had already drifted, which is why none of them served as the canonical one.

    What each type has to CONTRIBUTE lives here. Everything else —the two sections, the filter, the
    card/list toggle, the grouping by version, installing from catalogue/URL/file, the provenance, the
    cards' height and the nine UI rules— is put there by the generic one, the same for everybody.
*/

export enum EManagerSection {
    INSTALLED = 'installed',
    AVAILABLE = 'available'
}

/** What the generic dialog needs to know about an entry in order to draw it, wherever it comes from. */
export interface IExtensionCardModel {
    name: string                 // ya resuelto: displayName || name || id. UN SOLO SITIO.
    version: string
    description: string
    website?: string
    installedFrom?: string
    marketplaceLabel?: string
    icon?: ReactNode             // if the type does not give one, the generic one uses the type's icon
    /*
        The icon the extension itself declares in its package.json: the name of one from the curated set,
        or a raw SVG so it can bring its own. The generic one resolves it (see extensionIcon), and it
        also SANITIZES the SVG: it comes from an extension that may have been installed from somebody
        else's marketplace.
    */
    iconName?: string
    /*
        One more line below the description. `pack` needs it, being the only type that CONTAINS other
        extensions and has to say which ('2 plugins, 1 theme'). It goes on one line and with an ellipsis:
        a pack with many types would grow and eat the provenance and actions row.
    */
    subtitle?: string
}

/*
    The icons a chip may carry. It is a short, closed enum on purpose: a descriptor DECLARES chips, it
    does not paint them, and this way it needs neither to import icons nor to be a .tsx.
*/
export enum EChipIcon {
    /** A mark for "this is what is set right now": the active theme, the active homepage. */
    ACTIVE = 'active',
    /** It comes from a loose file on disk. */
    FILE = 'file',
    /** The extension type's own icon, the one the descriptor declares. */
    TYPE = 'type'
}

/** A DECLARED chip. The generic dialog draws it; the type only says what it means. */
export interface IExtensionChip {
    label: string
    color?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error'
    variant?: 'filled' | 'outlined'
    icon?: EChipIcon
    tooltip?: string
}

/**
 * An extension type's icon: the COMPONENT, not an already mounted element.
 *
 * That way the generic dialog decides the size according to where it draws it (card, row, provenance
 * chip) and the descriptor is left without JSX.
 */
export type TExtensionIcon = ComponentType<{ fontSize?: 'inherit' | 'small' | 'medium' | 'large' }>

/** An action of a type's own, beyond install/uninstall/configure. */
export interface IExtensionAction {
    icon: ReactNode
    tooltip: string
    onClick: () => void
    disabled?: boolean
    color?: 'primary' | 'error' | 'inherit'
}

/**
 * Whether an action can be performed on an entry, and why not.
 *
 * The reason is no ornament: the project's UI rule is that a control stays visible and disabled, never
 * hidden, so whoever sees it needs to read why they cannot press it.
 */
export interface IExtensionVerdict {
    allowed: boolean
    reason?: string
}

/*
    "Which plugins go with this extension", which turns out to be the same question in several types:

      · themes     → which channels use this theme
      · aitoolset  → which channels may use this toolset (phase 1's grant)

    It was written twice, separately —ThemeAssignSelector and GrantSelector— and both copies were the
    same `Select multiple` with checkboxes, the same placeholder and the same height. Worse: every CARD
    asked `/core/plugins` on its own account, so opening the dialog with twelve installed meant twelve
    identical requests. Moved up here, the generic one asks for the list ONCE and the type only says
    where it is read from and where it is stored.

    `load`'s map goes from ENTRY KEY to plugin ids, not the other way round: it is how it is painted
    (each card asks about its own) and how the aitoolsets back end returns it. Themes has it the other
    way round —a plugin has ONE theme— and it is the descriptor that flips it, since it is the one that
    knows its format.
*/
export interface IPluginSelectorSpec<TInstalled> {
    /** What the control means, for the tooltip: 'Plugins using this theme'… */
    tooltip: string
    /** What to put when there is none. 'No plugin' by default. */
    emptyLabel?: string
    /** An entry's key → the ids of the plugins associated with it. */
    load: () => Promise<Record<string, string[]>>
    /** Persist THAT entry's new selection. If it throws, the generic dialog undoes it and shows the reason. */
    save: (entry: TInstalled, pluginIds: string[]) => Promise<void>
}

/**
 * A dependency between extensions, exactly as it comes in the manifest.
 *
 * `requires` is mandatory — without it the extension does not work, so installing is refused — and `uses`
 * is optional: if it is there, it is taken advantage of. Any extension declared them, but only plugins
 * and providers looked at them, each with its own copy. Now the generic dialog understands them for all
 * ELEVEN types.
 */
export interface IExtensionRequirement {
    extensionType: EExtensionType
    id: string
    minVersion: string
}

/*
    What an extension type contributes. Everything optional is a CAPABILITY: if it is not declared, the
    generic one simply does not paint that part.

    Two decisions that came out of reading all ten dialogs through, and that are not whims:

      - `key` instead of assuming `id`: documentation is identified by the PAIR (targetType, id), because
        the id is that of the documented extension and it repeats across types.
      - `canUninstall` instead of repeating the `installedFrom` chain: what cannot be uninstalled varies
        by type (dev in all of them, bundled in some, 'pack:' in nearly all, core in providers, a flag of
        its own in IdP).
*/
export interface IExtensionManagerDescriptor<TInstalled, TEntry> {
    extensionType: EExtensionType
    /** The dialog's title, e.g. 'Manage AI toolsets'. */
    title: string
    /** What one of these is called in singular and plural, for the generic dialog's texts. */
    noun: { singular: string, plural: string }
    /*
        The guide's section for the help button (rule 7). OPTIONAL on purpose: a freshly created type
        has no guide page yet, and the rule itself says that a button opening a section that does not
        exist is worse than not having one. With no section, the generic one paints the title without help.
    */
    helpSection?: string
    /** The type's icon, the one drawn when the entry carries none of its own. */
    icon: TExtensionIcon

    /** The back end's routes. The generic dialog does not guess them: IdP, for one, does not hang off /core/<plural>. */
    endpoints: {
        installed: string
        install: string
        upload: string
        remove: (entry: TInstalled) => string
    }

    /**
     * What the uninstall button says when it CAN be pressed. 'Uninstall' by default.
     *
     * `pack` needs it: removing one takes with it every extension it brought, and that has to be
     * avisarlo ANTES de pulsar, no despues.
     */
    uninstallTooltip?: string

    /*
        Which of the installed entries BELONG to this manager.

        `provider` needs it: its endpoint also returns the core's providers (events, metrics), which are
        not extensions — they are neither installed nor uninstalled, and painting them invites trying to
        remove them.
    */
    filterInstalled?: (entry: TInstalled) => boolean

    keyOf: (entry: TInstalled | TEntry) => string
    toModel: (entry: TInstalled | TEntry) => IExtensionCardModel
    canUninstall: (entry: TInstalled) => IExtensionVerdict

    /** Extra data the type needs and the generic dialog knows nothing about (IdP's instances, themes' plugins). */
    loadExtraData?: () => Promise<void>

    /** If it returns a number, the generic dialog draws the 'N configs' chip. */
    configCount?: (entry: TInstalled) => number | undefined
    /** If it exists, the generic dialog draws the gear and mounts this on pressing it. */
    renderConfigDialog?: (entry: TInstalled, onClose: () => void) => ReactNode
    /**
     * Whether THIS entry has configuration. Without it, the gear comes out alive on every entry of the type.
     *
     * That the TYPE is configurable does not mean all of its extensions are: a provider is configurable
     * when it brings its own front end or declares a schema, a plugin or a login when they declare a
     * configSchema, and a homepage only the active one that brings a SetupDialog.
     *
     * The gear stays VISIBLE and disabled with the reason. Hiding it leaves whoever looks wondering
     * whether that extension is configured somewhere else.
     */
    canConfigure?: (entry: TInstalled) => IExtensionVerdict

    /*
        The type's own chips: 'active', 'enabled', 'Requires 2'…

        ⚠️ PROVENANCE does not come in here: the dev / local file / via pack / Kwirth chips are put there
        by the generic one for every type. They were copied one per dialog and differed only in the
        'Kwirth' chip's icon, which is nothing but the type's icon.
    */
    extraChips?: (entry: TInstalled | TEntry, section: EManagerSection) => IExtensionChip[]
    /** Actions of its own: open the guide, open the login page… */
    actions?: (entry: TInstalled | TEntry, section: EManagerSection) => IExtensionAction[]

    /**
     * The plugin selector of what is installed, to the left of the action buttons. It is ONE place on the
     * card and on the row, not two different layouts.
     */
    pluginSelector?: IPluginSelectorSpec<TInstalled>

    /** If it returns a reason, installing is disabled and the reason goes to the tooltip (unmet dependencies). */
    installBlockedReason?: (entry: TEntry) => string | undefined

    /**
     * The same for UPDATING: if it returns a reason, the update button is disabled with it.
     *
     * Hardly any type needs it — updating is installing on top — but a pack is not just another extension:
     * its installation also refuses when any of its members is already in place, so replacing it means
     * updating them all, and the back end does not do that.
     */
    updateBlockedReason?: (entry: TInstalled) => string | undefined

    /** Side effects of install/uninstall: a pack loads the front end of every extension it brings. */
    onInstalled?: (meta: TInstalled) => void
    onUninstalled?: (entry: TInstalled) => void
}
