import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { MarketplaceManager } from '../../src/tools/MarketplaceManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'

/*
    A manifest that cannot be read logs WHY, not a bare "fetch failed".

    Node's fetch rejects with `TypeError: fetch failed` whatever went wrong — DNS, a refused connection, a
    certificate, a timeout — and puts the real reason in `err.cause`. Logging only the error left an admin
    with a URL that opened fine in a browser and in curl, and nothing to go on.
*/

const URL_PRIVADA = 'https://ejemplo/manifest.json'

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

// fetch rejects with the given error; console.error is captured. Returns the error lines logged for the private URL.
const failingFetch = async (err: unknown): Promise<string[]> => {
    const originalFetch = globalThis.fetch
    const originalError = console.error
    const lines: string[] = []
    globalThis.fetch = (async () => { throw err }) as unknown as typeof fetch
    console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
    try {
        await new MarketplaceManager(configMapsFalso(), secretsFalsos()).resolve(EExtensionType.PLUGIN)
    }
    finally {
        globalThis.fetch = originalFetch
        console.error = originalError
    }
    return lines.filter(l => l.includes(URL_PRIVADA))
}

// what Node's fetch throws: the TypeError, with the system error as a plain `cause` property
const fetchFailed = (cause?: unknown): Error => Object.assign(new TypeError('fetch failed'), cause === undefined ? {} : { cause })

test('el log dice la causa real: codigo y mensaje', async () => {
    const lines = await failingFetch(fetchFailed({ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND ejemplo' }))
    assert.equal(lines.length, 1)
    assert.ok(lines[0].includes('fetch failed (cause: ENOTFOUND — getaddrinfo ENOTFOUND ejemplo)'), lines[0])
})

test('una causa con solo codigo o solo mensaje se dice igual', async () => {
    const soloCodigo = await failingFetch(fetchFailed({ code: 'UND_ERR_CONNECT_TIMEOUT' }))
    assert.ok(soloCodigo[0].includes('(cause: UND_ERR_CONNECT_TIMEOUT)'), soloCodigo[0])
    const soloMensaje = await failingFetch(fetchFailed({ message: 'unable to verify the first certificate' }))
    assert.ok(soloMensaje[0].includes('(cause: unable to verify the first certificate)'), soloMensaje[0])
})

test('sin causa, o una causa que no es un objeto, no se inventa nada', async () => {
    for (const err of [fetchFailed(), fetchFailed('a string'), fetchFailed({ code: 42 }), 'not even an Error']) {
        const lines = await failingFetch(err)
        assert.equal(lines.length, 1)
        assert.ok(!lines[0].includes('(cause:'), lines[0])
    }
})
