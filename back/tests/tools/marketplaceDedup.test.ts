import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { MarketplaceManager } from '../../src/tools/MarketplaceManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'

/*
    One download per manifest, even when ten are asked for at once.

    The front end's startup asks for EVERY extension type's catalogue in parallel —ten requests— and the
    cache on its own is no use for that: it is consulted on the way in and written on the way out, so all
    ten find the cache empty and all ten download the same manifest. With three marketplaces that is
    thirty external downloads where three were enough.

    It gives no error and goes unnoticed with a fast manifest: it is just extra work, at the worst possible
    moment of the startup. Hence it is pinned down with a test and not by eye.
*/

const URL_PRIVADA = 'https://ejemplo/manifest.json'

const MANIFEST = [
    { extensionType: EExtensionType.PLUGIN, id: 'uno', version: '1.0.0', name: 'Uno', url: 'https://ejemplo/uno.tgz' },
    { extensionType: EExtensionType.SENDER, id: 'dos', version: '2.0.0', name: 'Dos', url: 'https://ejemplo/dos.tgz' }
]

/** Settings with a single marketplace, which is what the manager reads. */
const configMapsFalso = (): IConfigMaps => ({
    read: async () => ({ marketplaces: [{ id: 'm1', label: 'M1', url: URL_PRIVADA, enabled: true }] }),
    write: async () => ({}),
    writeKey: async () => {},
    readAllKeys: async () => ({}),
    storeLimit: () => undefined
})

const secretsFalsos = (): ISecrets => ({
    read: async () => null,
    write: async () => ({}),
    writeKey: async () => {},
    readAllKeys: async () => ({}),
    storeLimit: () => undefined
})

/*
    Replaces the global fetch and counts the downloads PER URL.

    Per url and not in total, because the PUBLIC manifest has a different address per type
    (`plugins/manifest.json`, `senders/manifest.json`...): eleven downloads of it are correct and there is
    nothing to deduplicate. The one that was being repeated is the PRIVATE one, which is a single url for
    all eleven types.
*/
const contarDescargas = (): { porUrl: (url: string) => number, total: () => number, restaurar: () => void } => {
    const original = globalThis.fetch
    const n = new Map<string, number>()
    globalThis.fetch = (async (url: string) => {
        n.set(String(url), (n.get(String(url)) ?? 0) + 1)
        // A real download takes time; without this wait the ten calls would resolve so close together that the
        // test pasaria aunque no hubiera deduplicacion.
        await new Promise(r => setTimeout(r, 30))
        return {
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => MANIFEST
        }
    }) as unknown as typeof fetch
    return {
        porUrl: (url: string) => n.get(url) ?? 0,
        total: () => [...n.values()].reduce((a, b) => a + b, 0),
        restaurar: () => { globalThis.fetch = original }
    }
}

test('diez peticiones a la vez descargan el manifest UNA sola vez', async () => {
    const manager = new MarketplaceManager(configMapsFalso(), secretsFalsos())
    const contador = contarDescargas()
    try {
        const tipos = Object.values(EExtensionType)
        await Promise.all(tipos.map(t => manager.resolve(t)))
        // Without deduplication there would be eleven: one per resolve() in flight.
        assert.equal(contador.porUrl(URL_PRIVADA), 1, 'el manifest privado se descargo mas de una vez')
        // And the public one, one per type, because each type has its own address.
        assert.equal(contador.total(), tipos.length + 1)
    }
    finally {
        contador.restaurar()
    }
})

test('y las diez reciben el contenido, no solo la primera', async () => {
    const manager = new MarketplaceManager(configMapsFalso(), secretsFalsos())
    const contador = contarDescargas()
    try {
        // Hooking onto somebody else's promise must not come free in correctness: they all have to see
        // their own, filtered by their type.
        const [plugins, senders] = await Promise.all([
            manager.resolve(EExtensionType.PLUGIN),
            manager.resolve(EExtensionType.SENDER)
        ])
        assert.equal(plugins.length, 1)
        assert.equal(plugins[0].id, 'uno')
        assert.equal(senders.length, 1)
        assert.equal(senders[0].id, 'dos')
    }
    finally {
        contador.restaurar()
    }
})

test('tras invalidar la cache se vuelve a descargar', async () => {
    // The manager's refresh button exists to fetch what is there right now: were deduplication or the
    // cache to render it ineffective, the user would have no way of seeing a freshly published version.
    const manager = new MarketplaceManager(configMapsFalso(), secretsFalsos())
    const contador = contarDescargas()
    try {
        await manager.resolve(EExtensionType.PLUGIN)
        assert.equal(contador.porUrl(URL_PRIVADA), 1)

        await manager.resolve(EExtensionType.PLUGIN)
        assert.equal(contador.porUrl(URL_PRIVADA), 1, 'la segunda sale de la cache')

        manager.invalidateCache()
        await manager.resolve(EExtensionType.PLUGIN)
        assert.equal(contador.porUrl(URL_PRIVADA), 2, 'tras invalidar hay que bajarlo otra vez')
    }
    finally {
        contador.restaurar()
    }
})
