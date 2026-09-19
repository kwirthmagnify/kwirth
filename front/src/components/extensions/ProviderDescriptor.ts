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
    /** Las configuraciones que lleva el provider. Su numero es el chip de la tarjeta. */
    configNames?: string[]
    /** Trae su propia UI de configuracion en front.js. */
    hasFront?: boolean
    /** Declara un schema, y entonces el formulario lo pinta el core. */
    hasSchema?: boolean
    /** Provider del core (events, metrics): viene dentro de Kwirth, no es una extension. */
    core?: boolean
    /**
     * PLUVIDER: no es un provider sino un plugin que ademas produce y expone su informacion
     * in-process. Se sirve en la misma lista para que quien CONSUME providers no tenga que saber que
     * existen dos clases, pero aqui no pinta nada: no se instala ni se desinstala por separado, va y
     * viene con su plugin.
     */
    pluvider?: boolean
    /** id del plugin que aloja el pluvider (el 'agora' de 'plugin:agora'). Solo en pluviders. */
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
    // Un pluvider se lista aqui como AYUDA —para que se vea a que se puede uno suscribir— pero no es
    // una extension instalada: viene y se va con su plugin.
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

    // Los providers del core no son extensiones: pintarlos aqui invita a intentar quitarlos.
    //
    // Los PLUVIDERS si se pintan, a proposito: quien entra aqui viene a ver a que productores puede
    // suscribirse, y dejarlos fuera obligaria a saber de antemano que existen. Lo que no se puede es
    // gestionarlos desde aqui, y de eso se encargan canUninstall y canConfigure.
    filterInstalled: p => !p.core,

    // Un pluvider no lleva configuraciones propias: si necesita alguna, la lleva su plugin.
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

    // Hay providers que no se configuran de ninguna de las dos formas —ni traen front ni declaran
    // schema— y para esos la rueda no lleva a ningun sitio. Un pluvider nunca se configura aqui: su
    // configuracion, si la necesita, es la de su plugin.
    canConfigure: p => p.pluvider
        ? { allowed: false, reason: `Configured from the '${p.hostedBy}' plugin, if it needs any configuration` }
        : (p.hasFront || p.hasSchema)
            ? { allowed: true }
            : { allowed: false, reason: 'No configuration available' },

    renderConfigDialog: (p, onClose) => p.hasFront
        // Lo pinta la extension, no el core: el provider trae su propia UI porque sus configuraciones no
        // caben en un formulario plano (varias con nombre, listas, pruebas de conexion…).
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
            emptyText: 'This provider has no configurable options.',
            onClose
        })
}

export { providerDescriptor }
export type { IInstalledProvider, IProviderManifestEntry }
