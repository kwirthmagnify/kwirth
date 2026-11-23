/*
    One localStorage per Kwirth, inside the browser's single one.

    The browser gives ONE localStorage per origin (scheme, host and port): the path is not part of it. Three
    Kwirths served from the same domain under different paths (/kwirth-a, /kwirth-b, /kwirth-c) shared every
    key, so the same user name in two of them overwrote each other's recent and favourite tabs, workspaces,
    theme, homepage… and so did every extension that keeps something in localStorage.

    Here each Kwirth served under a path keeps ONE entry of the browser's localStorage, named after its root
    path ('/kwirth-a'), whose value is an object with the keys it used to keep loose:

        localStorage
        ├── "/kwirth-a" → { "lastTabs.admin": "…", "kwirth.theme": "…", "agora.nameSkip": "…" }
        └── "/kwirth-b" → { "lastTabs.admin": "…", "kwirth.theme": "…" }

    It is installed ONCE, before anything renders, by replacing the Storage methods for the localStorage
    object only: the core and every extension —third parties' included— keep calling
    localStorage.getItem('lastTabs.admin') exactly as before and get their Kwirth's value, without knowing.

    A Kwirth served at the root ('') is left alone: it keeps using localStorage directly, so the existing
    installations lose nothing. Nothing is migrated: a Kwirth under a path starts its own entry empty once.

    The entry is read on every call and not cached: another tab of the same Kwirth may have written it.
*/

/** The value kept in the context's entry: the loose keys, each with its string value. */
type TScopedData = Record<string, string>

/**
 * Makes `target` (the browser's localStorage) keep everything inside one entry named `scope`.
 *
 * `proto` is the prototype whose methods are replaced — Storage.prototype in the browser. The methods are
 * replaced there and not on the object because assigning `localStorage.getItem = …` stores an ITEM called
 * 'getItem'. Every other Storage (sessionStorage) goes on untouched: the replacement only acts when called
 * on `target`.
 */
export const installScopedStorage = (scope: string, target: Storage = window.localStorage, proto: Storage = Storage.prototype): void => {
    if (!scope) return

    const original = {
        getItem: proto.getItem,
        setItem: proto.setItem,
        removeItem: proto.removeItem,
        key: proto.key,
        clear: proto.clear
    }
    // Looked up along the chain: in the browser it is Storage.prototype's own, but it may be inherited
    let originalLength: PropertyDescriptor | undefined
    for (let p: object | null = proto; p && !originalLength; p = Object.getPrototypeOf(p)) {
        originalLength = Object.getOwnPropertyDescriptor(p, 'length')
    }

    // The context's object. Whatever is not an object of strings (hand-edited, another version) reads as empty.
    const read = (): TScopedData => {
        const raw = original.getItem.call(target, scope)
        if (!raw) return {}
        try {
            const parsed: unknown = JSON.parse(raw)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
            const data: TScopedData = {}
            for (const k of Object.keys(parsed)) {
                const v = (parsed as Record<string, unknown>)[k]
                if (typeof v === 'string') data[k] = v
            }
            return data
        }
        catch {
            return {}
        }
    }

    // An empty context leaves no entry behind. A quota error is thrown as localStorage would throw it.
    const write = (data: TScopedData): void => {
        if (Object.keys(data).length === 0) original.removeItem.call(target, scope)
        else original.setItem.call(target, scope, JSON.stringify(data))
    }

    proto.getItem = function (this: Storage, key: string): string | null {
        if (this !== target) return original.getItem.call(this, key)
        const data = read()
        const k = String(key)
        return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null
    }

    proto.setItem = function (this: Storage, key: string, value: string): void {
        if (this !== target) return original.setItem.call(this, key, value)
        const data = read()
        data[String(key)] = String(value)
        write(data)
    }

    proto.removeItem = function (this: Storage, key: string): void {
        if (this !== target) return original.removeItem.call(this, key)
        const data = read()
        delete data[String(key)]
        write(data)
    }

    proto.key = function (this: Storage, index: number): string | null {
        if (this !== target) return original.key.call(this, index)
        return Object.keys(read())[index] ?? null
    }

    // Clears THIS Kwirth only: the other contexts on the same domain are not its to delete.
    proto.clear = function (this: Storage): void {
        if (this !== target) return original.clear.call(this)
        original.removeItem.call(target, scope)
    }

    if (originalLength?.get) {
        const lengthOf = originalLength.get
        Object.defineProperty(proto, 'length', {
            configurable: true,
            enumerable: originalLength.enumerable,
            get(this: Storage): number {
                return this === target ? Object.keys(read()).length : lengthOf.call(this)
            }
        })
    }
}
