import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AiToolsetManager, staleDevAiToolsets, IAiToolsetMeta } from '../../src/tools/AiToolsetManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { registerToolset, getToolset, listToolsets, isToolsetGrantedTo, getToolsetGrants } from '@kwirthmagnify/kwirth-common-ai/back'
import { EToolEffect, EToolSensitivity, ECapability } from '@kwirthmagnify/kwirth-common-ai'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'

// Manager of the `aitoolset` type (plan: plans/ai-tools/PLAN.md, S1). What is pinned down here are the
// rules protecting the coherence between the index and the registry: reserved ids, package id == toolset
// id, and the reconciliation of what is declared in kwirth-dev.json.

// In-memory ConfigMaps: the manager only needs to read and write keys, not a cluster.
const fakeConfigMaps = (): IConfigMaps => {
    const store = new Map<string, any>()
    return {
        read: async (name: string, def?: any) => store.has(name) ? store.get(name) : def,
        write: async (name: string, data: any) => { if (data === null) store.delete(name); else store.set(name, data); return {} },
        writeKey: async () => {},
        readAllKeys: async () => ({})
    } as unknown as IConfigMaps
}

/** Builds a real aitoolset tgz: package.json + back.js, like the one a build produces. */
const makeToolsetTgz = async (id: string, exportedId = id): Promise<string> => {
    const dir = path.join(os.tmpdir(), `kwirth-test-aitoolset-${id}-${Date.now()}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        id,
        name: `@test/kwirth-aitoolset-${id}`,
        version: '0.0.1',
        description: `test toolset ${id}`,
        extensionType: 'aitoolset'
    }, null, 2))
    // The module only EXPORTS its definition: it does not register itself. Registering it is the host's job.
    fs.writeFileSync(path.join(dir, 'back.js'), `
        module.exports.default = {
            id: '${exportedId}',
            version: '0.0.1',
            displayName: '${exportedId}',
            description: 'test',
            requires: ['k8s'],
            tools: [{ name: 'ping', description: 'ping', effect: 'read', sensitivity: 'public',
                      inputSchema: {}, execute: async () => 'pong' }]
        }
    `)
    const tgz = path.join(os.tmpdir(), `kwirth-test-aitoolset-${id}-${Date.now()}.tgz`)
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['.'])
    fs.rmSync(dir, { recursive: true, force: true })
    return tgz
}

// ── reconciliacion de dev (funcion pura) ─────────────────────────────────────────────────────────────

test('solo se poda lo marcado dev y solo si ya no esta declarado', () => {
    const index: IAiToolsetMeta[] = [
        { id: 'a', name: 'a', version: '1', description: '', installedFrom: 'dev' },
        { id: 'b', name: 'b', version: '1', description: '', installedFrom: 'dev' },
        { id: 'c', name: 'c', version: '1', description: '', installedFrom: 'https://x/y.tgz' },
        { id: 'd', name: 'd', version: '1', description: '', installedFrom: 'bundled' }
    ]
    const stale = staleDevAiToolsets(index, new Set(['a'])).map(m => m.id)
    // 'b' is surplus (dev and no longer declared). 'c' and 'd' are NOT touched even though they are not
    // declared: that is really installed, and pruning it would be uninstalling something the user put there.
    assert.deepEqual(stale, ['b'])
})

test('sin nada declarado se podan todos los dev, y solo los dev', () => {
    const index: IAiToolsetMeta[] = [
        { id: 'a', name: 'a', version: '1', description: '', installedFrom: 'dev' },
        { id: 'c', name: 'c', version: '1', description: '', installedFrom: 'https://x/y.tgz' }
    ]
    assert.deepEqual(staleDevAiToolsets(index, new Set()).map(m => m.id), ['a'])
})

// ── instalacion ──────────────────────────────────────────────────────────────────────────────────────

test('instalar registra el toolset y lo deja en el indice', async () => {
    const cm = fakeConfigMaps()
    const mgr = new AiToolsetManager(cm)
    await mgr.init()

    const tgz = await makeToolsetTgz('test-install')
    const meta = await mgr.install(tgz, 'local')

    assert.equal(meta.id, 'test-install')
    assert.equal(getToolset('test-install')?.tools.length, 1)
    assert.deepEqual((await mgr.listInstalled()).map(m => m.id), ['test-install'])

    await mgr.uninstall('test-install')
    assert.equal(getToolset('test-install'), undefined)
    assert.deepEqual(await mgr.listInstalled(), [])
    fs.rmSync(tgz, { force: true })
})

test('un id reservado por un built-in se rechaza ANTES de tocar el indice', async () => {
    const cm = fakeConfigMaps()
    const mgr = new AiToolsetManager(cm)
    await mgr.init()

    registerToolset({
        id: 'test-reserved', version: '1', displayName: 'r', description: '', requires: [ECapability.K8S],
        tools: [{ name: 't', description: '', effect: EToolEffect.READ, sensitivity: EToolSensitivity.PUBLIC, inputSchema: {} as any, execute: async () => null }]
    }, true)

    const tgz = await makeToolsetTgz('test-reserved')
    await assert.rejects(() => mgr.install(tgz, 'local'), /reserved/)
    // and the index is left intact: an entry that could never be registered is worse than not installing
    assert.deepEqual(await mgr.listInstalled(), [])
    fs.rmSync(tgz, { force: true })
})

test('un built-in no se puede desinstalar', async () => {
    const mgr = new AiToolsetManager(fakeConfigMaps())
    await mgr.init()
    await assert.rejects(() => mgr.uninstall('test-reserved'), /built-in/)
    assert.ok(getToolset('test-reserved'))
})

test('si el id del paquete y el del toolset exportado no coinciden, no se registra', async () => {
    const cm = fakeConfigMaps()
    const mgr = new AiToolsetManager(cm)
    await mgr.init()

    // package.json says 'test-mismatch', the module exports a different id
    const tgz = await makeToolsetTgz('test-mismatch', 'otro-id')
    await mgr.install(tgz, 'local')

    // Neither of the two is registered: neither the one the package says nor the one the module says.
    // Registering the second would leave the index saying one thing and the registry another, and
    // uninstalling would not find it.
    assert.equal(getToolset('test-mismatch'), undefined)
    assert.equal(getToolset('otro-id'), undefined)

    await mgr.uninstall('test-mismatch')
    fs.rmSync(tgz, { force: true })
})

test('reinstalar encima reemplaza en vez de chocar con el registro', async () => {
    const cm = fakeConfigMaps()
    const mgr = new AiToolsetManager(cm)
    await mgr.init()

    const tgz = await makeToolsetTgz('test-reinstall')
    await mgr.install(tgz, 'local')
    const before = listToolsets().filter(t => t.id === 'test-reinstall').length

    // A second installation of the same id (a new version, or the same dev one after a rebuild)
    await mgr.install(tgz, 'dev')
    const after = listToolsets().filter(t => t.id === 'test-reinstall').length

    assert.equal(before, 1)
    assert.equal(after, 1)   // reemplaza, no duplica ni revienta

    await mgr.uninstall('test-reinstall')
    fs.rmSync(tgz, { force: true })
})

// ── concesiones ──────────────────────────────────────────────────────────────────────────────────────

test('instalar por primera vez no concede el toolset a nadie', async () => {
    // Installing leaves it AVAILABLE, not granted: installing `k8s-ops` must not give write access by accident.
    const mgr = new AiToolsetManager(fakeConfigMaps())
    await mgr.init()
    const tgz = await makeToolsetTgz('test-nogrants')
    await mgr.install(tgz, 'local')

    assert.deepEqual(getToolsetGrants('test-nogrants'), [])

    await mgr.uninstall('test-nogrants')
    fs.rmSync(tgz, { force: true })
})

test('reinstalar NO revoca la concesion que el admin ya dio', async () => {
    // Reinstalling goes through `unregisterToolset` in order to replace, and that takes the grant away
    // with the toolset. Without putting it back, updating a toolset — or re-reading a dev one's dist on
    // every startup — revoked it silently, and the two halves contradicted each other: the card kept
    // saying who it was granted to (what is persisted, which installing does not touch) while the runtime
    // answered NOT GRANTED.
    const mgr = new AiToolsetManager(fakeConfigMaps())
    await mgr.init()

    const tgz = await makeToolsetTgz('test-grants')
    await mgr.install(tgz, 'dev')
    await mgr.setGrants('test-grants', ['agora'])

    await mgr.install(tgz, 'dev')   // el rebuild de un dev, o una version nueva del marketplace

    assert.equal(isToolsetGrantedTo('test-grants', 'agora'), true, 'la concesion no sobrevivio a la reinstalacion')
    assert.deepEqual(getToolsetGrants('test-grants'), ['agora'])
    // and the in-memory registry and what is stored say the same thing, which is exactly what used to break
    assert.deepEqual((await mgr.listGrants())['test-grants'], ['agora'])

    await mgr.uninstall('test-grants')
    fs.rmSync(tgz, { force: true })
})

test('desinstalar SI se lleva la concesion, y tambien la guardada', async () => {
    // The other half of the rule: reinstalling keeps, uninstalling revokes. Leaving it orphaned would make
    // reinstalling resurrect permissions nobody granted again.
    const mgr = new AiToolsetManager(fakeConfigMaps())
    await mgr.init()

    const tgz = await makeToolsetTgz('test-grants-gone')
    await mgr.install(tgz, 'local')
    await mgr.setGrants('test-grants-gone', ['agora'])
    await mgr.uninstall('test-grants-gone')

    assert.equal(isToolsetGrantedTo('test-grants-gone', 'agora'), false)
    assert.equal((await mgr.listGrants())['test-grants-gone'], undefined)

    fs.rmSync(tgz, { force: true })
})

// ── installing from a folder (the dev path) ──────────────────────────────────────────────────────────

test('instalar desde una CARPETA funciona y NO borra la carpeta', async () => {
    // In dev it points at the toolset's real dist, not at a tgz. The manager cleans up its temporary files
    // when it finishes, and were it not to tell them apart, it would take the user's build down on EVERY startup.
    const dir = path.join(os.tmpdir(), `kwirth-test-aitoolset-dir-${Date.now()}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: 'test-fromdir', name: '@test/x', version: '0.0.1', description: 'd', extensionType: 'aitoolset' }))
    fs.writeFileSync(path.join(dir, 'back.js'), `
        module.exports.default = { id: 'test-fromdir', version: '0.0.1', displayName: 'x', description: 'd',
            requires: [], tools: [{ name: 'ping', description: 'p', effect: 'read', sensitivity: 'public', inputSchema: {}, execute: async () => 'pong' }] }
    `)

    const mgr = new AiToolsetManager(fakeConfigMaps())
    await mgr.init()
    const meta = await mgr.install(dir, 'dev')

    assert.equal(meta.id, 'test-fromdir')
    assert.equal(getToolset('test-fromdir')?.tools.length, 1)
    assert.ok(fs.existsSync(path.join(dir, 'back.js')), 'la carpeta de origen sigue entera')

    await mgr.uninstall('test-fromdir')
    fs.rmSync(dir, { recursive: true, force: true })
})
