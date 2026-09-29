import { EDceState } from '@kwirthmagnify/kwirth-common'
import { addGetAuthorization } from './AuthorizationManagement'

/*
    The DCEs' front end, loaded ONCE and before any extension that may consume them
    (plan: plans/dce/PRD.md, RF7).

    A consumer asks for its DCE with getDce() the moment its script runs, so the instance has to be in
    `window.__kwirth_dce__` BEFORE that script is added to the page. The back end keeps this invariant by
    loading the DCEs first of all the managers; here it is kept with ONE promise that the four loaders
    await — plugins, configuration dialogs, themes and homepages.

    It loads the whole set rather than the ones each consumer declares, on purpose: a configuration
    dialog does not hold its extension's metadata, so resolving per consumer would mean each of the four
    loaders fetching it first. A DCE is a shared library and not a feature, so the set is small — and
    this way the guarantee does not depend on every loader remembering to ask.

    It lives in a module and not in App's state because the configuration dialog needs it too, and both
    have to await the SAME promise: two caches would be two loads, and a DCE loaded twice is two
    instances, which is exactly what the type exists to prevent.
*/

interface IDceListEntry {
    id: string
    hasFront?: boolean
}

let loading: Promise<void> | undefined

/**
 * Loads one DCE's front.js and calls its factory once.
 *
 * The script only REGISTERS its factory at `window.__kwirth_dce_factories__`; calling it is the core's
 * job, exactly as in the back end. Were the script to build its object on its own, there would be no
 * way to tell a DCE that failed from one that never ran, and the failure would reach the consumer as an
 * `undefined` instead of as a cause.
 *
 * It NEVER rejects: a broken DCE leaves a FAILED entry with its reason and lets the consumers carry on.
 * Whoever really needs it gets the reason from getDce(); the rest must not be held back by it.
 */
export const loadDceFront = (backendUrl: string, id: string): Promise<void> => new Promise<void>(resolve => {
    const existing = document.getElementById(`kwirth-dce-${id}`)
    if (existing) existing.remove()
    const script = document.createElement('script')
    script.id = `kwirth-dce-${id}`
    script.src = `${backendUrl}/core/dce/${id}/front?t=${Date.now()}`
    script.onload = () => {
        const factory = window.__kwirth_dce_factories__?.[id]
        if (!factory || typeof factory.create !== 'function') {
            window.__kwirth_dce__[id] = { state: EDceState.FAILED, error: 'front.js registered no factory with create()' }
            console.log(`[dce] '${id}' front.js registered no factory`)
            return resolve()
        }
        try {
            window.__kwirth_dce__[id] = { state: EDceState.LOADED, instance: factory.create(window.__kwirth__) }
            console.log(`[dce] '${id}' loaded`)
        }
        catch (err) {
            window.__kwirth_dce__[id] = { state: EDceState.FAILED, error: err instanceof Error ? err.message : String(err) }
            console.log(`[dce] '${id}' factory failed: ${err}`)
        }
        resolve()
    }
    script.onerror = () => {
        window.__kwirth_dce__[id] = { state: EDceState.FAILED, error: 'front.js could not be downloaded' }
        console.log(`[dce] '${id}' front.js could not be downloaded`)
        resolve()
    }
    document.head.appendChild(script)
})

/** Every installed DCE with a front end, loaded once. Idempotent: everybody awaits the same promise. */
export const ensureDcesLoaded = (backendUrl: string, accessString: string): Promise<void> => {
    if (!loading) {
        loading = fetch(`${backendUrl}/core/dce`, addGetAuthorization(accessString))
            .then(r => r.ok ? r.json() : [])
            .then((dces: IDceListEntry[]) =>
                Promise.all(dces.filter(d => d.hasFront).map(d => loadDceFront(backendUrl, d.id))).then(() => {}))
            // A listing that fails must not leave every consumer waiting for ever: they load, and whoever
            // asks for a DCE gets the error from getDce().
            .catch(err => { console.log(`[dce] failed to list installed DCEs: ${err}`) })
    }
    return loading
}

/**
 * Forgets the cache, so the next consumer re-reads what is installed. Called after installing or
 * removing a DCE from the manager.
 *
 * ⚠️ It does NOT replace what the consumers already hold: whoever got an instance keeps it until the
 * page is reloaded, which is why updating a DCE asks for exactly that (RNF4).
 */
export const resetDceCache = (): void => { loading = undefined }
