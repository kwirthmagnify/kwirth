import React from 'react'
import { Factory } from '@kwirthmagnify/kwirth-common-front/icons'
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
    /** Las configuraciones que lleva el provider. Su numero es el chip de la tarjeta. */
    configNames?: string[]
    /** Trae su propia UI de configuracion en front.js. */
    hasFront?: boolean
    /** Declara un schema, y entonces el formulario lo pinta el core. */
    hasSchema?: boolean
    /** Provider del core (events, metrics): viene dentro de Kwirth, no es una extension. */
    core?: boolean
    requiresRestart?: boolean
}

const toModel = (e: IInstalledProvider | IProviderManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledProvider).installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (p: IInstalledProvider): IExtensionVerdict => {
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

    // Los providers del core no son extensiones: pintarlos aqui invita a intentar quitarlos.
    filterInstalled: p => !p.core,

    configCount: p => p.configNames?.length,

    // Hay providers que no se configuran de ninguna de las dos formas —ni traen front ni declaran
    // schema— y para esos la rueda no lleva a ningun sitio.
    canConfigure: p => (p.hasFront || p.hasSchema)
        ? { allowed: true }
        : { allowed: false, reason: 'No configuration available' },

    renderConfigDialog: (p, onClose) => p.hasFront
        // Lo pinta la extension, no el core: el provider trae su propia UI porque sus configuraciones no
        // caben en un formulario plano (varias con nombre, listas, pruebas de conexion…).
        ? React.createElement(ConfigFrontDialog, { providerId: p.id, onClose })
        : React.createElement(ConfigFormDialog, {
            title: `Configure: ${p.displayName ?? p.id}`,
            helpSection: HELP,
            schemaEndpoint: `/core/providers/${p.id}/schema`,
            endpoint: `/core/providers/${p.id}/config`,
            emptyText: 'This provider has no configurable options.',
            onClose
        })
}

export { providerDescriptor }
export type { IInstalledProvider, IProviderManifestEntry }
