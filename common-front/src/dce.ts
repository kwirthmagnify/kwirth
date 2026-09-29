import { DCE_REGISTRY, EDceState, IDceRegistryEntry, TDceRegistry } from '@kwirthmagnify/kwirth-common'

/*
    The front end's side of a dynamic core extension (plan: plans/completed/dce/PRD.md).

    The mirror of `getDce()` in common-back, and deliberately the same shape: a consumer that uses a DCE
    on both ends writes the same line twice, and what changes is only which package it imports from.

    What differs is the handshake. A back-end module is evaluated by the core, which can hand it a host
    as a parameter; a front-end script is a <script> tag and cannot receive anything. So the DCE's
    front.js REGISTERS its factory at `window.__kwirth_dce_factories__[id]`, and the core's loader calls
    it once and writes the instance into the registry this file reads.
*/

const registry = (): TDceRegistry | undefined =>
    (globalThis as unknown as Record<string, TDceRegistry | undefined>)[DCE_REGISTRY]

/**
 * The instance of a DCE, by id.
 *
 * It THROWS when the DCE is not there, and says which case it is: never installed (or not loaded yet),
 * or installed but its factory failed — with the cause. It never returns `undefined`: a consumer that
 * carries on with an empty value is the failure that costs most to diagnose, because nothing in the
 * console says anything went wrong.
 */
export const getDce = <T>(id: string): T => {
    const entry: IDceRegistryEntry | undefined = registry()?.[id]
    if (!entry) throw new Error(`DCE '${id}' is not loaded: it is not installed, or the front end has not loaded it yet`)
    if (entry.state === EDceState.FAILED) throw new Error(`DCE '${id}' failed to load: ${entry.error ?? 'unknown error'}`)
    return entry.instance as T
}

/** Whether a DCE is loaded and usable, for a consumer that can work without it. */
export const hasDce = (id: string): boolean => registry()?.[id]?.state === EDceState.LOADED
