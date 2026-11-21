import { test } from 'node:test'
import assert from 'node:assert/strict'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import { invokeToolRef, IToolContext } from '@kwirthmagnify/kwirth-common-ai/back'
import { AiToolsetManager } from '../../src/tools/AiToolsetManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { fakeConfigStore, fakeSecrets, IFakeSecrets } from './fakeExtensionConfigStore'

/*
    A toolset's SETTINGS (plans/extension-config, S8): declared by its configSchema, saved in ONE Secret
    (kwirth-aitoolset-<id>-config), validated, handed to its tools as `host.config` from the NEXT
    invocation with no restart, and kept on uninstall unless asked (P5) — with its grants.
*/

const memConfigMaps = (): IConfigMaps => {
    const store = new Map<string, unknown>()
    return {
        read: async (name: string, def?: unknown) => store.has(name) ? store.get(name) : def,
        write: async (name: string, data: unknown) => { if (data === null) store.delete(name); else store.set(name, data); return {} },
        writeKey: async () => {},
        readAllKeys: async () => ({})
    } as unknown as IConfigMaps
}

// A toolset whose one tool answers with the settings it received
const toolsetTgz = async (id: string, withSchema = true): Promise<string> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kwirth-test-tscfg-${id}-`))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id, name: `@test/${id}`, version: '0.0.1', description: 'test', extensionType: 'aitoolset' }))
    const schema = withSchema ? `configSchema: [
        { name: 'namespace', label: 'Namespace', required: true, default: 'default' },
        { name: 'mode', label: 'Mode', type: 'select', options: ['plan', 'apply'], default: 'plan' },
        { name: 'token', label: 'Token', type: 'password' }
    ],` : ''
    fs.writeFileSync(path.join(dir, 'back.js'), `module.exports.default = {
        id: '${id}', version: '0.0.1', displayName: '${id}', description: 'test', requires: [], ${schema}
        tools: [{ name: 'echo', description: 'echo', effect: 'read', sensitivity: 'public', inputSchema: {}, execute: async (args, host) => host.config }]
    }`)
    const tgz = `${dir}.tgz`
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['package.json', 'back.js'])
    return tgz
}

const context = (): IToolContext => ({ trace: () => {} } as unknown as IToolContext)
const echo = (id: string) => invokeToolRef(`${id}/echo`, {}, context())

const stored = (secrets: IFakeSecrets, id: string): Record<string, unknown> | undefined => {
    const obj = secrets.objects.get(`kwirth-aitoolset-${id}-config`)
    return obj ? JSON.parse(Buffer.from(String(obj.data), 'base64').toString('utf8')) : undefined
}

const installed = async (id: string, withSchema = true, secrets: IFakeSecrets = fakeSecrets()) => {
    const mgr = new AiToolsetManager(memConfigMaps(), fakeConfigStore(secrets))
    await mgr.init()
    const tgz = await toolsetTgz(id, withSchema)
    await mgr.install(tgz, 'local')
    return { mgr, tgz, secrets }
}

test('🔴 a toolset with no configSchema: its tools get config = {}', async () => {
    const { mgr } = await installed('tscfg-none', false)
    assert.deepEqual(await echo('tscfg-none'), {})
    await mgr.uninstall('tscfg-none', true)
})

test('🔴 with a schema and nothing saved, its tools get the defaults', async () => {
    const { mgr } = await installed('tscfg-defaults')
    assert.deepEqual(await echo('tscfg-defaults'), { namespace: 'default', mode: 'plan' })
    assert.deepEqual(await mgr.getConfig('tscfg-defaults'), { namespace: 'default', mode: 'plan' })
    await mgr.uninstall('tscfg-defaults', true)
})

test('🔴 what is saved goes to ONE Secret, the token REAL, and the NEXT invocation sees it — no restart', async () => {
    const { mgr, secrets } = await installed('tscfg-save')
    assert.deepEqual(await mgr.saveConfig('tscfg-save', { namespace: 'apps', mode: 'apply', token: 't-real' }), [])
    assert.deepEqual(stored(secrets, 'tscfg-save'), { namespace: 'apps', mode: 'apply', token: 't-real' })
    assert.deepEqual(await echo('tscfg-save'), { namespace: 'apps', mode: 'apply', token: 't-real' })
    await mgr.uninstall('tscfg-save', true)
})

test('what does not fit is refused field by field, and nothing is saved nor handed out', async () => {
    const { mgr, secrets } = await installed('tscfg-refuse')
    const errors = await mgr.saveConfig('tscfg-refuse', { namespace: '', mode: 'destroy' })
    assert.deepEqual(errors.map(e => e.field).sort(), ['mode', 'namespace'])
    assert.equal(stored(secrets, 'tscfg-refuse'), undefined)
    assert.deepEqual(await echo('tscfg-refuse'), { namespace: 'default', mode: 'plan' })
    await mgr.uninstall('tscfg-refuse', true)
})

test('🔴 a write that fails is THROWN and the tools keep what they had', async () => {
    const { mgr, secrets } = await installed('tscfg-fail')
    secrets.write = async () => { throw new Error('etcd down') }
    await assert.rejects(mgr.saveConfig('tscfg-fail', { namespace: 'apps', mode: 'plan' }), /etcd down/)
    assert.deepEqual(await echo('tscfg-fail'), { namespace: 'default', mode: 'plan' })
    await mgr.uninstall('tscfg-fail', true)
})

test('saving for a toolset that is not registered throws', async () => {
    const mgr = new AiToolsetManager(memConfigMaps(), fakeConfigStore())
    await assert.rejects(mgr.saveConfig('nobody', {}), /not registered/)
})

test('🔴 uninstalled WITHOUT deleteConfig: the settings are kept, and a reinstall hands them out again', async () => {
    const { mgr, tgz, secrets } = await installed('tscfg-kept')
    await mgr.saveConfig('tscfg-kept', { namespace: 'apps', mode: 'apply' })
    await mgr.uninstall('tscfg-kept')
    assert.ok(stored(secrets, 'tscfg-kept'), 'kept')
    await mgr.install(tgz, 'local')
    assert.deepEqual(await echo('tscfg-kept'), { namespace: 'apps', mode: 'apply' })
    await mgr.uninstall('tscfg-kept', true)
})

test('🔴 uninstalled WITH deleteConfig: the Secret goes, and a reinstall starts from the defaults', async () => {
    const { mgr, tgz, secrets } = await installed('tscfg-gone')
    await mgr.saveConfig('tscfg-gone', { namespace: 'apps', mode: 'apply' })
    await mgr.uninstall('tscfg-gone', true)
    assert.equal(stored(secrets, 'tscfg-gone'), undefined)
    await mgr.install(tgz, 'local')
    assert.deepEqual(await echo('tscfg-gone'), { namespace: 'default', mode: 'plan' })
    await mgr.uninstall('tscfg-gone', true)
})

test('applyConfigs at startup hands the saved settings to a toolset loaded before', async () => {
    const secrets = fakeSecrets()
    const { mgr } = await installed('tscfg-startup', true, secrets)
    await mgr.saveConfig('tscfg-startup', { namespace: 'apps', mode: 'plan' })
    // a second manager over the same Secret: what a restart does
    const again = new AiToolsetManager(memConfigMaps(), fakeConfigStore(secrets))
    await again.applyConfigs()
    assert.deepEqual(await echo('tscfg-startup'), { namespace: 'apps', mode: 'plan' })
    await mgr.uninstall('tscfg-startup', true)
})

test('🔴 kwirth-dev.json aitoolsetConfigs wins over what is saved, ${VAR} interpolated, and is never persisted', async () => {
    const cwd = process.cwd()
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-test-tscfg-dev-'))
    fs.writeFileSync(path.join(dir, 'kwirth-dev.json'), JSON.stringify({ aitoolsetConfigs: { 'tscfg-dev': { namespace: '${TSCFG_NS}', mode: 'apply' } } }))
    process.env.TSCFG_NS = 'from-env'
    process.chdir(dir)
    try {
        const { mgr, secrets } = await installed('tscfg-dev')
        assert.deepEqual(await echo('tscfg-dev'), { namespace: 'from-env', mode: 'apply' })
        assert.equal(stored(secrets, 'tscfg-dev'), undefined, 'not persisted')
        await mgr.saveConfig('tscfg-dev', { namespace: 'saved', mode: 'plan' })
        assert.deepEqual(await echo('tscfg-dev'), { namespace: 'from-env', mode: 'apply' }, 'the dev one still wins')
        await mgr.uninstall('tscfg-dev', true)
    }
    finally {
        process.chdir(cwd)
        delete process.env.TSCFG_NS
    }
})
