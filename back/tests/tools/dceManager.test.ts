import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DceManager, dceRegistry, staleDevDces } from '../../src/tools/DceManager'
import { assertExtensionRequirements, consumersBrokenByMajor, dcesFirst, dcesLast, findConsumers, majorOf, setInstalledExtensionsSource, emptyInstalledIndex, IRequirer } from '../../src/tools/ExtensionDeps'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { ISecrets } from '../../src/tools/ISecrets'
import { EDceState, EExtensionType, IDceConsumer, IDceMeta } from '@kwirthmagnify/kwirth-common'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'

/*
    Manager of the `dce` type (plan: plans/completed/dce/PLAN.md, S1). What is pinned down here are the type's
    own rules: the factory runs ONCE and the instance is shared; a factory that fails leaves a cause
    and tumbles nothing; a DCE in use is not uninstalled; a change of major with consumers on the old
    one is refused; and a consumer is not installed without its DCE.
*/

// In-memory ConfigMaps and Secrets: the manager only needs to read and write keys, not a cluster.
const fakeStore = (): { configMaps: IConfigMaps, secrets: ISecrets, keys: Map<string, unknown> } => {
    const keys = new Map<string, unknown>()
    const store = {
        read: async (name: string, def?: unknown) => keys.has(name) ? keys.get(name) : def,
        write: async (name: string, data: unknown) => { if (data === null) keys.delete(name); else keys.set(name, data); return {} },
        writeKey: async () => {},
        readAllKeys: async () => ({}),
        storeLimit: () => undefined
    }
    return { configMaps: store as unknown as IConfigMaps, secrets: store as unknown as ISecrets, keys }
}

interface ITgzOptions {
    version?: string
    backJs?: string | null
    frontJs?: string | null
    extensionType?: string
}

/** A real DCE tgz: package.json plus back.js and/or front.js, like the one a build produces. */
const makeDceTgz = async (id: string, options: ITgzOptions = {}): Promise<string> => {
    const dir = path.join(os.tmpdir(), `kwirth-test-dce-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
        id,
        name: `@test/kwirth-dce-${id}`,
        version: options.version ?? '1.0.0',
        description: `test dce ${id}`,
        extensionType: options.extensionType ?? 'dce',
        requiresRestart: false
    }, null, 2))
    // The module only EXPORTS its factory: calling it is the host's job.
    const backJs = options.backJs === undefined
        ? `let calls = 0
           module.exports.default = { create: async (host) => { calls++; await host.configMaps.write('boots', calls); return { id: host.id, calls, hello: () => 'hi from ${id}' } } }`
        : options.backJs
    if (backJs !== null) fs.writeFileSync(path.join(dir, 'back.js'), backJs)
    if (options.frontJs) fs.writeFileSync(path.join(dir, 'front.js'), options.frontJs)
    const tgz = path.join(os.tmpdir(), `kwirth-test-dce-${id}-${Date.now()}-${Math.random().toString(36).slice(2)}.tgz`)
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['.'])
    fs.rmSync(dir, { recursive: true, force: true })
    return tgz
}

const newManager = async (): Promise<{ manager: DceManager, keys: Map<string, unknown> }> => {
    const { configMaps, secrets, keys } = fakeStore()
    const manager = new DceManager(configMaps, secrets)
    await manager.init()
    return { manager, keys }
}

interface ISampleInstance {
    id: string
    calls: number
    hello: () => string
}

// ── dev reconciliation (pure) ──────────────────────────────────────────────────────────────────────

test('only what is marked dev and no longer declared is pruned', () => {
    const meta = (id: string, installedFrom: string): IDceMeta => ({ id, name: id, version: '1', description: '', installedFrom, hasBack: true, hasFront: false })
    const index = [meta('a', 'dev'), meta('b', 'dev'), meta('c', 'https://x/y.tgz'), meta('d', 'bundled')]
    assert.deepEqual(staleDevDces(index, new Set(['a'])).map(m => m.id), ['b'])
})

// ── loading ────────────────────────────────────────────────────────────────────────────────────────

test('🔴 the factory runs ONCE and every reader gets the same instance', async () => {
    const { manager, keys } = await newManager()
    const meta = await manager.install(await makeDceTgz('once'), 'local')
    assert.equal(meta.hasBack, true)
    assert.equal(meta.hasFront, false)
    // Forced, whatever the package said (RNF3).
    assert.equal(meta.requiresRestart, true)

    const entry = dceRegistry()['once']
    assert.equal(entry.state, EDceState.LOADED)
    const a = entry.instance as ISampleInstance
    const b = dceRegistry()['once'].instance as ISampleInstance
    assert.equal(a, b, 'two readers, one object')
    assert.equal(a.calls, 1, 'the factory ran once')
    assert.equal(a.hello(), 'hi from once')
    // The host handed it a scoped store: what it wrote landed under the DCE's own prefix.
    assert.equal(keys.get('kwirth-dce-once-own-boots'), 1)
    assert.equal(manager.status('once')?.state, EDceState.LOADED)
    await manager.uninstall('once')
})

test('🔴 a factory that throws leaves FAILED with its cause, and the manager carries on', async () => {
    const { manager } = await newManager()
    await manager.install(await makeDceTgz('boom', { backJs: `module.exports.default = { create: () => { throw new Error('no database at 10.0.0.1') } }` }), 'local')
    const entry = dceRegistry()['boom']
    assert.equal(entry.state, EDceState.FAILED)
    assert.match(entry.error ?? '', /no database at 10\.0\.0\.1/)
    // It is installed all the same: the index says so, so it can be uninstalled or updated.
    assert.ok((await manager.listInstalled()).some(m => m.id === 'boom'))
    await manager.uninstall('boom')
})

test('a back.js without a factory is FAILED, not LOADED with nothing in it', async () => {
    const { manager } = await newManager()
    await manager.install(await makeDceTgz('nofactory', { backJs: `module.exports.default = { notCreate: true }` }), 'local')
    assert.equal(dceRegistry()['nofactory'].state, EDceState.FAILED)
    assert.match(dceRegistry()['nofactory'].error ?? '', /no factory with create\(\)/)
    await manager.uninstall('nofactory')
})

test('a front-only DCE is served and has no back-end entry', async () => {
    const { manager } = await newManager()
    const meta = await manager.install(await makeDceTgz('frontonly', { backJs: null, frontJs: `window.__kwirth_dce_factories__ = { frontonly: { create: () => ({}) } }` }), 'local')
    assert.equal(meta.hasBack, false)
    assert.equal(meta.hasFront, true)
    assert.equal(manager.status('frontonly'), undefined)
    assert.match((await manager.getFrontJs('frontonly')) ?? '', /__kwirth_dce_factories__/)
    await manager.uninstall('frontonly')
    assert.equal(await manager.getFrontJs('frontonly'), undefined)
})

test('a package with neither side, or of another type, is refused before touching anything', async () => {
    const { manager, keys } = await newManager()
    await assert.rejects(manager.install(await makeDceTgz('empty', { backJs: null }), 'local'), /neither back\.js nor front\.js/)
    await assert.rejects(manager.install(await makeDceTgz('plugin', { extensionType: 'plugin' }), 'local'), /Not a DCE package: its extensionType is 'plugin'/)
    assert.equal(keys.size, 0, 'nothing was written')
    assert.equal(dceRegistry()['plugin'], undefined)
})

test('what is stored is reloaded at startup: a new manager over the same store loads it again', async () => {
    const { configMaps, secrets } = fakeStore()
    const first = new DceManager(configMaps, secrets)
    await first.init()
    await first.install(await makeDceTgz('persist'), 'local')
    delete dceRegistry()['persist']

    const second = new DceManager(configMaps, secrets)
    await second.init()
    await second.loadAll()
    assert.equal(dceRegistry()['persist'].state, EDceState.LOADED)
    await second.uninstall('persist')
})

// ── in use: uninstall and breaking updates ─────────────────────────────────────────────────────────

const consumer = (type: EExtensionType, id: string, requirement: string): IDceConsumer => ({ type, id, requirement })

test('🔴 a DCE somebody requires is not uninstalled, and the message says who', async () => {
    const { manager } = await newManager()
    await manager.install(await makeDceTgz('inuse'), 'local')
    manager.setConsumerResolver(async id => id === 'inuse' ? [consumer(EExtensionType.PLUGIN, 'excubitor', 'dce:inuse:1.0.0')] : [])
    await assert.rejects(manager.uninstall('inuse'), /DCE 'inuse' is in use and cannot be uninstalled: required by plugin 'excubitor' \(dce:inuse:1\.0\.0\)/)
    assert.equal(dceRegistry()['inuse'].state, EDceState.LOADED, 'still there')
    // force is for the dev reconciliation only
    await manager.uninstall('inuse', true)
    assert.equal(dceRegistry()['inuse'], undefined)
})

test('consumers() answers through the resolver, and is empty before the core sets one', async () => {
    const { manager } = await newManager()
    assert.deepEqual(await manager.consumers('any'), [])
    manager.setConsumerResolver(async id => id === 'inuse' ? [consumer(EExtensionType.PLUGIN, 'status', 'dce:inuse:1.0.0')] : [])
    assert.deepEqual(await manager.consumers('inuse'), [consumer(EExtensionType.PLUGIN, 'status', 'dce:inuse:1.0.0')])
    assert.deepEqual(await manager.consumers('other'), [])
})

test('🔴 updating across a major with consumers on the old one is refused; within a major it goes through', async () => {
    const { manager } = await newManager()
    await manager.install(await makeDceTgz('major', { version: '1.2.0' }), 'local')
    const before = dceRegistry()['major'].instance
    manager.setConsumerResolver(async () => [consumer(EExtensionType.HOMEPAGE, 'iria', 'dce:major:1.0.0')])

    await assert.rejects(manager.install(await makeDceTgz('major', { version: '2.0.0' }), 'local', undefined, undefined, true),
        /cannot be updated from v1\.2\.0 to v2\.0\.0: it changes major and is required by homepage 'iria' \(dce:major:1\.0\.0\)/)
    assert.equal(dceRegistry()['major'].instance, before, 'the running instance was not touched')

    const updated = await manager.install(await makeDceTgz('major', { version: '1.3.0' }), 'local', undefined, undefined, true)
    assert.equal(updated.version, '1.3.0')
    assert.notEqual(dceRegistry()['major'].instance, before, 'a new instance for whoever asks from now on')
    await manager.uninstall('major', true)
})

test('installing on top without upgrade is refused, as with every type', async () => {
    const { manager } = await newManager()
    await manager.install(await makeDceTgz('twice'), 'local')
    await assert.rejects(manager.install(await makeDceTgz('twice', { version: '1.0.1' }), 'local'), /already installed/)
    await manager.uninstall('twice')
})

// ── who consumes whom (pure) ───────────────────────────────────────────────────────────────────────

test('findConsumers lists every installed extension that requires the DCE, whatever its type', () => {
    const installed: IRequirer[] = [
        { type: EExtensionType.PLUGIN, id: 'excubitor', requiresExtension: ['dce:iria-icons:1.0.0', 'webhook:jira:0.1.0'] },
        { type: EExtensionType.HOMEPAGE, id: 'iria', requiresExtension: ['dce:iria-icons:1.2.0'] },
        { type: EExtensionType.PLUGIN, id: 'status' },
        { type: EExtensionType.SENDER, id: 'teams', requiresExtension: ['dce:other:1.0.0'] }
    ]
    const consumers = findConsumers(installed, EExtensionType.DCE, 'iria-icons')
    assert.deepEqual(consumers.map(c => `${c.type}:${c.id}`), ['plugin:excubitor', 'homepage:iria'])
    assert.deepEqual(findConsumers(installed, EExtensionType.DCE, 'nobody'), [])
})

test('a change of major breaks only those whose minimum sits on a lower major', () => {
    const consumers = [
        consumer(EExtensionType.PLUGIN, 'old', 'dce:x:1.4.0'),
        consumer(EExtensionType.PLUGIN, 'new', 'dce:x:2.0.0')
    ]
    assert.deepEqual(consumersBrokenByMajor(consumers, '2.1.0').map(c => c.id), ['old'])
    assert.deepEqual(consumersBrokenByMajor(consumers, '1.9.0'), [], 'within the major nobody breaks')
    assert.equal(majorOf('1.4.2'), 1)
    assert.equal(majorOf(undefined), 0)
    assert.equal(majorOf('garbage'), 0)
})

// ── RF12: the order inside a pack ──────────────────────────────────────────────────────────────────

test('🔴 a pack installs its DCEs FIRST, whatever order its members are listed in', () => {
    // Listed the worst possible way: the consumer before the DCE it requires.
    const members = [
        { extensionType: EExtensionType.PLUGIN, id: 'consumer' },
        { extensionType: EExtensionType.THEME, id: 'brand' },
        { extensionType: EExtensionType.DCE, id: 'icons' },
        { extensionType: EExtensionType.PROVIDER, id: 'feed' }
    ]
    assert.deepEqual(dcesFirst(members).map(m => m.id), ['icons', 'consumer', 'brand', 'feed'])
    // And uninstalling is the mirror image: the DCE goes once nobody needs it.
    assert.deepEqual(dcesLast(members).map(m => m.id), ['consumer', 'brand', 'feed', 'icons'])
})

test('only the DCEs move: everything else keeps the order it was written in', () => {
    const members = [
        { extensionType: EExtensionType.SENDER, id: 'a' },
        { extensionType: EExtensionType.PLUGIN, id: 'b' },
        { extensionType: EExtensionType.WEBHOOK, id: 'c' }
    ]
    assert.deepEqual(dcesFirst(members).map(m => m.id), ['a', 'b', 'c'])
    assert.deepEqual(dcesLast(members).map(m => m.id), ['a', 'b', 'c'])
})

test('several DCEs keep their relative order, and an empty pack does not blow up', () => {
    const members = [
        { extensionType: EExtensionType.DCE, id: 'first' },
        { extensionType: EExtensionType.PLUGIN, id: 'p' },
        { extensionType: EExtensionType.DCE, id: 'second' }
    ]
    assert.deepEqual(dcesFirst(members).map(m => m.id), ['first', 'second', 'p'])
    assert.deepEqual(dcesLast([]), [])
})

// ── RF8: a consumer is not installed without its DCE ───────────────────────────────────────────────

test('🔴 a consumer whose dependency is missing or too old is refused, with the reason', async () => {
    setInstalledExtensionsSource(async () => ({ ...emptyInstalledIndex(), dce: [{ id: 'iria-icons', version: '1.1.0' }] }))
    try {
        await assert.rejects(assertExtensionRequirements('Plugin', 'excubitor', ['dce:iria-icons:1.2.0'], 'local'),
            /Plugin 'excubitor' cannot be installed: Required dce 'iria-icons' version >=1\.2\.0, found 1\.1\.0/)
        await assert.rejects(assertExtensionRequirements('Homepage', 'iria', ['dce:missing:1.0.0'], 'https://x/y.tgz'),
            /Required dce 'missing' \(>=1\.0\.0\) is not installed/)
        // ALL types are checked now, not just dce:
        await assert.rejects(assertExtensionRequirements('Plugin', 'excubitor', ['dce:iria-icons:1.0.0', 'webhook:jira:9.9.9'], 'local'),
            /Required webhook 'jira' \(>=9\.9\.9\) is not installed/)
    }
    finally {
        setInstalledExtensionsSource(undefined)
    }
})

test('dev, bundled and pack installs are not checked here: they have their own rules', async () => {
    setInstalledExtensionsSource(async () => emptyInstalledIndex())
    try {
        await assertExtensionRequirements('Plugin', 'p', ['dce:missing:1.0.0'], 'dev')
        await assertExtensionRequirements('Plugin', 'p', ['dce:missing:1.0.0'], 'bundled')
        await assertExtensionRequirements('Plugin', 'p', ['dce:missing:1.0.0'], 'pack:suite')
    }
    finally {
        setInstalledExtensionsSource(undefined)
    }
    // And with no source registered yet (startup), nothing is refused either.
    await assertExtensionRequirements('Plugin', 'p', ['dce:missing:1.0.0'], 'local')
})
