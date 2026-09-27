import React from 'react'
import { Home } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { EChipIcon, EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionChip, IExtensionVerdict } from './extensionManagerModel'

/*
    The `homepage` type's descriptor for the generic manager (plan: plans/extension-managers-ui/PLAN.md).

    What the type brings:
      · the `active` chip of the homepage in use
      · the cog, which here belongs NOT to the type but to the card: only the active homepage is
        configured, and only if its extension brings a SetupDialog of its own
      · deactivating when uninstalling the one that was set
      · loading/unloading its front hot

    ⚠️ The configuration dialog is not put there by the core: the homepage itself brings it at
    `window.__kwirth_homepages__[id].SetupDialog`, and its configuration lives in localStorage. The core
    only decides WHEN it opens; what is painted inside belongs to the extension. That is why it is
    mounted here with `createElement` and the file is still a .ts: a descriptor declares, it does not lay out.
*/

interface IHomepageManifestEntry {
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

interface IInstalledHomepage {
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

/** What the descriptor needs from the application. */
interface IHomepageDescriptorDeps {
    activeHomepageId: string | undefined
    onActivate: (id: string | undefined, config: Record<string, unknown>) => void
    onHomepageLoad: (id: string) => void
    onHomepageUnload: (id: string) => void
}

/** The props of the dialog the homepage itself brings. */
interface IHomepageSetupProps {
    config: Record<string, unknown>
    onSave: (cfg: Record<string, unknown>) => void
    onClose: () => void
}

/** An installed homepage's front end, which the core loads into a global. */
interface ILoadedHomepage {
    SetupDialog?: React.ComponentType<IHomepageSetupProps>
    defaultConfig?: Record<string, unknown>
}

const loadedHomepage = (id: string): ILoadedHomepage | undefined =>
    (window as unknown as { __kwirth_homepages__?: Record<string, ILoadedHomepage> }).__kwirth_homepages__?.[id]

/** A homepage's stored configuration, or the one it proposes itself by default. */
const savedConfig = (id: string): Record<string, unknown> => {
    try {
        const saved = localStorage.getItem(`kwirth.homepage.config.${id}`)
        if (saved) return JSON.parse(saved) as Record<string, unknown>
    }
    catch { /* localStorage puede fallar o traer basura: se cae a lo que proponga la extension */ }
    return loadedHomepage(id)?.defaultConfig ?? {}
}

const toModel = (e: IInstalledHomepage | IHomepageManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledHomepage).installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (h: IInstalledHomepage): IExtensionVerdict => {
    if (h.installedFrom === 'dev') return { allowed: false, reason: 'Dev homepages cannot be uninstalled' }
    if (h.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

const makeHomepageDescriptor = (deps: IHomepageDescriptorDeps): IExtensionManagerDescriptor<IInstalledHomepage, IHomepageManifestEntry> => ({
    extensionType: EExtensionType.HOMEPAGE,
    title: 'Manage homepages',
    noun: { singular: 'homepage', plural: 'homepages' },
    helpSection: 'guide/extensions/homepages/index?id=admin-guide',
    icon: Home,
    endpoints: {
        installed: '/core/homepages',
        install: '/core/homepages/install',
        upload: '/core/homepages/upload',
        remove: h => `/core/homepages/${h.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    extraChips: (e, section): IExtensionChip[] =>
        section === EManagerSection.INSTALLED && deps.activeHomepageId === e.id
            ? [{ label: 'active', color: 'primary', icon: EChipIcon.ACTIVE }]
            : [],

    /*
        The cog belongs to the CARD, not to the type: only the active homepage is reconfigured, and only
        if its extension brings a dialog. The two reasons are told apart on purpose — one is final and
        the other says WHAT TO DO in order to be able to configure it.
    */
    canConfigure: h => {
        if (!loadedHomepage(h.id)?.SetupDialog) return { allowed: false, reason: 'This homepage has no settings' }
        if (deps.activeHomepageId !== h.id) return { allowed: false, reason: 'Only the active homepage can be configured' }
        return { allowed: true }
    },

    renderConfigDialog: (h, onClose) => {
        const SetupDialog = loadedHomepage(h.id)?.SetupDialog
        if (!SetupDialog) return null
        return React.createElement(SetupDialog, {
            config: savedConfig(h.id),
            onSave: (cfg: Record<string, unknown>) => { deps.onActivate(h.id, cfg); onClose() },
            onClose
        })
    },

    onInstalled: meta => deps.onHomepageLoad(meta.id),
    onUninstalled: h => {
        // If the one that was set gets uninstalled, it has to be DEACTIVATED: otherwise Kwirth is left
        // pointing at a homepage that no longer exists and the start screen goes blank.
        if (deps.activeHomepageId === h.id) deps.onActivate(undefined, {})
        deps.onHomepageUnload(h.id)
    }
})

export { makeHomepageDescriptor }
export type { IInstalledHomepage, IHomepageManifestEntry }
