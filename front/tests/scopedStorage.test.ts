import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installScopedStorage } from '../src/tools/ScopedStorage.ts'

/*
    One localStorage per Kwirth (front/src/tools/ScopedStorage.ts). Three Kwirths served from the same domain
    under different paths share the browser's single localStorage; each must see only its own keys, kept
    inside ONE entry named after its root path, while a Kwirth at the root keeps using localStorage as before.

    The browser's Storage is played by FakeStorage: the methods live on its PROTOTYPE, as in the browser, so
    the installation replaces them exactly where it does in the real thing.
*/

class FakeStorage {
    items = new Map<string, string>()
    getItem(key: string): string | null { return this.items.has(key) ? this.items.get(key)! : null }
    setItem(key: string, value: string): void { this.items.set(key, String(value)) }
    removeItem(key: string): void { this.items.delete(key) }
    key(index: number): string | null { return [...this.items.keys()][index] ?? null }
    clear(): void { this.items.clear() }
    get length(): number { return this.items.size }
}

/** A fresh prototype per test: installing replaces its methods, and the tests must not see each other's. */
const freshStorageClass = (): typeof FakeStorage => class extends FakeStorage {}

/** The browser's localStorage after `scope` is installed on it, and another Storage of the same class. */
const setup = (scope: string) => {
    const Cls = freshStorageClass()
    // the methods are on FakeStorage.prototype; the subclass's prototype inherits them and gets the replacements
    const proto = Cls.prototype as unknown as Storage
    const local = new Cls()
    const session = new Cls()
    installScopedStorage(scope, local as unknown as Storage, proto)
    return { local: local as unknown as Storage, raw: local, session: session as unknown as Storage, rawSession: session }
}

test('a Kwirth under a path keeps its keys inside ONE entry named after its path', () => {
    const { local, raw } = setup('/kwirth-a')
    local.setItem('lastTabs.admin', '[1]')
    local.setItem('kwirth.theme', 'dark')
    assert.deepEqual([...raw.items.keys()], ['/kwirth-a'])
    assert.deepEqual(JSON.parse(raw.items.get('/kwirth-a')!), { 'lastTabs.admin': '[1]', 'kwirth.theme': 'dark' })
    assert.equal(local.getItem('lastTabs.admin'), '[1]')
    assert.equal(local.getItem('missing'), null)
})

test('🔴 two Kwirths on the same domain, same user, same keys: neither overwrites the other', () => {
    // the browser's single localStorage, shared by both
    const Cls = freshStorageClass()
    const shared = new Cls()
    const proto = Cls.prototype as unknown as Storage
    // what each Kwirth sees: the same object, installed with its own scope — one install per page, so two
    // installs on two separate prototypes stand for the two tabs
    const ClsB = freshStorageClass()
    const sharedForB = new ClsB()
    sharedForB.items = shared.items
    installScopedStorage('/kwirth-a', shared as unknown as Storage, proto)
    installScopedStorage('/kwirth-b', sharedForB as unknown as Storage, ClsB.prototype as unknown as Storage)
    const a = shared as unknown as Storage
    const b = sharedForB as unknown as Storage

    a.setItem('lastTabs.admin', 'tabs of A')
    b.setItem('lastTabs.admin', 'tabs of B')
    assert.equal(a.getItem('lastTabs.admin'), 'tabs of A')
    assert.equal(b.getItem('lastTabs.admin'), 'tabs of B')
    assert.deepEqual([...shared.items.keys()].sort(), ['/kwirth-a', '/kwirth-b'])

    // clear() empties ONE Kwirth, never the other's
    a.clear()
    assert.equal(a.getItem('lastTabs.admin'), null)
    assert.equal(b.getItem('lastTabs.admin'), 'tabs of B')
})

test('a Kwirth at the root keeps using localStorage directly: existing installations lose nothing', () => {
    const { local, raw } = setup('')
    raw.items.set('lastTabs.admin', 'saved before')
    assert.equal(local.getItem('lastTabs.admin'), 'saved before')
    local.setItem('kwirth.mode', 'dark')
    assert.equal(raw.items.get('kwirth.mode'), 'dark')
})

test('the loose keys of before are not read by a Kwirth under a path, and are left where they are', () => {
    const { local, raw } = setup('/kwirth-a')
    raw.items.set('lastTabs.admin', 'loose, from before')
    assert.equal(local.getItem('lastTabs.admin'), null)
    local.setItem('lastTabs.admin', 'mine')
    assert.equal(raw.items.get('lastTabs.admin'), 'loose, from before')
})

test('removeItem, key and length work inside the context; the last key out leaves no entry behind', () => {
    const { local, raw } = setup('/kwirth-a')
    local.setItem('one', '1')
    local.setItem('two', '2')
    assert.equal(local.length, 2)
    assert.deepEqual([local.key(0), local.key(1), local.key(2)], ['one', 'two', null])
    local.removeItem('one')
    assert.equal(local.length, 1)
    local.removeItem('two')
    assert.equal(local.length, 0)
    assert.equal(raw.items.has('/kwirth-a'), false)
})

test('values are strings, as localStorage makes them', () => {
    const { local } = setup('/kwirth-a')
    local.setItem('n', 42 as unknown as string)
    assert.equal(local.getItem('n'), '42')
})

test('an entry that is not an object of strings reads as empty, and never throws', () => {
    const { local, raw } = setup('/kwirth-a')
    for (const bad of ['not json', '[1,2]', 'null', '"text"', '{"a":1,"b":"ok"}']) {
        raw.items.set('/kwirth-a', bad)
        assert.doesNotThrow(() => local.getItem('a'))
    }
    // the string values of an otherwise odd object are kept
    assert.equal(local.getItem('b'), 'ok')
    assert.equal(local.getItem('a'), null)
})

test('another Storage (sessionStorage) is not touched', () => {
    const { local, session, rawSession } = setup('/kwirth-a')
    session.setItem('k', 'v')
    assert.equal(rawSession.items.get('k'), 'v')
    assert.equal(session.getItem('k'), 'v')
    assert.equal(session.length, 1)
    assert.equal(local.getItem('k'), null)
})
