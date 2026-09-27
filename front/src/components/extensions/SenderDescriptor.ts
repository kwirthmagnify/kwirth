import React from 'react'
import { Send } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { IExtensionManagerDescriptor, IExtensionCardModel, IExtensionRequirement, IExtensionVerdict } from './extensionManagerModel'
import { ConfigListDialog } from './ConfigListDialog'
import { ConfigFrontDialog } from './ConfigFrontDialog'

/*
    The `sender` type's descriptor for the generic manager (plan: plans/extension-managers-ui/PLAN.md).

    The last of the eleven, and the one that brought the most. Almost all of it turned out to belong to
    everybody and is already in the generic one or in the common dialogs:

      · several named configurations, like webhooks → ConfigListDialog, with the same endpoints
      · the BASE configuration (the fields the schema marks as `common`): the mail server is one and the
        recipients are many. ConfigListDialog edits it, which it learned while migrating this type.
      · exporting and importing configurations, also from ConfigListDialog: it is how the same
        configuration is taken from one Kwirth to another without typing it again.
      · those bringing their own UI (hasFront) → ConfigFrontDialog, just like the complex providers
      · `requires` / `uses` are understood by the generic one for all eleven types

    The only thing left here: making the help point at THAT sender's page when one exists.
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
    /** The configurations it has in place. Their number is the card's chip. */
    configNames: string[]
    /** It brings its own configuration UI in front.js. */
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

    // How many destinations that sender has in place. One with no configurations sends nothing anywhere.
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
            // If the sender publishes its own reference page, the help leads there; if not, to the
            // general one. It is really checked, so publishing it links it by itself.
            preferredHelpSection: `guide/extensions/senders/${s.id}`,
            basePath: `/core/senders/${s.id}`,
            exportName: `sender-${s.id}`,
            onClose
        })
}

export { senderDescriptor }
export type { IInstalledSender, ISenderManifestEntry }
