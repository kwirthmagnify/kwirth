import { DCE_REGISTRY, EDceState, TDceRegistry } from '@kwirthmagnify/kwirth-common'
import { IStatusDce, IStatusDcePart } from '../common/StatusTypes'
import { IHealthLabel } from './StatusLabels'

/*
    The DCE tab's arithmetic, apart from the component so it can be tested.

    A DCE has two halves and each one loads on its own side: the back end in the core's process (the
    snapshot brings its state), the front end in THIS browser (read here, from the page's own registry).
    One can be fine and the other broken, so they are shown apart and never folded into one state.
*/

/** The page's DCE registry, where the core's front end leaves each DCE it loaded. Empty if there is none. */
export const readFrontRegistry = (): TDceRegistry =>
    ((globalThis as unknown as Record<string, TDceRegistry | undefined>)[DCE_REGISTRY]) ?? {}

/**
 * The state of the front half, from the page's registry. Undefined when the DCE has no front end, or
 * when this page has not loaded it (yet): the tab tells those two apart through `hasFront`.
 */
export const frontPartOf = (dce: IStatusDce, registry: TDceRegistry): IStatusDcePart | undefined => {
    if (!dce.hasFront) return undefined
    const entry = registry[dce.id]
    if (!entry) return undefined
    return { state: entry.state, ...(entry.error ? { error: entry.error } : {}) }
}

/*
    How one half is worded. Three cases and not two, and they must not be confused: a DCE with no front
    end is not a fault ('—'), one with a front end that this page did not load IS worth a look.
*/
export const partLabel = (has: boolean, part: IStatusDcePart | undefined): IHealthLabel => {
    if (!has) return { label: '—', color: 'default' }
    if (!part) return { label: 'Not loaded', color: 'warning' }
    switch (part.state) {
        case EDceState.LOADED: return { label: 'Loaded', color: 'success' }
        case EDceState.FAILED: return { label: 'Failed', color: 'error' }
        default: return { label: String(part.state), color: 'default' }
    }
}

/** Whether a half is broken: it exists and did not load, or loaded with a failure. */
const broken = (has: boolean, part: IStatusDcePart | undefined): boolean =>
    has && (!part || part.state === EDceState.FAILED)

/** Whether a DCE needs a look: either of its halves is broken. */
export const isBroken = (dce: IStatusDce, registry: TDceRegistry): boolean =>
    broken(dce.hasBack, dce.back) || broken(dce.hasFront, frontPartOf(dce, registry))

/** What needs a look first, and within each group by id. */
export const sortDces = (dces: IStatusDce[], registry: TDceRegistry): IStatusDce[] =>
    [...dces].sort((a, b) => {
        const d = Number(isBroken(b, registry)) - Number(isBroken(a, registry))
        return d !== 0 ? d : a.id.localeCompare(b.id)
    })

/** By id, name, version or consumer, case-insensitive: the column one searches is the one one sees. */
export const filterDces = (dces: IStatusDce[], filter: string): IStatusDce[] => {
    if (!filter) return dces
    const f = filter.toLowerCase()
    return dces.filter(d =>
        d.id.toLowerCase().includes(f) ||
        d.name.toLowerCase().includes(f) ||
        d.version.toLowerCase().includes(f) ||
        d.consumers.some(c => c.id.toLowerCase().includes(f) || c.type.toLowerCase().includes(f)))
}

/** The Home box's figures. */
export interface IDceSummary {
    total: number
    /** DCEs with a broken half. */
    broken: number
    /** Distinct extensions consuming at least one DCE. */
    consumers: number
    /** DCEs nobody requires: installed and of use to nobody. */
    unused: number
    /** Bytes of all the code the core reports (back and front). Absent when it reports none at all. */
    bytes?: number
}

/** The bytes of one DCE's code, back and front together; undefined when the core gave neither. */
export const dceBytes = (dce: IStatusDce): number | undefined =>
    dce.backBytes === undefined && dce.frontBytes === undefined ? undefined : (dce.backBytes ?? 0) + (dce.frontBytes ?? 0)

export const summarizeDces = (dces: IStatusDce[], registry: TDceRegistry): IDceSummary => {
    const sized = dces.map(dceBytes).filter((b): b is number => b !== undefined)
    return {
        total: dces.length,
        broken: dces.filter(d => isBroken(d, registry)).length,
        consumers: new Set(dces.flatMap(d => d.consumers.map(c => `${c.type}:${c.id}`))).size,
        unused: dces.filter(d => d.consumers.length === 0).length,
        ...(sized.length ? { bytes: sized.reduce((a, b) => a + b, 0) } : {})
    }
}

/*
    A size as people read it: bytes under one KB, KB under one MB, MB above. Binary units (1 KB = 1024 B),
    like the browser's network panel the front.js figure will be compared with.
*/
export const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
