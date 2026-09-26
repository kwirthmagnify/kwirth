import React from 'react'
import { Factory } from '../../icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { IExtensionManagerDescriptor, IExtensionCardModel, IExtensionRequirement, IExtensionVerdict } from './extensionManagerModel'
import { ConfigFormDialog } from './ConfigFormDialog'
import { ConfigFrontDialog } from './ConfigFrontDialog'

/*
    Descriptor del tipo `provider` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    Es el tipo con mas matices propios de los migrados hasta ahora:

      · Se configura de DOS formas. Un provider basico declara un `schema` y el core le pinta el
        formulario sobre una configuracion unica (<id>/config). Uno complejo trae su propio front y
        gestiona SUS configuraciones —sugarless tiene varias con nombre—, y entonces el core solo monta
        lo que la extension trae, igual que hace con el SetupDialog de una homepage. `hasFront` decide.
      · El chip 'N configs' cuenta las del provider, que las lleva el, no el core.
      · Su endpoint devuelve tambien los providers DE CORE (events, metrics). No son extensiones: no se
        instalan ni se desinstalan, asi que no salen en el gestor.
      · Declara `requires`: hay providers que no funcionan sin cierto plugin o sender. Si falta, instalar
        se queda bloqueado con el motivo — eso lo resuelve ya el generico.
*/

interface IProviderManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
    requires?: IExtensionRequirement[]
    uses?: IExtensionRequirement[]
}

interface IInstalledProvider {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    /** The configurations the provider carries. Their number is the card's chip. */
    configNames?: string[]
    /** It brings its own configuration UI in front.js. */
    hasFront?: boolean
    /** It declares a schema, and then the core draws the form. */
    hasSchema?: boolean
    /*
        Sabe comprobar su propia configuracion: expone '/test' en su configRouter, y el core lo detecta
        mirando sus rutas. Con esto el formulario saca un boton TEST — el usuario sabe si sus credenciales
        valen en el momento de escribirlas, en vez de descubrirlo cuando el provider no trae nada.
    */
    hasTest?: boolean
    /** A core provider (events, metrics): it comes inside Kwirth, it is not an extension. */
    core?: boolean
    /**
     * PLUVIDER: not a provider but a plugin that also produces and exposes its information in-process.
     * It is served in the same list so whoever CONSUMES providers need not know two classes exist, but
     * here it has no part to play: it is neither installed nor uninstalled separately, it comes and goes
     * with its plugin.
     */
    pluvider?: boolean
    /** id of the plugin hosting the pluvider (the 'agora' of 'plugin:agora'). Pluviders only. */
    hostedBy?: string
    requiresRestart?: boolean
}

const toModel = (e: IInstalledProvider | IProviderManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledProvider).installedFrom,
    marketplaceLabel: e.marketplaceLabel,
    /*
        Un pluvider se llama como su plugin ('Agora'), asi que su ID deja de verse — y el id es justo lo
        que hace falta para suscribirse a el. Va de subtitulo. De que plugin sale ya lo dice el chip de
        procedencia, asi que repetirlo aqui seria gastar la unica linea disponible en decir dos veces lo
        mismo.
    */
    ...((e as IInstalledProvider).pluvider ? { subtitle: `Subscribe with id: ${e.id}` } : {})
})

const canUninstall = (p: IInstalledProvider): IExtensionVerdict => {
    // A pluvider is listed here as a HELP — so it can be seen what one may subscribe to — but it is not
    // an installed extension: it comes and goes with its plugin.
    if (p.pluvider) return { allowed: false, reason: `Provided by the '${p.hostedBy}' plugin — uninstall that plugin instead` }
    if (p.installedFrom === 'dev') return { allowed: false, reason: 'Dev providers cannot be uninstalled' }
    if (p.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

const HELP = 'guide/extensions/providers/index?id=managing-configuring-providers'

const providerDescriptor: IExtensionManagerDescriptor<IInstalledProvider, IProviderManifestEntry> = {
    extensionType: EExtensionType.PROVIDER,
    title: 'Manage providers',
    noun: { singular: 'provider', plural: 'providers' },
    helpSection: HELP,
    icon: Factory,
    endpoints: {
        installed: '/core/providers',
        install: '/core/providers/install',
        upload: '/core/providers/upload',
        remove: p => `/core/providers/${p.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    // Core providers are not extensions: drawing them here invites trying to remove them.
    //
    // PLUVIDERS are drawn, on purpose: whoever comes here comes to see which producers they can subscribe
    // to, and leaving them out would require knowing beforehand that they exist. What cannot be done is
    // managing them from here, and canUninstall and canConfigure take care of that.
    filterInstalled: p => !p.core,

    // A pluvider carries no configurations of its own: if it needs any, its plugin carries them.
    configCount: p => p.pluvider ? undefined : p.configNames?.length,

    /*
        Chips propios: marcar que una fila es un pluvider y no un provider. Sin esto, un 'plugin:agora'
        en la lista solo se distingue por el prefijo del id, que es mucho pedir.
    */
    extraChips: e => ('pluvider' in e && e.pluvider)
        ? [{
            label: 'pluvider',
            color: 'primary' as const,
            variant: 'outlined' as const,
            tooltip: `Not an installed provider: it is the '${(e as IInstalledProvider).hostedBy}' plugin also publishing what it produces, so other plugins can subscribe to it`
        }]
        : [],

    // There are providers that are configured in neither way — they bring no front end and declare no
    // schema — and for those the gear leads nowhere. A pluvider is never configured here: its
    // configuration, if it needs one, is its plugin's.
    canConfigure: p => p.pluvider
        ? { allowed: false, reason: `Configured from the '${p.hostedBy}' plugin, if it needs any configuration` }
        : (p.hasFront || p.hasSchema)
            ? { allowed: true }
            : { allowed: false, reason: 'No configuration available' },

    renderConfigDialog: (p, onClose) => p.hasFront
        // The extension draws it, not the core: the provider brings its own UI because its configurations
        // do not fit in a flat form (several of them with names, lists, connection tests…).
        ? React.createElement(ConfigFrontDialog, {
            extensionId: p.id,
            globalName: '__kwirth_providers__',
            frontPath: `/core/providers/${p.id}/front`,
            noun: 'provider',
            onClose
        })
        : React.createElement(ConfigFormDialog, {
            title: `Configure: ${p.displayName ?? p.id}`,
            helpSection: HELP,
            schemaEndpoint: `/core/providers/${p.id}/schema`,
            endpoint: `/core/providers/${p.id}/config`,
            // The test is served by the provider ITSELF in its configRouter, which the core mounts under another prefix
            ...(p.hasTest ? { testEndpoint: `/core/providerconfig/${p.id}/test` } : {}),
            emptyText: 'This provider has no configurable options.',
            onClose
        })
}

export { providerDescriptor }
export type { IInstalledProvider, IProviderManifestEntry }
