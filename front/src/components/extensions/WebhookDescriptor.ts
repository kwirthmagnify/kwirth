import React from 'react'
import { Https } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { IExtensionManagerDescriptor, IExtensionCardModel, IExtensionVerdict } from './extensionManagerModel'
import { ConfigListDialog } from './ConfigListDialog'
import { WebhookUrlPanel } from './WebhookUrlPanel'

/*
    The `webhook` type's descriptor for the generic manager (plan: plans/completed/extension-managers-ui/PLAN.md).

    It is the first one to bring NAMED CONFIGURATIONS: a webhook is not configured once, it has one entry
    per system that calls it, hence the 'N configs' chip the generic one already knew how to paint
    (`configCount`) but which until now nobody used.

    The manager of those configurations does not belong to webhooks: it is ExtensionConfigsDialog, shared
    with senders, which speaks the same endpoints under its basePath. The only thing of the type's own is
    the ingest URL with its token, which comes in through `perConfigPanel`.
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
    /** The configurations it has in place. Their number is the card's chip. */
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

    // The 'N configs' chip: how many entries that webhook has open. A webhook with no configurations
    // receives nothing, and that reads at a glance.
    configCount: w => w.configNames.length,

    renderConfigDialog: (w, onClose) => React.createElement(ConfigListDialog, {
        title: `Configure: ${w.displayName ?? w.id}`,
        helpSection: HELP,
        basePath: `/core/webhooks/${w.id}`,
        perConfigPanel: WebhookUrlPanel,
        onClose
    })
}

export { webhookDescriptor }
export type { IInstalledWebhook, IWebhookManifestEntry }
