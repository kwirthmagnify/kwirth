import React from 'react'
import { Send } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { IExtensionManagerDescriptor, IExtensionCardModel, IExtensionRequirement, IExtensionVerdict } from './extensionManagerModel'
import { ConfigListDialog } from './ConfigListDialog'
import { ConfigFrontDialog } from './ConfigFrontDialog'

/*
    Descriptor del tipo `sender` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    El ultimo de los once, y el que mas cosas traia. Casi todas resultaron ser de todos y estan ya en el
    generico o en los diálogos comunes:

      · varias configuraciones con nombre, como webhooks → ConfigListDialog, con los mismos endpoints
      · configuracion BASE (los campos que el schema marca `common`): el servidor de correo es uno y los
        destinatarios son varios. La edita ConfigListDialog, que la aprendio al migrar este tipo.
      · exportar e importar configuraciones, tambien de ConfigListDialog: es como se lleva la misma
        configuracion de un Kwirth a otro sin volver a teclearla.
      · los que traen su propia UI (hasFront) → ConfigFrontDialog, igual que los providers complejos
      · `requires` / `uses` los entiende el generico para los once tipos

    Lo unico que queda aqui: que la ayuda apunte a la pagina de ESE sender cuando existe.
*/

interface ISenderManifestEntry {
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

interface IInstalledSender {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
    /** Las configuraciones que tiene puestas. Su numero es el chip de la tarjeta. */
    configNames: string[]
    /** Trae su propia UI de configuracion en front.js. */
    hasFront?: boolean
    requiresRestart?: boolean
}

const toModel = (e: IInstalledSender | ISenderManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledSender).installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (s: IInstalledSender): IExtensionVerdict => {
    if (s.installedFrom === 'dev') return { allowed: false, reason: 'Dev senders cannot be uninstalled' }
    if (s.installedFrom === 'bundled') return { allowed: false, reason: 'Built-in senders cannot be uninstalled' }
    if (s.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

const HELP = 'guide/extensions/senders/index?id=managing-configuring-senders'

const senderDescriptor: IExtensionManagerDescriptor<IInstalledSender, ISenderManifestEntry> = {
    extensionType: EExtensionType.SENDER,
    title: 'Manage senders',
    noun: { singular: 'sender', plural: 'senders' },
    helpSection: HELP,
    icon: Send,
    endpoints: {
        installed: '/core/senders',
        install: '/core/senders/install',
        upload: '/core/senders/upload',
        remove: s => `/core/senders/${s.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    // Cuantos destinos tiene puestos ese sender. Uno sin configuraciones no manda nada a ningun sitio.
    configCount: s => s.configNames.length,

    renderConfigDialog: (s, onClose) => s.hasFront
        ? React.createElement(ConfigFrontDialog, {
            extensionId: s.id,
            globalName: '__kwirth_senders__',
            frontPath: `/core/senders/${s.id}/front`,
            noun: 'sender',
            onClose
        })
        : React.createElement(ConfigListDialog, {
            title: `Configure: ${s.displayName ?? s.id}`,
            helpSection: HELP,
            // Si el sender publica su propia pagina de referencia, la ayuda lleva alli; si no, a la
            // general. Se comprueba de verdad, asi que publicarla la enlaza sola.
            preferredHelpSection: `guide/extensions/senders/${s.id}`,
            basePath: `/core/senders/${s.id}`,
            exportName: `sender-${s.id}`,
            onClose
        })
}

export { senderDescriptor }
export type { IInstalledSender, ISenderManifestEntry }
