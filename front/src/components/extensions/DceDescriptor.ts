// Hub and not Extension: a DCE is the shared centre several extensions hang off, and Hub is already in
// the curated barrel — the barrel is a runtime contract, and widening it for one icon would mean
// republishing common-front and rebuilding every extension that reads it.
import { Hub } from '@kwirthmagnify/kwirth-common-front/icons'
import { EDceState, EExtensionType, IDceRegistryEntry } from '@kwirthmagnify/kwirth-common'
import { EManagerSection, IExtensionManagerDescriptor, IExtensionCardModel, IExtensionChip, IExtensionVerdict } from './extensionManagerModel'

/*
    The `dce` type's descriptor (plan: plans/completed/dce/PLAN.md, S2), a client of the generic manager.

    A DCE has NO configuration in this version, so there is no gear here and no dialog of its own: it is
    installed, listed and removed, and that is all the type does. What it does bring that the other
    families do not is the STATE of its back end — a DCE whose factory threw is installed and useless,
    and that has to be readable from the card instead of from the core's log.
*/

interface IDceEntry {
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
    /** Which sides the package brought. Either may be missing, never both. */
    hasBack?: boolean
    hasFront?: boolean
    /** Installed only: how the back end is RIGHT NOW. The API adds it from the registry, not from the index. */
    back?: IDceRegistryEntry
}

const toModel = (e: IDceEntry): IExtensionCardModel => ({
    name: e.displayName || e.name || e.id,
    version: e.version,
    description: e.description,
    website: e.website,
    installedFrom: e.installedFrom,
    marketplaceLabel: e.marketplaceLabel
})

// A dev DCE is governed by kwirth-dev.json, not by the dialog, and a bundled one travels inside Kwirth.
// Being IN USE is not checked here: the back end owns that answer (it is the one that knows who requires
// it) and refuses with the list of consumers. Guessing it in the front end would mean two truths.
const canUninstall = (e: IDceEntry): IExtensionVerdict => {
    if (e.installedFrom === 'dev') return { allowed: false, reason: 'Dev DCEs cannot be uninstalled' }
    if (e.installedFrom === 'bundled') return { allowed: false, reason: 'Built-in DCEs cannot be uninstalled' }
    if (e.installedFrom?.startsWith('pack:')) return { allowed: false, reason: 'Installed via pack — uninstall the pack instead' }
    return { allowed: true }
}

/*
    The chips of a DCE: which sides it brings, and whether its back end is alive.

    The state chip is the one that earns its place. An installed DCE whose factory threw looks exactly
    like a healthy one in every other manager — it is in the list, with its version — and its consumers
    fail far from here, when they call getDce(). The chip says it where it is looked at, and carries the
    cause in its tooltip so nobody has to go to the server log to find out what broke.
*/
const extraChips = (e: IDceEntry, section: EManagerSection): IExtensionChip[] => {
    if (section !== EManagerSection.INSTALLED) return []
    const chips: IExtensionChip[] = []
    const sides = [e.hasBack && 'back', e.hasFront && 'front'].filter(Boolean).join(' + ')
    if (sides) chips.push({ label: sides, variant: 'outlined' })
    if (e.back?.state === EDceState.FAILED) {
        chips.push({ label: 'Failed', color: 'error', tooltip: e.back.error ?? 'its factory did not run' })
    }
    else if (e.back?.state === EDceState.LOADED) {
        chips.push({ label: 'Loaded', color: 'success', variant: 'outlined' })
    }
    return chips
}

const makeDceDescriptor = (): IExtensionManagerDescriptor<IDceEntry, IDceEntry> => ({
    extensionType: EExtensionType.DCE,
    title: 'Manage DCEs',
    noun: { singular: 'DCE', plural: 'DCEs' },
    helpSection: 'guide/extensions/dces/index?id=managing-dces',
    icon: Hub,
    endpoints: {
        installed: '/core/dce',
        install: '/core/dce/install',
        upload: '/core/dce/upload',
        remove: e => `/core/dce/${e.id}`
    },
    keyOf: e => e.id,
    toModel,
    canUninstall,
    extraChips
})

export { makeDceDescriptor }
export type { IDceEntry }
