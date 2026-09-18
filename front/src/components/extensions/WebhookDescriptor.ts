import React from 'react'
import { Https } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { IExtensionManagerDescriptor, IExtensionCardModel, IExtensionVerdict } from './extensionManagerModel'
import { ExtensionConfigsDialog } from './ExtensionConfigsDialog'
import { WebhookUrlPanel } from './WebhookUrlPanel'

/*
    Descriptor del tipo `webhook` para el gestor generico (plan: plans/extension-managers-ui/PLAN.md).

    Es el primero que trae CONFIGURACIONES CON NOMBRE: un webhook no se configura una vez, tiene una
    entrada por cada sistema que le llama, y de ahi el chip 'N configs' que el generico ya sabia pintar
    (`configCount`) pero que hasta ahora no usaba nadie.

    El gestor de esas configuraciones no es de webhooks: es ExtensionConfigsDialog, comun con senders, que
    habla los mismos endpoints bajo su basePath. Lo unico propio del tipo es la URL de ingesta con su
    token, que entra por `perConfigPanel`.
*/

interface IRequirement {
    extensionType: EExtensionType
    id: string
    minVersion: string
}

interface IWebhookManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    id: string
    extensionType?: EExtensionType
    name: string
    displayName: string
    version: string
    description: string
    website?: string
    url: string
    requires?: IRequirement[]
    uses?: IRequirement[]
}

interface IInstalledWebhook {
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
    hasFront?: boolean
    requiresRestart?: boolean
}

const toModel = (e: IInstalledWebhook | IWebhookManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IInstalledWebhook).installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (w: IInstalledWebhook): IExtensionVerdict => {
    if (w.installedFrom === 'dev') return { allowed: false, reason: 'Dev webhooks cannot be uninstalled' }
    if (w.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

const HELP = 'guide/extensions/webhooks/index?id=managing-configuring-webhooks'

const webhookDescriptor: IExtensionManagerDescriptor<IInstalledWebhook, IWebhookManifestEntry> = {
    extensionType: EExtensionType.WEBHOOK,
    title: 'Manage webhooks',
    noun: { singular: 'webhook', plural: 'webhooks' },
    helpSection: HELP,
    icon: Https,
    endpoints: {
        installed: '/core/webhooks',
        install: '/core/webhooks/install',
        upload: '/core/webhooks/upload',
        remove: w => `/core/webhooks/${w.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,

    // El chip 'N configs': cuantas entradas tiene abiertas ese webhook. Un webhook sin configuraciones no
    // recibe nada, y eso se lee de un vistazo.
    configCount: w => w.configNames.length,

    renderConfigDialog: (w, onClose) => React.createElement(ExtensionConfigsDialog, {
        title: `Configure: ${w.displayName ?? w.id}`,
        helpSection: HELP,
        basePath: `/core/webhooks/${w.id}`,
        perConfigPanel: WebhookUrlPanel,
        onClose
    })
}

export { webhookDescriptor }
export type { IInstalledWebhook, IWebhookManifestEntry }
