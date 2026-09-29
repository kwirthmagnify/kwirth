import { DCE_REGISTRY, EDceState, IDceRegistryEntry, TDceRegistry } from '@kwirthmagnify/kwirth-common'
import { IExtensionLogger } from './IExtension'

/*
    The back-end contract of a dynamic core extension (plan: plans/dce/PRD.md).

    A DCE does not export a module for others to import: it exports a FACTORY, and the core calls it
    once. What the factory returns is what is shared — the instance, not the code. Two consumers of the
    same DCE hold the same object, which is the whole point: one client, one cache, one registry.
*/

/**
 * A key-value store the host lends. It is the shape of the core's ConfigMaps and Secrets, and no more:
 * a DCE persists what is its own under names the core prefixes with `kwirth-dce-<id>-`, so two DCEs
 * cannot step on each other, nor on the core.
 */
export interface IDceStore {
    read: (name: string, defaultValue?: unknown) => Promise<unknown>
    write: (name: string, data: unknown) => Promise<unknown>
}

/** What the core hands the factory (PRD decision D4: logger, libs, configMaps and secrets). */
export interface IDceBackHost {
    /** The DCE's own id, as installed. */
    id: string
    logger: IExtensionLogger
    /** Scoped to this DCE: names are prefixed by the core. */
    configMaps: IDceStore
    /** Scoped the same way. A DCE that instantiates a client with credentials reads them here. */
    secrets: IDceStore
    /**
     * The libraries the core publishes to every extension (`global.__kwirth_back__`): common,
     * common-back, common-ai, common-sql, express. A DCE normally imports them and the build resolves
     * them against that global; they are here as well for one that wants to pick one by name.
     */
    libs: Record<string, unknown>
}

/** What a DCE's `back.js` exports (as `default` or as `dce`). */
export interface IDceBack<T = unknown> {
    /** Called ONCE by the core when the DCE loads. What it returns is what consumers get. */
    create(host: IDceBackHost): T | Promise<T>
}

const registry = (): TDceRegistry | undefined =>
    (globalThis as unknown as Record<string, TDceRegistry | undefined>)[DCE_REGISTRY]

/**
 * The instance of a DCE, by id.
 *
 * It THROWS when the DCE is not there, and says which case it is: never installed (or not loaded yet),
 * or installed but its factory failed — with the cause. It never returns `undefined`: a consumer that
 * carries on with an empty value is the failure that costs most to diagnose, because nothing in the log
 * says anything went wrong.
 */
export const getDce = <T>(id: string): T => {
    const entry: IDceRegistryEntry | undefined = registry()?.[id]
    if (!entry) throw new Error(`DCE '${id}' is not loaded: it is not installed, or the core has not loaded it yet`)
    if (entry.state === EDceState.FAILED) throw new Error(`DCE '${id}' failed to load: ${entry.error ?? 'unknown error'}`)
    return entry.instance as T
}

/** Whether a DCE is loaded and usable, for a consumer that can work without it. */
export const hasDce = (id: string): boolean => registry()?.[id]?.state === EDceState.LOADED
