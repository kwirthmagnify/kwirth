/*
    Writing an extension index without losing what somebody else just wrote.

    🔴 THE BUG THIS EXISTS FOR. Every manager installed like this:

        const index = await configMaps.read(INDEX_KEY, [])   // read
        ...                                                   // download the tgz, write meta, write back.js
        index.push(meta)
        await configMaps.write(INDEX_KEY, index)              // write

    A read-modify-write with several awaits in between. Install two extensions at once — which the UI
    happily allows, one click after another — and: A reads [], B reads [], A writes [A], B writes [B].
    A is GONE from the index. And because `registerToolset`/`registerChannel` did run, the live registry
    still holds it, so installing it again answers "already installed" while the list, which reads the
    index, does not show it. Reported on aitoolsets, present in all ten managers.

    What this does NOT do is serialise the whole installation: downloading a tarball can take seconds and
    there is no reason to queue that. Only the read-modify-write of the index is serialised, with the
    index RE-READ inside the lock, so what gets written is always the newest list plus this change.

    ⚠️ It is a lock within ONE process, which is what the bug needs: the race is between two requests to
    the same core. Two cores sharing a store would still need the store to arbitrate, and ConfigMaps
    offers no compare-and-swap to do it with.
*/

const queues = new Map<string, Promise<unknown>>()

/**
 * Runs `mutate` with exclusive access to the index named `key`, queued behind anything else touching it.
 *
 * A failing task does not block the queue: the next one runs regardless, and the error reaches its own
 * caller and nobody else's.
 */
export const withIndexLock = async <T>(key: string, mutate: () => Promise<T>): Promise<T> => {
    const previous = queues.get(key) ?? Promise.resolve()
    // .then(mutate, mutate): it runs whether the previous one resolved or threw
    const result = previous.then(mutate, mutate)
    queues.set(key, result.catch(() => undefined))
    try {
        return await result
    }
    finally {
        // the queue is dropped once nothing is waiting, so a long-lived core does not keep one map entry
        // per index for ever — harmless, but this keeps it honest
        if (queues.get(key) === undefined) queues.delete(key)
    }
}

/**
 * The whole read-modify-write of an index, done safely: the list is re-read INSIDE the lock, `change`
 * decides what the new list is, and it is written back.
 *
 * `change` must be pure and quick — no downloads, no other writes. Anything slow belongs before the
 * call, which is the point of having this narrow.
 */
export const updateIndex = async <T>(
    key: string,
    read: () => Promise<T[]>,
    write: (list: T[]) => Promise<void>,
    change: (list: T[]) => T[]
): Promise<T[]> =>
    withIndexLock(key, async () => {
        const fresh = change((await read()) ?? [])
        await write(fresh)
        return fresh
    })
