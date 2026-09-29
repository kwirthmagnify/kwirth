/*
    The `dce` type's shared vocabulary (plan: plans/completed/dce/PRD.md).

    A dynamic core extension brings objects, not data: the core calls its factory once and keeps what it
    returns in a registry that hangs off a global — `global.__kwirth_dce__` in the back end,
    `window.__kwirth_dce__` in the front end — and other extensions ask for it by id. What lives here is
    what both ends and every consumer need to agree on: the registry's name, and what an entry says.
*/

/** The registry's name, the same on both ends. */
export const DCE_REGISTRY = '__kwirth_dce__'

/**
 * Where a DCE's `front.js` leaves its factory: `window.__kwirth_dce_factories__[id] = { create }`.
 * The core's loader calls `create()` and writes the result into the registry. A front script cannot
 * be handed a host as a parameter the way a back module can, so the registration is the handshake.
 */
export const DCE_FRONT_FACTORIES = '__kwirth_dce_factories__'

/**
 * How a DCE is right now, once the core has tried to load it.
 *
 * FAILED is a state and not an absence on purpose: a consumer asking for a DCE whose factory blew up
 * has to be told WHY, not "not installed". The two are fixed in different ways.
 */
export enum EDceState {
    /** Its factory ran and the instance is in the registry. */
    LOADED = 'loaded',
    /** Its factory threw, or its module exported no factory. `error` carries the cause. */
    FAILED = 'failed'
}

/** One entry of the registry: what `getDce()` reads. */
export interface IDceRegistryEntry {
    state: EDceState
    /** The object the factory returned. Only with LOADED. */
    instance?: unknown
    /** Why it did not load. Only with FAILED. */
    error?: string
}

export type TDceRegistry = Record<string, IDceRegistryEntry>

/** A consumer of a DCE, as the core finds it among what is installed. */
export interface IDceConsumer {
    type: string
    id: string
    /** The requirement as declared: 'dce:<id>:<minimum version>'. */
    requirement: string
}
