import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'os'
import fs from 'fs'
import path from 'path'
import tar from 'tar'
import { WebhookManager } from '../../src/tools/WebhookManager'

// Tipos locales estructurales (evita importar de common-back, que es CJS y rompe el ESM del test).
interface IWebhookEvent { provider: string; kind: string; externalId: string; status?: string; receivedAt: string; headers?: Record<string, string>; raw: unknown }
interface IWebhookConfig { name: string; target: string; [key: string]: unknown }

// ── In-memory IConfigMaps mock ────────────────────────────────────────────────
// write/read = valores completos por nombre; writeKey/readAllKeys = namespaces con claves.
function makeConfigMaps() {
    const store = new Map<string, unknown>()
    const keyed = new Map<string, Map<string, unknown>>()
    return {
        store,
        keyed,
        write: async (name: string, data: unknown) => { store.set(name, data) },
        read: async (name: string, def?: unknown) => (store.has(name) ? store.get(name) : def),
        writeKey: async (name: string, key: string, value: unknown) => {
            if (!keyed.has(name)) keyed.set(name, new Map())
            if (value === null) keyed.get(name)!.delete(key)
            else keyed.get(name)!.set(key, value)
        },
        readAllKeys: async (name: string) => Object.fromEntries(keyed.get(name) ?? new Map()),
    }
}

// Construye un .tgz de un webhook de prueba (package.json + back.js) y devuelve su Buffer.
function makeTestWebhookTgz(id: string): Buffer {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wh-src-${id}-`))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id, name: id, version: '0.0.1', description: 'test webhook' }))
    fs.writeFileSync(path.join(dir, 'back.js'), `
        class TestWebhook {
            constructor() { this.id = ${JSON.stringify(id)}; this._configs = new Map() }
            verify() { return true }
            parse() { return null }
            addConfig(c) { this._configs.set(c.name, c) }
            removeConfig(n) { this._configs.delete(n) }
            hasConfig(n) { return this._configs.has(n) }
            getConfigNames() { return Array.from(this._configs.keys()) }
            getConfigSchema() { return [{ name: 'name', label: 'Name', required: true }, { name: 'apiKey', label: 'API key', type: 'password' }] }
        }
        module.exports = { default: TestWebhook }
    `)
    const tgz = path.join(dir, `${id}.tgz`)
    tar.c({ sync: true, file: tgz, cwd: dir, gzip: true }, ['package.json', 'back.js'])
    return fs.readFileSync(tgz)
}

const cfg = (over: Partial<IWebhookConfig> = {}): IWebhookConfig => ({ name: 'default', target: 'excubitor', apiKey: 'secret', ...over })

// ── Delivery / subscription (no requiere webhook registrado) ──────────────────

test('deliver fans out to subscribers of the target and honors unsubscribe', () => {
    const mgr = new WebhookManager(makeConfigMaps())
    const seenA: IWebhookEvent[] = []
    const seenB: IWebhookEvent[] = []
    const a = { processWebhookEvent: (e: IWebhookEvent) => { seenA.push(e) } }
    const b = { processWebhookEvent: (e: IWebhookEvent) => { seenB.push(e) } }
    const ev: IWebhookEvent = { provider: 'jira', kind: 'issue.updated', externalId: 'SEC-1', receivedAt: 't', raw: {} }

    mgr.subscribe('excubitor', a)
    mgr.subscribe('excubitor', b)
    mgr.deliver('excubitor', ev)
    assert.equal(seenA.length, 1)
    assert.equal(seenB.length, 1)
    assert.equal(seenA[0].externalId, 'SEC-1')

    mgr.unsubscribe('excubitor', a)
    mgr.deliver('excubitor', ev)
    assert.equal(seenA.length, 1)   // ya no recibe
    assert.equal(seenB.length, 2)
})

test('deliver to a target with no subscribers is a no-op (no throw)', () => {
    const mgr = new WebhookManager(makeConfigMaps())
    assert.doesNotThrow(() => mgr.deliver('nobody', { provider: 'x', kind: 'k', externalId: 'i', receivedAt: 't', raw: {} }))
})

test('a throwing consumer does not break the others', () => {
    const mgr = new WebhookManager(makeConfigMaps())
    const good: IWebhookEvent[] = []
    mgr.subscribe('t', { processWebhookEvent: () => { throw new Error('boom') } })
    mgr.subscribe('t', { processWebhookEvent: (e) => { good.push(e) } })
    mgr.deliver('t', { provider: 'x', kind: 'k', externalId: 'i', receivedAt: 't', raw: {} })
    assert.equal(good.length, 1)
})

test('resolve/getUrl on unknown token/config return undefined', () => {
    const mgr = new WebhookManager(makeConfigMaps())
    assert.equal(mgr.resolve('nope'), undefined)
    assert.equal(mgr.getUrl('jira', 'default'), undefined)
})

// ── Token routing + CRUD (requiere webhook registrado vía install) ────────────

test('addConfig mints a routable token; getUrl and resolve are consistent', async () => {
    const cm = makeConfigMaps()
    const mgr = new WebhookManager(cm, '/kwirth/webhook')
    await mgr.init()
    await mgr.installFromBuffer(makeTestWebhookTgz('jira'))

    assert.equal(mgr.addConfig('jira', cfg({ name: 'prod' })), true)

    const url = mgr.getUrl('jira', 'prod')
    assert.ok(url, 'getUrl should return a URL')
    assert.match(url!, /^\/kwirth\/webhook\/jira\/[A-Za-z0-9_-]{10,}$/)

    const token = url!.split('/').pop()!
    const res = mgr.resolve(token)
    assert.ok(res, 'token should resolve')
    assert.equal(res!.webhookId, 'jira')
    assert.equal(res!.configName, 'prod')
    assert.equal(res!.target, 'excubitor')
    assert.equal(res!.config.apiKey, 'secret')
})

test('removeConfig evicts the token; rotateToken invalidates the old one', async () => {
    const cm = makeConfigMaps()
    const mgr = new WebhookManager(cm, '/w')
    await mgr.init()
    await mgr.installFromBuffer(makeTestWebhookTgz('jira'))
    mgr.addConfig('jira', cfg())

    const token1 = mgr.getUrl('jira', 'default')!.split('/').pop()!
    assert.ok(mgr.resolve(token1))

    // rotate → nuevo token, el viejo deja de resolver
    const token2 = mgr.rotateToken('jira', 'default')
    assert.notEqual(token1, token2)
    assert.equal(mgr.resolve(token1), undefined)
    assert.ok(mgr.resolve(token2))

    // remove → ambos fuera
    mgr.removeConfig('jira', 'default')
    assert.equal(mgr.resolve(token2), undefined)
    assert.equal(mgr.getUrl('jira', 'default'), undefined)
})

test('two configs get distinct tokens routing to their own config', async () => {
    const cm = makeConfigMaps()
    const mgr = new WebhookManager(cm, '/w')
    await mgr.init()
    await mgr.installFromBuffer(makeTestWebhookTgz('jira'))
    mgr.addConfig('jira', cfg({ name: 'a', apiKey: 'ka' }))
    mgr.addConfig('jira', cfg({ name: 'b', apiKey: 'kb' }))

    const tokenA = mgr.getUrl('jira', 'a')!.split('/').pop()!
    const tokenB = mgr.getUrl('jira', 'b')!.split('/').pop()!
    assert.notEqual(tokenA, tokenB)
    assert.equal(mgr.resolve(tokenA)!.config.apiKey, 'ka')
    assert.equal(mgr.resolve(tokenB)!.config.apiKey, 'kb')
})

test('tokens + configs survive a restart (persistence)', async () => {
    const cm = makeConfigMaps()
    const mgr1 = new WebhookManager(cm, '/w')
    await mgr1.init()
    await mgr1.installFromBuffer(makeTestWebhookTgz('jira'))
    mgr1.addConfig('jira', cfg({ name: 'prod' }))
    const token = mgr1.getUrl('jira', 'prod')!.split('/').pop()!

    // Nuevo manager compartiendo el mismo almacén (simula reinicio del core).
    const mgr2 = new WebhookManager(cm, '/w')
    await mgr2.init()
    await mgr2.loadAll()                 // recarga el back del webhook desde el store
    await mgr2.loadPersistedConfigs()    // restaura tokens + configs

    const res = mgr2.resolve(token)
    assert.ok(res, 'the same token must still resolve after restart')
    assert.equal(res!.configName, 'prod')
    assert.equal(mgr2.getUrl('jira', 'prod'), `/w/jira/${token}`)
})
