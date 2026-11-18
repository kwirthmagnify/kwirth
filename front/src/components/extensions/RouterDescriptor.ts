// CallSplit: a route that branches off towards a cluster with no direct path. Already in the curated barrel —
// the barrel is a runtime contract, and widening it for one icon would mean republishing common-front.
import React from 'react'
import { CallSplit } from '@kwirthmagnify/kwirth-common-front/icons'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionChip, IExtensionVerdict } from './extensionManagerModel'
import { ConfigFormDialog } from './ConfigFormDialog'

/*
    The `router` type's descriptor (plans/router-extension, S4), a client of the generic manager.

    A router has no front of its own: its configuration is the core's generic dialog, drawn from the fields
    it declares (/core/routers/<id>/schema). Secret fields come back REAL and are shown masked, with the eye.
    Installing, updating and removing it needs no restart.

    What it brings that the other families do not is its STATE: a router that could not start is installed
    and useless, and that has to be readable from the card, with the cause, not from the core's log.
*/

interface IRouterStatus {
    started: boolean
    lastError?: string
    detail?: string
}

interface IRouterEntry {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    url?: string
    marketplaceId?: string
    marketplaceLabel?: string
    installedFrom?: string
    requiresRestart?: boolean
    /** Installed only: how it is RIGHT NOW (the live table, not the index) */
    status?: IRouterStatus
}

const toModel = (e: IRouterEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: e.installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

const canUninstall = (e: IRouterEntry): IExtensionVerdict => {
    if (e.installedFrom === 'dev') return { allowed: false, reason: 'Dev routers cannot be uninstalled' }
    if (e.installedFrom === 'bundled') return { allowed: false, reason: 'Built-in routers cannot be uninstalled' }
    if (e.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

// Started (with what it is doing, in the tooltip) or failed (with why)
const extraChips = (e: IRouterEntry, section: EManagerSection): IExtensionChip[] => {
    if (section !== EManagerSection.INSTALLED || !e.status) return []
    if (!e.status.started) return [{ label: 'Failed', color: 'error', tooltip: e.status.lastError ?? 'it is not started' }]
    if (e.status.lastError) return [{ label: 'Error', color: 'warning', tooltip: e.status.lastError }]
    return [{ label: 'Started', color: 'success', variant: 'outlined', ...(e.status.detail ? { tooltip: e.status.detail } : {}) }]
}

const HELP = 'guide/extensions/routers/index'

const makeRouterDescriptor = (): IExtensionManagerDescriptor<IRouterEntry, IRouterEntry> => ({
    extensionType: EExtensionType.ROUTER,
    keepsConfig: true,
    title: 'Manage routers',
    noun: { singular: 'router', plural: 'routers' },
    helpSection: HELP,
    icon: CallSplit,
    endpoints: {
        installed: '/core/routers',
        install: '/core/routers/install',
        upload: '/core/routers/upload',
        remove: e => `/core/routers/${e.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,
    extraChips,
    // A router that is not started cannot say which fields it has
    canConfigure: e => e.status?.started === false ? { allowed: false, reason: `Not started: ${e.status.lastError ?? 'see the core log'}` } : { allowed: true },
    renderConfigDialog: (e, onClose) => React.createElement(ConfigFormDialog, {
        title: `Configure: ${e.displayName ?? e.id}`,
        helpSection: HELP,
        schemaEndpoint: `/core/routers/${e.id}/schema`,
        endpoint: `/core/routers/${e.id}/config`,
        emptyText: 'This router has no configurable options.',
        onClose
    })
})

export { makeRouterDescriptor }
export type { IRouterEntry }
