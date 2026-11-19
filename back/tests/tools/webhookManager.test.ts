import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'os'
import fs from 'fs'
import path from 'path'
import tar from 'tar'
import { WebhookManager } from '../../src/tools/WebhookManager'
import { fakeConfigStore, fakeSecrets, IFakeSecrets } from './fakeExtensionConfigStore'
import { ISecrets } from '../../src/tools/ISecrets'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'

// Local structural types (it avoids importing from common-back, which is CJS and breaks the test's ESM).
interface IWebhookEvent { provider: string; configName: string; kind: string; externalId: string; status?: string; receivedAt: string; headers?: Record<string, string>; raw: unknown }
interface IWebhookConfig { name: string; [key: string]: unknown }

// ── In-memory IConfigMaps mock ────────────────────────────────────────────────
// write/read = complete values by name; writeKey/readAllKeys = namespaces with keys.
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

// Builds a .tgz of a test webhook (package.json + back.js) and returns its Buffer.
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
            getConfigSchema() { return [{ name: 'name', label: 'Name', required: true }, { name: 'apiKey', label: 'API key', type: 'password' }, { name: 'region', label: 'Region', type: 'select', options: ['eu', 'us'], common: true }] }
        }
        module.exports = { default: TestWebhook }
    `)
    const tgz = path.join(dir, `${id}.tgz`)
    tar.c({ sync: true, file: tgz, cwd: dir, gzip: true }, ['package.json', 'back.js'])
    return fs.readFileSync(tgz)
}

const cfg = (over: Partial<IWebhookConfig> = {}): IWebhookConfig => ({ name: 'default', apiKey: 'secret', ...over })

// A manager over in-memory ConfigMaps and Secrets; pass the same `secrets` to two of them to simulate a restart.
const newManager = (secrets: ISecrets = fakeSecrets(), cm = makeConfigMaps(), urlBase = '/w') => new WebhookManager(cm, fakeConfigStore(secrets), urlBase)

const installed = async (secrets: ISecrets = fakeSecrets(), cm = makeConfigMaps(), id = 'jira'): Promise<WebhookManager> => {
    const mgr = newManager(secrets, cm)
    await mgr.init()
    await mgr.installFromBuffer(makeTestWebhookTgz(id))
    return mgr
}

// What the webhook's Secret holds, decoded
const stored = (secrets: IFakeSecrets, id = 'jira'): Record<string, unknown> | undefined => {
    const obj = secrets.objects.get(`kwirth-webhook-${id}-config`)
    return obj ? JSON.parse(Buffer.from(String(obj.data), 'base64').toString('utf8')) : undefined
}

// ── Delivery / subscription (no requiere webhook registrado) ──────────────────

test('deliver fans out to subscribers of the (webhook, config) pair and honors unsubscribe', () => {
    const mgr = newManager()
    const seenA: IWebhookEvent[] = []
    const seenB: IWebhookEvent[] = []
    const a ={ processWebhookEvent: (e: IWebhookEvent) => { seenA.push(e) } }
    const b = { processWebhookEvent: (e: IWebhookEvent) => { seenB.push(e) } }
    const ev: IWebhookEvent = { provider: 'jira', configName: 'wh1', kind: 'issue.updated', externalId: 'SEC-1', receivedAt: 't', raw: {} }

    mgr.subscribe('excubitor', 'wh1', a)
    mgr.subscribe('excubitor', 'wh1', b)
    mgr.deliver('excubitor', 'wh1', ev)
    assert.equal(seenA.length, 1)
    assert.equal(seenB.length, 1)
    assert.equal(seenA[0].externalId, 'SEC-1')

    mgr.unsubscribe('excubitor', 'wh1', a)
    mgr.deliver('excubitor', 'wh1', ev)
    assert.equal(seenA.length, 1)   // ya no recibe
    assert.equal(seenB.length, 2)
})

test('delivery is scoped to the exact config: another config of the same webhook is not notified', () => {
    const mgr = newManager()
    const seenA: IWebhookEvent[] = []
    const seenB: IWebhookEvent[] = []
    mgr.subscribe('jira', 'wh1', { processWebhookEvent: (e: IWebhookEvent) => { seenA.push(e) } })
    mgr.subscribe('jira', 'wh2', { processWebhookEvent: (e: IWebhookEvent) => { seenB.push(e) } })

    mgr.deliver('jira', 'wh1', { provider: 'jira', configName: 'wh1', kind: 'k', externalId: 'A-1', receivedAt: 't', raw: {} })
    assert.equal(seenA.length, 1, 'wh1 subscriber receives its config event')
    assert.equal(seenB.length, 0, 'wh2 subscriber must NOT receive wh1 events')
    assert.equal(seenA[0].configName, 'wh1')

    mgr.deliver('jira', 'wh2', { provider: 'jira', configName: 'wh2', kind: 'k', externalId: 'B-1', receivedAt: 't', raw: {} })
    assert.equal(seenA.length, 1)
    assert.equal(seenB.length, 1)
})

test('deliver to a (webhook, config) with no subscribers is a no-op (no throw)', () => {
    const mgr = newManager()
    assert.doesNotThrow(() => mgr.deliver('nobody', 'none', { provider: 'x', configName: 'none', kind: 'k', externalId: 'i', receivedAt: 't', raw: {} }))
})

test('a throwing consumer does not break the others', () => {
    const mgr = newManager()
    const good: IWebhookEvent[] = []
    mgr.subscribe('t', 'c', { processWebhookEvent: () => { throw new Error('boom') } })
    mgr.subscribe('t', 'c', { processWebhookEvent: (e) => { good.push(e) } })
    mgr.deliver('t', 'c', { provider: 'x', configName: 'c', kind: 'k', externalId: 'i', receivedAt: 't', raw: {} })
    assert.equal(good.length, 1)
})

test('resolve/getUrl on unknown token/config return undefined', () => {
    const mgr = newManager()
    assert.equal(mgr.resolve('nope'), undefined)
    assert.equal(mgr.getUrl('jira', 'default'), undefined)
})

// ── Token routing + CRUD (requiere webhook registrado vía install) ────────────

test('saveConfig mints a routable token; getUrl and resolve are consistent', async () => {
    const mgr = newManager(fakeSecrets(), makeConfigMaps(), '/kwirth/webhook')
    await mgr.init()
    await mgr.installFromBuffer(makeTestWebhookTgz('jira'))

    assert.deepEqual(await mgr.saveConfig('jira', cfg({ name: 'prod' })), [])

    const url = mgr.getUrl('jira', 'prod')
    assert.ok(url, 'getUrl should return a URL')
    assert.match(url!, /^\/kwirth\/webhook\/jira\/[A-Za-z0-9_-]{10,}$/)

    const token = url!.split('/').pop()!
    const res = mgr.resolve(token)
    assert.ok(res, 'token should resolve')
    assert.equal(res!.webhookId, 'jira')
    assert.equal(res!.configName, 'prod')
    assert.equal(res!.config.apiKey, 'secret')
})

test('removeConfig evicts the token; rotateToken invalidates the old one', async () => {
    const mgr = await installed()
    await mgr.saveConfig('jira', cfg())

    const token1 = mgr.getUrl('jira', 'default')!.split('/').pop()!
    assert.ok(mgr.resolve(token1))

    // rotate → a new token, the old one stops resolving
    const token2 = await mgr.rotateTokenAndSave('jira', 'default')
    assert.notEqual(token1, token2)
    assert.equal(mgr.resolve(token1), undefined)
    assert.ok(mgr.resolve(token2))

    // remove → both gone
    await mgr.removeConfig('jira', 'default')
    assert.equal(mgr.resolve(token2), undefined)
    assert.equal(mgr.getUrl('jira', 'default'), undefined)
})

test('two configs get distinct tokens routing to their own config', async () => {
    const mgr = await installed()
    await mgr.saveConfig('jira', cfg({ name: 'a', apiKey: 'ka' }))
    await mgr.saveConfig('jira', cfg({ name: 'b', apiKey: 'kb' }))

    const tokenA = mgr.getUrl('jira', 'a')!.split('/').pop()!
    const tokenB = mgr.getUrl('jira', 'b')!.split('/').pop()!
    assert.notEqual(tokenA, tokenB)
    assert.equal(mgr.resolve(tokenA)!.config.apiKey, 'ka')
    assert.equal(mgr.resolve(tokenB)!.config.apiKey, 'kb')
})

test('tokens + configs survive a restart (persistence)', async () => {
    const cm = makeConfigMaps()
    const secrets = fakeSecrets()
    const mgr1 = await installed(secrets, cm)
    await mgr1.saveConfig('jira', cfg({ name: 'prod' }))
    const token = mgr1.getUrl('jira', 'prod')!.split('/').pop()!

    // A new manager sharing the same stores (it simulates a core restart).
    const mgr2 = newManager(secrets, cm)
    await mgr2.init()
    await mgr2.loadAll()                 // recarga el back del webhook desde el store
    await mgr2.loadPersistedConfigs()    // restaura tokens + configs

    const res = mgr2.resolve(token)
    assert.ok(res, 'the same token must still resolve after restart')
    assert.equal(res!.configName, 'prod')
    assert.equal(mgr2.getUrl('jira', 'prod'), `/w/jira/${token}`)

    // listWebhooks must reflect what is installed + its configs WITHOUT prior instantiation (the empty
    // selector bug: after a restart, if no callback arrived the instance does not exist, but the selector
    // must still see jira/prod).
    const listed = mgr2.listWebhooks()
    const jira = listed.find(w => w.id === 'jira')
    assert.ok(jira, 'listWebhooks must include the installed webhook even before any delivery/instantiation')
    assert.deepEqual(jira!.configNames, ['prod'])
})

/*
    Two installs that start in the SAME millisecond must not share their temp files. They did: the upload tgz
    and the extraction dir were named with Date.now() only, so the second one overwrote the first one's tgz and
    the first to finish deleted the dir the other was still reading ('Invalid webhook bundle: missing
    package.json or back.js'). It made webhookReceiver.test fail now and then, as node --test runs the files in
    parallel and several of them install a webhook at startup. Date.now() is frozen here so the same
    millisecond is certain, not luck.
*/
test('two installs in the same millisecond do not share their temp files', async () => {
    const realNow = Date.now
    Date.now = () => 1_700_000_000_000
    try {
        const a = newManager()
        const b = newManager()
        await a.init()
        await b.init()
        const [metaA, metaB] = await Promise.all([
            a.installFromBuffer(makeTestWebhookTgz('same-ms-a')),
            b.installFromBuffer(makeTestWebhookTgz('same-ms-b')),
        ])
        // each one installed ITS package, not the other's
        assert.equal(metaA.id, 'same-ms-a')
        assert.equal(metaB.id, 'same-ms-b')
    }
    finally {
        Date.now = realNow
    }
})

// ── The configuration in the common extension config store (plans/extension-config, S6) ──────────────

test('🔴 one Secret per webhook holds its common base AND its configs, the secret REAL; no shared ConfigMap', async () => {
    const secrets = fakeSecrets()
    const cm = makeConfigMaps()
    const mgr = await installed(secrets, cm)
    assert.deepEqual(await mgr.setWebhookStoredConfig('jira', { region: 'eu', configs: [] }), [])
    await mgr.saveConfig('jira', cfg({ name: 'prod', apiKey: 'k-real' }))
    assert.deepEqual(stored(secrets), { region: 'eu', configs: [{ name: 'prod', apiKey: 'k-real' }] })
    assert.equal(cm.keyed.has('kwirth-webhook-configs'), false, 'the old shared ConfigMap is not written any more')
})

test('🔴 the common fields survive a restart, and the artifact and verify() get them under each config', async () => {
    const secrets = fakeSecrets()
    const cm = makeConfigMaps()
    const mgr1 = await installed(secrets, cm)
    await mgr1.saveConfig('jira', cfg({ name: 'prod' }))
    await mgr1.setWebhookStoredConfig('jira', { region: 'us', configs: mgr1.getConfigs('jira') })

    const mgr2 = newManager(secrets, cm)
    await mgr2.init()
    await mgr2.loadAll()
    await mgr2.loadPersistedConfigs()
    assert.equal(mgr2.getWebhookStoredConfig('jira').region, 'us', 'the base came back from the Secret')
    const token = mgr2.getUrl('jira', 'prod')!.split('/').pop()!
    assert.equal(mgr2.resolve(token)!.config.region, 'us', 'verify() reads the common field from the resolved config')
})

test('saving refuses what does not fit the schema, field by field, and stores nothing', async () => {
    const secrets = fakeSecrets()
    const mgr = await installed(secrets)
    const sinNombre = await mgr.saveConfig('jira', cfg({ name: '' }))
    assert.deepEqual(sinNombre.map(e => e.field), ['name'])
    const regionMala = await mgr.setWebhookStoredConfig('jira', { region: 'mars', configs: [] })
    assert.deepEqual(regionMala.map(e => e.field), ['region'])
    assert.equal(stored(secrets), undefined, 'nothing was written')
})

test('what the schema does not declare is dropped; the name and the description are the core\'s, and stay', async () => {
    const secrets = fakeSecrets()
    const mgr = await installed(secrets)
    await mgr.saveConfig('jira', { name: 'prod', description: 'production', apiKey: 'k', leftover: 'x', region: 'eu' })
    assert.deepEqual(stored(secrets)?.configs, [{ name: 'prod', description: 'production', apiKey: 'k' }],
        'leftover is undeclared, and region is a COMMON field: it does not belong to a config')
})

test('🔴 saving the base keeps the token of every config that stays; only the one that leaves loses it', async () => {
    const mgr = await installed()
    await mgr.saveConfig('jira', cfg({ name: 'a' }))
    await mgr.saveConfig('jira', cfg({ name: 'b' }))
    const urlA = mgr.getUrl('jira', 'a')
    const urlB = mgr.getUrl('jira', 'b')
    await mgr.setWebhookStoredConfig('jira', { region: 'eu', configs: [cfg({ name: 'a' })] })
    assert.equal(mgr.getUrl('jira', 'a'), urlA, 'the URL pasted at the provider still works')
    assert.equal(mgr.resolve(urlB!.split('/').pop()!), undefined, "b's token went with b")
})

test('🔴 a write that fails is THROWN and nothing changes in memory (it used to be a log line and an OK)', async () => {
    const secrets = fakeSecrets()
    const mgr = await installed(secrets)
    secrets.write = async () => { throw new Error('etcd down') }
    await assert.rejects(mgr.saveConfig('jira', cfg({ name: 'prod' })), /etcd down/)
    assert.deepEqual(mgr.getConfigs('jira'), [])
    assert.equal(mgr.getUrl('jira', 'prod'), undefined)
})

test('🔴 uninstalled without deleteConfig: the config and its token are KEPT, and a reinstall serves the same URL', async () => {
    const secrets = fakeSecrets()
    const cm = makeConfigMaps()
    const mgr = await installed(secrets, cm)
    await mgr.saveConfig('jira', cfg({ name: 'prod' }))
    const url = mgr.getUrl('jira', 'prod')!
    await mgr.uninstall('jira')
    assert.ok(stored(secrets), 'the Secret is kept')
    assert.equal(mgr.resolve(url.split('/').pop()!), undefined, 'meanwhile the token points at nothing')

    await mgr.installFromBuffer(makeTestWebhookTgz('jira'))
    assert.equal(mgr.getUrl('jira', 'prod'), url, 'same URL: nothing to paste again at the provider')
    assert.ok(mgr.resolve(url.split('/').pop()!))
})

test('🔴 uninstalled with deleteConfig: the Secret and its tokens go', async () => {
    const secrets = fakeSecrets()
    const cm = makeConfigMaps()
    const mgr = await installed(secrets, cm)
    await mgr.saveConfig('jira', cfg({ name: 'prod' }))
    await mgr.uninstall('jira', true)
    assert.equal(stored(secrets), undefined)
    assert.deepEqual(cm.store.get('kwirth-webhook-tokens'), {}, 'no token of jira is left stored')
})

test('a kept config of a webhook that is not installed is left alone at startup', async () => {
    const secrets = fakeSecrets()
    await fakeConfigStore(secrets).write(EExtensionType.WEBHOOK, 'gone', { configs: [{ name: 'x' }] })
    const mgr = newManager(secrets)
    await mgr.init()
    await mgr.loadPersistedConfigs()
    assert.deepEqual(mgr.listWebhooks().map(w => w.id), [])
    assert.ok(secrets.objects.has('kwirth-webhook-gone-config'), 'kept, not deleted')
})
