import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'net'
import { accessKeySerialize } from '@kwirthmagnify/kwirth-common'
import { ApiKeyApi } from '../../src/api/ApiKeyApi'
import { CHANNEL_STORE_PREFIX, ChannelStorageApi } from '../../src/api/ChannelStorageApi'
import { NodeConfigMaps } from '../../src/tools/NodeConfigMaps'
import { NodeSecrets } from '../../src/tools/NodeSecrets'

/*
    /core/storage/channel: the keys of the channels' own storage, and deleting one — admin only. Against
    the REAL file storages (NodeConfigMaps, NodeSecrets) in a folder of its own, so their list and delete
    are what is tested, not a mock of them.
*/

const adminKey = { id: 'adminkey', type: 'permanent', resources: 'admin,cluster::::' }
const nonAdminKey = { id: 'userkey', type: 'permanent', resources: 'cluster::::' }
const AUTH = { Authorization: 'Bearer ' + accessKeySerialize(adminKey as any) }
const NONADMIN_AUTH = { Authorization: 'Bearer ' + accessKeySerialize(nonAdminKey as any) }

const dirs: string[] = []
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }) })

async function startServer() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-channel-storage-'))
    dirs.push(dir)
    const configMaps = new NodeConfigMaps(dir)
    const secrets = new NodeSecrets(dir, 'masterx')
    await configMaps.write('kwirth.keys', [
        { accessKey: adminKey, description: 'admin', expire: Date.now() + 3600_000, days: 1 },
        { accessKey: nonAdminKey, description: 'cluster-only', expire: Date.now() + 3600_000, days: 1 }
    ])
    const apiKeyApi = await ApiKeyApi.create(configMaps, 'masterx', true)
    const app = express()
    app.use('/core/storage/channel', new ChannelStorageApi(configMaps, secrets, apiKeyApi!).router)
    const server = app.listen(0)
    await new Promise<void>(r => server.once('listening', () => r()))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/core/storage/channel`
    return { base, configMaps, secrets, stop: () => new Promise<void>(r => server.close(() => r())) }
}

test('GET: the keys of every channel storage, ConfigMap or Secret, each once and sorted; nothing else of the store', async () => {
    const s = await startServer()
    try {
        await s.configMaps.write(CHANNEL_STORE_PREFIX + 'proxy-config', { a: 1 })
        await s.configMaps.write(CHANNEL_STORE_PREFIX + 'eol', { b: 2 })
        await s.secrets.write(CHANNEL_STORE_PREFIX + 'proxy-config', { data: 'x' })
        await s.secrets.write(CHANNEL_STORE_PREFIX + 'chat-tokens', { data: 'y' })
        await s.configMaps.write('kwirth-store-common-llms', [])
        await s.configMaps.write('kwirth-store-provider-aws', {})

        const res = await fetch(s.base, { headers: AUTH })
        assert.equal(res.status, 200)
        assert.deepEqual(await res.json(), ['chat-tokens', 'eol', 'proxy-config'], 'the shared and the providers\' stores are not channels\'')
    }
    finally { await s.stop() }
})

test('🔴 DELETE: removes the ConfigMap AND the Secret of that key, and only those', async () => {
    const s = await startServer()
    try {
        await s.configMaps.write(CHANNEL_STORE_PREFIX + 'proxy-config', { a: 1 })
        await s.secrets.write(CHANNEL_STORE_PREFIX + 'proxy-config', { data: 'x' })
        await s.configMaps.write(CHANNEL_STORE_PREFIX + 'proxy-config-old', { keep: true })

        const res = await fetch(`${s.base}/proxy-config`, { method: 'DELETE', headers: AUTH })
        assert.equal(res.status, 200)
        assert.equal(await s.configMaps.read(CHANNEL_STORE_PREFIX + 'proxy-config'), undefined)
        assert.equal(await s.secrets.read(CHANNEL_STORE_PREFIX + 'proxy-config'), undefined)
        assert.deepEqual(await s.configMaps.read(CHANNEL_STORE_PREFIX + 'proxy-config-old'), { keep: true }, 'a key that only starts the same is another key')
        assert.ok(await s.configMaps.read('kwirth.keys'), 'the core\'s own store is untouched')

        const again = await fetch(`${s.base}/proxy-config`, { method: 'DELETE', headers: AUTH })
        assert.equal(again.status, 200, 'deleting what is not there is not an error')
    }
    finally { await s.stop() }
})

test('🔴 a key that could leave the storage folder is refused, and nothing is deleted', async () => {
    const s = await startServer()
    try {
        for (const bad of ['..', '.hidden', '..%2Fkwirth.keys', 'a%2Fb', 'a b']) {
            const res = await fetch(`${s.base}/${bad}`, { method: 'DELETE', headers: AUTH })
            assert.ok(res.status === 400 || res.status === 404, `${bad} → ${res.status}`)
        }
        assert.ok(await s.configMaps.read('kwirth.keys'), 'still there')
    }
    finally { await s.stop() }
})

test('🔴 admin only: a valid key without admin cannot list or delete; no key at all, neither', async () => {
    const s = await startServer()
    try {
        await s.configMaps.write(CHANNEL_STORE_PREFIX + 'eol', { b: 2 })
        assert.equal((await fetch(s.base, { headers: NONADMIN_AUTH })).status, 403)
        assert.equal((await fetch(`${s.base}/eol`, { method: 'DELETE', headers: NONADMIN_AUTH })).status, 403)
        // without a key, validKey's own answer
        assert.equal((await fetch(s.base)).status, 403)
        assert.equal((await fetch(`${s.base}/eol`, { method: 'DELETE' })).status, 403)
        assert.deepEqual(await s.configMaps.read(CHANNEL_STORE_PREFIX + 'eol'), { b: 2 })
    }
    finally { await s.stop() }
})
