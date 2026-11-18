import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import tar from 'tar'
import { IConfigFieldDef } from '@kwirthmagnify/kwirth-common'
import { LoginManager } from '../../src/tools/LoginManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { fakeConfigStore, fakeSecrets } from './fakeExtensionConfigStore'

/*
    A login's config through the common ExtensionConfigStore (plans/extension-config, S4). Two parts kept
    apart: the PACKAGE's login.json stays in the payload; what the ADMIN edits (its configSchema) goes to a
    Secret. What is served is both: the admin's wins, then the package's, then the schema's defaults.
*/

const SCHEMA: IConfigFieldDef[] = [
    { name: 'autoUser', label: 'User', required: true },
    { name: 'autoPassword', label: 'Password', type: 'password' },
    { name: 'startScope', label: 'Scope', type: 'select', options: ['cluster', 'namespace'], default: 'cluster' },
    { name: 'title', label: 'Title', default: 'from the schema' }
]

// The package's login.json: layout that no schema declares, and a value for a schema field
const LOGIN_JSON = { top: '10%', left: '20%', pageBackground: '#123456', title: 'from login.json' }

const fakeConfigMaps = (): IConfigMaps & { keys: Map<string, unknown> } => {
    const keys = new Map<string, unknown>()
    return {
        keys,
        read: async (name: string, def?: unknown) => keys.has(name) ? keys.get(name) : def,
        write: async (name: string, data: unknown) => { if (data === null) keys.delete(name); else keys.set(name, data) },
        writeKey: async () => {},
        readAllKeys: async () => ({}),
        list: async () => [],
        delete: async (name: string) => { keys.delete(name) },
        storeLimit: () => undefined
    } as unknown as IConfigMaps & { keys: Map<string, unknown> }
}

const loginTgz = async (): Promise<string> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-test-login-config-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: 'cfg', name: '@t/kwirth-login-cfg', version: '1.0.0', description: 'cfg', extensionType: 'login', configSchema: SCHEMA }))
    fs.writeFileSync(path.join(dir, 'login.json'), JSON.stringify(LOGIN_JSON))
    const tgz = path.join(dir, 'cfg.tgz')
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['package.json', 'login.json'])
    return tgz
}

const installed = async () => {
    const configMaps = fakeConfigMaps()
    const secrets = fakeSecrets()
    const manager = new LoginManager(configMaps, fakeConfigStore(secrets))
    await manager.init()
    await manager.install(await loginTgz(), 'test')
    return { manager, configMaps, secrets }
}

test('never configured: the package\'s login.json over the schema defaults', async () => {
    const { manager } = await installed()
    assert.deepEqual(await manager.getConfig('cfg'), { startScope: 'cluster', ...LOGIN_JSON })
})

test('🔴 what the admin saved wins over login.json and the defaults', async () => {
    const { manager } = await installed()
    assert.deepEqual(await manager.saveConfig('cfg', { autoUser: 'guest', title: 'from the admin', startScope: 'namespace' }), [])
    const config = await manager.getConfig('cfg')
    assert.equal(config?.title, 'from the admin')
    assert.equal(config?.autoUser, 'guest')
    assert.equal((config as Record<string, unknown>)['startScope'], 'namespace')
})

test('🔴 a save keeps the page\'s layout: the package\'s fields are not the admin\'s to drop', async () => {
    const { manager, configMaps } = await installed()
    await manager.saveConfig('cfg', { autoUser: 'guest', top: '99%' })
    const config = await manager.getConfig('cfg')
    assert.equal(config?.top, '10%', 'top is not in the schema: dropped from the admin\'s part, the package\'s stays')
    assert.equal(config?.pageBackground, '#123456')
    assert.deepEqual((configMaps.keys.get('kwirth-login-cfg') as { config: unknown }).config, LOGIN_JSON, 'the payload\'s login.json untouched')
})

test('🔴 the admin\'s part is kept in a Secret, whole: saving again replaces it, no merge', async () => {
    const { manager, secrets } = await installed()
    await manager.saveConfig('cfg', { autoUser: 'guest', autoPassword: 's3cr3t' })
    assert.ok(secrets.objects.has('kwirth-login-cfg-config'))
    await manager.saveConfig('cfg', { autoUser: 'other' })
    const config = await manager.getConfig('cfg')
    assert.equal(config?.autoUser, 'other')
    assert.equal(config?.autoPassword, undefined, 'the second save had no password: it is gone, not merged')
})

test('🔴 what does not fit the schema is refused, every field named, and nothing is saved', async () => {
    const { manager, secrets } = await installed()
    const errors = await manager.saveConfig('cfg', { startScope: 'galaxy' })
    assert.deepEqual(errors.map(e => e.field), ['autoUser', 'startScope'])
    assert.equal(secrets.objects.has('kwirth-login-cfg-config'), false)
})

test('the page sees the same config, with its background flags', async () => {
    const { manager } = await installed()
    await manager.saveConfig('cfg', { autoUser: 'guest' })
    const forPage = await manager.getConfigWithMeta('cfg')
    assert.equal(forPage?.autoUser, 'guest')
    assert.equal(forPage?.top, '10%')
    assert.equal(forPage?.hasBackground, false)
})

test('saving the config of a login that is not installed is an error', async () => {
    const { manager } = await installed()
    await assert.rejects(manager.saveConfig('nope', { autoUser: 'x' }), /not found/)
})

test('🔴 uninstalled: the admin\'s config Secret goes with it', async () => {
    const { manager, secrets } = await installed()
    await manager.saveConfig('cfg', { autoUser: 'guest' })
    await manager.uninstall('cfg')
    assert.equal(secrets.objects.has('kwirth-login-cfg-config'), false)
})
