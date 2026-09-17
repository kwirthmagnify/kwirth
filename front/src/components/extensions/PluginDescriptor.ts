import React from 'react'
import { Extension } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType, IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { IExtensionManagerDescriptor, IExtensionCardModel, IExtensionRequirement, IUninstallVerdict } from './extensionManagerModel'
import { PluginConfigDialog } from './PluginConfigDialog'

/*
    Descriptor del tipo `plugin` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    Los plugins son los canales de Kwirth, el tipo mas visible de todos, y casi todo lo suyo resulto ser
    de todos:

      · `requires` / `uses` los entiende ya el generico para los once tipos. Los declaraba cualquier
        extension y solo los miraban plugins y providers, cada uno con su copia.
      · el icono propio (nombre del set curado o SVG saneado) tambien: lo pinta el generico a partir de
        `iconName`, porque cualquier extension puede traer el suyo.

    Lo que queda del tipo es su configuracion de instalacion, y sobre todo CUANDO se ofrece: la rueda
    dentada salia en todos los plugins, incluidos los que no leen ninguna configuracion, y abria un editor
    que no servia para nada. Ahora la ofrece quien la declara.
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
    /** El plugin declara que acepta configuracion de instalacion. Sin esto, no hay rueda dentada. */
    configSchema?: IConfigFieldDef[]
}

/** Lo que el descriptor necesita de la aplicacion: cargar y descargar el front del canal en caliente. */
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
    // El icono que trae la extension: nombre del set curado o un SVG propio. Lo resuelve el generico.
    iconName: e.icon
})

const canUninstall = (p: IInstalledPlugin): IUninstallVerdict => {
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

    // La rueda dentada, solo en los plugins que declaran configuracion. El resto no tiene nada que abrir.
    canConfigure: p => (p.configSchema?.length ?? 0) > 0,
    renderConfigDialog: (p, onClose) => React.createElement(PluginConfigDialog, { pluginId: p.id, onClose }),

    // El canal se carga y se descarga en caliente: sin esto habria que recargar la pagina para usar un
    // plugin recien instalado.
    onInstalled: meta => deps.onPluginLoaded(meta.id),
    onUninstalled: p => deps.onPluginUnloaded(p.id)
})

export { makePluginDescriptor }
export type { IInstalledPlugin, IPluginManifestEntry }
