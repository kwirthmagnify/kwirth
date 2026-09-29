import React from 'react'
import { Description, Launch } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { EManagerSection, IExtensionAction, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionVerdict } from './extensionManagerModel'

/*
    The `docs` type's descriptor for the generic manager (plan: plans/completed/extension-managers-ui/PLAN.md).

    It is the type that made the generic one have a `keyOf` instead of assuming the `id`: a piece of
    documentation is identified by the PAIR (targetType, id), because the id is that of the DOCUMENTED
    extension and it repeats across types — a plugin and a theme may share a name and each bring its own
    guide. That composite key is what the catalogue uses to group versions, what decides whether
    something is already installed and what builds the deletion path.

    The other thing the type brings: opening the documentation in another tab.
*/

// The id is that of the documented extension; the pair with targetType is what identifies it.
interface IDocsManifestEntry {
    marketplaceId?: string
    marketplaceLabel?: string
    targetType: string
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    url: string
}

interface IDocsMeta {
    id: string
    targetType: string
    // 'name' is the PACKAGE's name (npm) and 'displayName' the human one, as in the other ten types.
    // While docs only came from dev, the tgz put the human name in 'name' and got away with it; as soon
    // as one is installed from a registry, 'name' is the scope and 'displayName' is what has to be drawn.
    name: string
    displayName?: string
    version: string
    description: string
    icon?: string
    website?: string
    installedFrom?: string
    marketplaceId?: string
    marketplaceLabel?: string
}

const toModel = (e: IDocsMeta | IDocsManifestEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: (e as IDocsMeta).installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (d: IDocsMeta): IExtensionVerdict => {
    // The core's documentation comes INSIDE the image: there is nothing to delete, and were it deleted
    // Kwirth would be left with no help.
    if (d.installedFrom === 'bundled') return { allowed: false, reason: 'Bundled documentation cannot be uninstalled' }
    if (d.installedFrom === 'dev') return { allowed: false, reason: 'Dev documentation cannot be uninstalled' }
    return { allowed: true }
}

/**
 * A factory because opening the documentation needs the back end's address: it is served from Kwirth
 * itself, not from an external site.
 */
const makeDocsDescriptor = (backendUrl: string): IExtensionManagerDescriptor<IDocsMeta, IDocsManifestEntry> => ({
    extensionType: EExtensionType.DOCS,
    title: 'Manage documentation',
    noun: { singular: 'documentation package', plural: 'documentation packages' },
    helpSection: 'guide/extensions/docs/index?id=admin-guide',
    icon: Description,
    endpoints: {
        installed: '/core/docs',
        install: '/core/docs/install',
        upload: '/core/docs/upload',
        remove: d => `/core/docs/${d.targetType}/${d.id}`
    },
    keyOf: e => `${e.targetType}/${e.id}`,
    toModel,
    canUninstall,

    actions: (e, section): IExtensionAction[] => section === EManagerSection.INSTALLED
        ? [{
            icon: React.createElement(Launch, { fontSize: 'small' }),
            tooltip: 'Open in new tab',
            color: 'primary',
            onClick: () => window.open(`${backendUrl}/core/docs/${e.targetType}/${e.id}/`, '_blank', 'noopener')
          }]
        : []
})

export { makeDocsDescriptor }
export type { IDocsMeta, IDocsManifestEntry }
