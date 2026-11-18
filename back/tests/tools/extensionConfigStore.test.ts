import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { ExtensionConfigStore, extensionConfigName } from '../../src/tools/ExtensionConfigStore'
import { ISecrets } from '../../src/tools/ISecrets'

/*
    The single store of extension installation configuration (plans/extension-config, S1).
*/

// In-memory Secrets: objects by name, as the three real stores keep them. A missing one reads as the default.
const fakeSecrets = (): ISecrets & { objects: Map<string, Record<string, unknown>> } => {
    const objects = new Map<string, Record<string, unknown>>()
    return {
        objects,
        write: async (name, content) => { objects.set(name, content as Record<string, unknown>) },
        read: async (name, defaultValue) => objects.has(name) ? objects.get(name) : defaultValue,
        writeKey: async () => { throw new Error('not used by the store') },
        readAllKeys: async () => { throw new Error('not used by the store') },
        list: async prefix => [...objects.keys()].filter(n => n.startsWith(prefix)),
        delete: async name => { objects.delete(name) },
        storeLimit: () => undefined
    }
}

test('the name follows kwirth-<type>-<id>-config', () => {
    assert.equal(extensionConfigName(EExtensionType.PROVIDER, 'http-pull-push'), 'kwirth-provider-http-pull-push-config')
    assert.equal(extensionConfigName(EExtensionType.AITOOLSET, 'my-toolset'), 'kwirth-aitoolset-my-toolset-config')
})

test('round trip of a simple and of a multiple shape, credentials included', async () => {
    const store = new ExtensionConfigStore(fakeSecrets())
    const simple = { url: 'https://x', password: 's3cr3t', replicas: 3, enabled: true }
    const multiple = { region: 'eu', configs: [{ name: 'ops', token: 't1' }, { name: 'dev', token: 't2' }] }
    await store.write(EExtensionType.PROVIDER, 'p', simple)
    await store.write(EExtensionType.SENDER, 's', multiple)
    assert.deepEqual(await store.read(EExtensionType.PROVIDER, 'p'), simple)
    assert.deepEqual(await store.read(EExtensionType.SENDER, 's'), multiple)
})

test('it is stored as { data: base64(JSON) }, the shape routers already use', async () => {
    const secrets = fakeSecrets()
    await new ExtensionConfigStore(secrets).write(EExtensionType.ROUTER, 'r', { peer: 'a' })
    const stored = secrets.objects.get('kwirth-router-r-config')
    assert.ok(stored)
    assert.deepEqual(Object.keys(stored), ['data'])
    assert.deepEqual(JSON.parse(Buffer.from(String(stored['data']), 'base64').toString('utf8')), { peer: 'a' })
})

test('a configuration a router saved before the store reads back as it was', async () => {
    const secrets = fakeSecrets()
    secrets.objects.set('kwirth-router-bridge-config', { data: Buffer.from(JSON.stringify({ peer: 'hub' }), 'utf8').toString('base64') })
    assert.deepEqual(await new ExtensionConfigStore(secrets).read(EExtensionType.ROUTER, 'bridge'), { peer: 'hub' })
})

test('nothing stored reads as undefined', async () => {
    assert.equal(await new ExtensionConfigStore(fakeSecrets()).read(EExtensionType.LOGIN, 'none'), undefined)
})

test('an unreadable configuration reads as undefined, it does not throw', async () => {
    const secrets = fakeSecrets()
    secrets.objects.set('kwirth-plugin-a-config', { data: Buffer.from('{not json', 'utf8').toString('base64') })
    secrets.objects.set('kwirth-plugin-b-config', { data: undefined })
    secrets.objects.set('kwirth-plugin-c-config', { other: 'x' })
    const store = new ExtensionConfigStore(secrets)
    for (const id of ['a', 'b', 'c']) assert.equal(await store.read(EExtensionType.PLUGIN, id), undefined, id)
})

test('write replaces whole: no merge with what was there', async () => {
    const store = new ExtensionConfigStore(fakeSecrets())
    await store.write(EExtensionType.WEBHOOK, 'w', { a: 1, b: 2 })
    await store.write(EExtensionType.WEBHOOK, 'w', { a: 3 })
    assert.deepEqual(await store.read(EExtensionType.WEBHOOK, 'w'), { a: 3 })
})

test('a write failure reaches the caller', async () => {
    const secrets = fakeSecrets()
    secrets.write = async () => { throw new Error('forbidden') }
    await assert.rejects(new ExtensionConfigStore(secrets).write(EExtensionType.IDP, 'github', {}), /forbidden/)
})

test('delete removes it, and deleting what is not there is not an error', async () => {
    const store = new ExtensionConfigStore(fakeSecrets())
    await store.write(EExtensionType.AITOOLSET, 't', { x: 1 })
    await store.delete(EExtensionType.AITOOLSET, 't')
    assert.equal(await store.read(EExtensionType.AITOOLSET, 't'), undefined)
    await store.delete(EExtensionType.AITOOLSET, 't')
})

test('list gives the ids of one type only, and ignores other Secrets with a similar name', async () => {
    const secrets = fakeSecrets()
    const store = new ExtensionConfigStore(secrets)
    await store.write(EExtensionType.IDP, 'github', {})
    await store.write(EExtensionType.IDP, 'entra-id', {})
    await store.write(EExtensionType.PROVIDER, 'github', {})
    secrets.objects.set('kwirth-idps', {})
    secrets.objects.set('kwirth-idp-config', {})
    secrets.objects.set('kwirth-idp-x-other', {})
    assert.deepEqual((await store.list(EExtensionType.IDP)).sort(), ['entra-id', 'github'])
    assert.deepEqual(await store.list(EExtensionType.ROUTER), [])
})
