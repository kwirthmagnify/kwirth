import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { MarketplaceManager } from '../../src/tools/MarketplaceManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'

/*
    Una descarga por manifest, aunque se pidan diez a la vez.

    El arranque del front pide el catalogo de CADA tipo de extension en paralelo —diez peticiones—, y la
    cache por si sola no sirve para eso: se consulta al entrar y se escribe al salir, asi que las diez se
    encuentran la cache vacia y descargan las diez el mismo manifest. Con tres marketplaces eso son
    treinta descargas externas donde bastaban tres.

    No da error ni se nota con un manifest rapido: solo es trabajo de mas, justo en el peor momento del
    arranque. De ahi que se fije con un test y no de vista.
*/

const URL_PRIVADA = 'https://ejemplo/manifest.json'

const MANIFEST = [
    { extensionType: EExtensionType.PLUGIN, id: 'uno', version: '1.0.0', name: 'Uno', url: 'https://ejemplo/uno.tgz' },
    { extensionType: EExtensionType.SENDER, id: 'dos', version: '2.0.0', name: 'Dos', url: 'https://ejemplo/dos.tgz' }
]

/** Ajustes con un unico marketplace, que es lo que lee el manager. */
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
    Sustituye el fetch global y cuenta las descargas POR URL.

    Por url y no en total, porque el manifest PUBLICO tiene una direccion distinta por tipo
    (`plugins/manifest.json`, `senders/manifest.json`...): once descargas suyas son correctas y no hay
    nada que deduplicar. El que se repetia es el PRIVADO, que es una sola url para los once tipos.
*/
const contarDescargas = (): { porUrl: (url: string) => number, total: () => number, restaurar: () => void } => {
    const original = globalThis.fetch
    const n = new Map<string, number>()
    globalThis.fetch = (async (url: string) => {
        n.set(String(url), (n.get(String(url)) ?? 0) + 1)
        // Una descarga real tarda; sin esta espera las diez llamadas se resolverian tan seguidas que el
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
        // Sin deduplicacion serian once: una por cada resolve() en vuelo.
        assert.equal(contador.porUrl(URL_PRIVADA), 1, 'el manifest privado se descargo mas de una vez')
        // Y el publico, uno por tipo, porque cada tipo tiene su propia direccion.
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
        // Enganchar a la promesa de otro no puede salir gratis en correccion: todas tienen que ver lo
        // suyo, filtrado por su tipo.
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
    // El boton de refrescar del gestor existe para traer lo de ahora mismo: si la deduplicacion o la
    // cache lo dejaran sin efecto, el usuario no tendria forma de ver una version recien publicada.
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
