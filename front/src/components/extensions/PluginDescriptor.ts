import React from 'react'
import { Extension } from '../../icons'
import { EExtensionType, IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { IExtensionManagerDescriptor, IExtensionCardModel, IExtensionRequirement, IExtensionVerdict } from './extensionManagerModel'
import { ConfigJsonDialog } from './ConfigJsonDialog'

/*
    The `plugin` type's descriptor for the generic manager (plan: plans/extension-managers-ui/PLAN.md).

    Plugins are Kwirth's channels, the most visible type of them all, and almost everything of theirs
    turned out to belong to everybody:

      · `requires` / `uses` are already understood by the generic one for all eleven types. Any extension
        declared them and only plugins and providers looked at them, each with its own copy.
      · the extension's own icon (a name from the curated set or a sanitized SVG) too: the generic one
        paints it from `iconName`, because any extension may bring its own.

    What is left of the type is its installation configuration, and above all WHEN it is offered: the cog
    showed up on every plugin, including the ones that read no configuration at all, and it opened an
    editor that was of no use. Now it is offered by whoever declares one.
*/

interface IPluginManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    extensionType?: EExtensionType
    name: string
    displayName: string
    version: string
    description: string
    icon?: string
    website?: string
    url: string
    requires?: IExtensionRequirement[]
    uses?: IExtensionRequirement[]
}

interface IInstalledPlugin {
    id: string
    name: string
    displayName: string
    version: string
    description: string
    icon?: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    requiresRestart?: boolean
    /** The plugin declares that it accepts installation configuration. Without it, there is no gear. */
    configSchema?: IConfigFieldDef[]
}

/** What the descriptor needs from the application: loading and unloading the channel's front end hot. */
interface IPluginDescriptorDeps {
    onPluginLoaded: (id: string) => void
    onPluginUnloaded: (id: string) => void
}

const toModel = (e: IInstalledPlugin | IPluginManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledPlugin).installedFrom,
    marketplaceLabel: e.marketplaceLabel,
    // The icon the extension brings: a name from the curated set or an SVG of its own. The generic dialog resolves it.
    iconName: e.icon
})

const canUninstall = (p: IInstalledPlugin): IExtensionVerdict => {
    if (p.installedFrom === 'dev') return { allowed: false, reason: 'Dev plugins cannot be uninstalled' }
    if (p.installedFrom === 'bundled') return { allowed: false, reason: 'Built-in plugins cannot be uninstalled' }
    if (p.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

const makePluginDescriptor = (deps: IPluginDescriptorDeps): IExtensionManagerDescriptor<IInstalledPlugin, IPluginManifestEntry> => ({
    extensionType: EExtensionType.PLUGIN,
    title: 'Manage channel plugins',
    noun: { singular: 'plugin', plural: 'plugins' },
    helpSection: 'guide/extensions/plugins/index?id=managing-channel-plugins',
    icon: Extension,
    endpoints: {
        installed: '/core/plugins',
        install: '/core/plugins/install',
        upload: '/core/plugins/upload',
        remove: p => `/core/plugins/${p.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    // The gear, alive only on the plugins that declare configuration. On the rest it stays disabled
    // saying why: it used to come out active on all of them and opened an editor that did nothing.
    canConfigure: p => (p.configSchema?.length ?? 0) > 0
        ? { allowed: true }
        : { allowed: false, reason: 'This plugin takes no installation config' },
    renderConfigDialog: (p, onClose) => React.createElement(ConfigJsonDialog, {
        title: `Configure ${p.displayName || p.id}`,
        hint: 'Installation config (JSON) for this plugin — read by the plugin at runtime.',
        endpoint: `/core/plugins/${p.id}/config`,
        exportName: p.id,
        onClose
    }),

    // The channel is loaded and unloaded hot: without this the page would have to be reloaded to use a
    // freshly installed plugin.
    onInstalled: meta => deps.onPluginLoaded(meta.id),
    onUninstalled: p => deps.onPluginUnloaded(p.id)
})

export { makePluginDescriptor }
export type { IInstalledPlugin, IPluginManifestEntry }
