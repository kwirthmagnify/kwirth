import { test } from 'node:test'
import assert from 'node:assert/strict'
import os from 'os'
import fs from 'fs'
import path from 'path'
import tar from 'tar'
import { WebhookManager } from '../../src/tools/WebhookManager'
import { handleInbound } from '../../src/tools/WebhookReceiver'

interface IWebhookEvent { provider: string; kind: string; externalId: string; status?: string; receivedAt: string; raw: unknown }

function makeConfigMaps() {
    const store = new Map<string, unknown>()
    const keyed = new Map<string, Map<string, unknown>>()
    return {
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

// Echo webhook: verify compara Authorization con config.apiKey; parse saca el evento del JSON del body.
function makeEchoTgz(): Buffer {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-echo-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: 'echo', name: 'echo', version: '0.0.1', description: 'echo webhook' }))
    fs.writeFileSync(path.join(dir, 'back.js'), `
        class EchoWebhook {
            constructor() { this.id = 'echo'; this._c = new Map() }
            verify(rawBody, headers, config) { return headers['authorization'] === config.apiKey }
            parse(rawBody, headers) {
                let body = {}
                try { body = JSON.parse(rawBody.toString('utf8') || '{}') } catch (e) { return null }
                if (!body || !body.id) return null
                return { provider: 'echo', kind: body.kind || 'event', externalId: String(body.id), status: body.status, receivedAt: 't', raw: body }
            }
            addConfig(c) { this._c.set(c.name, c) }
            removeConfig(n) { this._c.delete(n) }
            hasConfig(n) { return this._c.has(n) }
            getConfigNames() { return Array.from(this._c.keys()) }
            getConfigSchema() { return [{ name: 'name', label: 'Name', required: true }, { name: 'apiKey', label: 'API key', type: 'password' }] }
        }
        module.exports = { default: EchoWebhook }
    `)
    const tgz = path.join(dir, 'echo.tgz')
    tar.c({ sync: true, file: tgz, cwd: dir, gzip: true }, ['package.json', 'back.js'])
    return fs.readFileSync(tgz)
}

async function setup() {
    const mgr = new WebhookManager(makeConfigMaps(), '/w')
    await mgr.init()
    await mgr.installFromBuffer(makeEchoTgz())
    mgr.addConfig('echo', { name: 'default', apiKey: 'sekret' })
    const token = mgr.getUrl('echo', 'default')!.split('/').pop()!
    const seen: IWebhookEvent[] = []
    mgr.subscribe('echo', { processWebhookEvent: (e) => { seen.push(e as IWebhookEvent) } })
    return { mgr, token, seen }
}

test('valid callback: verify passes, parse yields event, delivered to the target consumer, 200', async () => {
    const { mgr, token, seen } = await setup()
    const r = await handleInbound(mgr, 'echo', token, Buffer.from(JSON.stringify({ id: 'X1', kind: 'issue.updated', status: 'Done' })), { authorization: 'sekret' })
    assert.equal(r.status, 200)
    assert.equal(seen.length, 1)
    assert.equal(seen[0].externalId, 'X1')
    assert.equal(seen[0].status, 'Done')
})

test('bad auth header → 401, no delivery', async () => {
    const { mgr, token, seen } = await setup()
    const r = await handleInbound(mgr, 'echo', token, Buffer.from(JSON.stringify({ id: 'X1' })), { authorization: 'wrong' })
    assert.equal(r.status, 401)
    assert.equal(seen.length, 0)
})

test('unknown token → 404', async () => {
    const { mgr, seen } = await setup()
    const r = await handleInbound(mgr, 'echo', 'does-not-exist', Buffer.from('{}'), { authorization: 'sekret' })
    assert.equal(r.status, 404)
    assert.equal(seen.length, 0)
})

test('provider segment mismatch → 404', async () => {
    const { mgr, token } = await setup()
    const r = await handleInbound(mgr, 'other', token, Buffer.from(JSON.stringify({ id: 'X1' })), { authorization: 'sekret' })
    assert.equal(r.status, 404)
})

test('unparseable body (parse returns null) → 400, no delivery', async () => {
    const { mgr, token, seen } = await setup()
    const r = await handleInbound(mgr, 'echo', token, Buffer.from('not json at all'), { authorization: 'sekret' })
    assert.equal(r.status, 400)
    assert.equal(seen.length, 0)
})

test('no manager (not ready) → 503', async () => {
    const r = await handleInbound(undefined, 'echo', 'whatever', Buffer.from('{}'), {})
    assert.equal(r.status, 503)
})
