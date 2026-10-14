import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import tar from 'tar'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { listBundledOfType, peekExtensionType, peekBundledMeta } from '../../src/tools/BundledExtensions'
import { ProviderManager, IProviderMeta } from '../../src/tools/ProviderManager'
import { PluginManager } from '../../src/tools/PluginManager'
import { TChannelConstructor } from '../../src/channels/IChannel'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { TProviderConstructor } from '../../src/providers/IProvider'

// The bundled extensions directory is a SINGLE one for every type, so each manager has to keep its own by
// looking at the extensionType each tgz declares. It used not to filter: DocsManager installed as
// documentation any tgz with a targetType (a login carried one) and PluginManager/IdpManager tried to
// install every one in the directory, expecting the later failure to discard them.

const makeTgz = async (dir: string, name: string, pkg: Record<string, unknown>): Promise<string> => {
    const stage = path.join(dir, `.stage-${name}`, 'package')
    fs.mkdirSync(stage, { recursive: true })
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg))
    const tgz = path.join(dir, `${name}.tgz`)
    await tar.c({ gzip: true, file: tgz, cwd: path.dirname(stage) }, ['package'])
    fs.rmSync(path.dirname(stage), { recursive: true, force: true })
    return tgz
}

const withBundledDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-bundled-test-'))
    try {
        await fn(dir)
    }
    finally {
        fs.rmSync(dir, { recursive: true, force: true })
    }
}

test('peekExtensionType lee el tipo declarado dentro del tgz', async () => {
    await withBundledDir(async dir => {
        const tgz = await makeTgz(dir, 'magnify', { id: 'magnify', extensionType: 'login' })
        assert.equal(await peekExtensionType(tgz), 'login')
    })
})

test('peekExtensionType devuelve undefined si el tgz no declara tipo', async () => {
    await withBundledDir(async dir => {
        const tgz = await makeTgz(dir, 'legacy', { id: 'legacy' })
        assert.equal(await peekExtensionType(tgz), undefined)
    })
})

test('peekExtensionType no revienta con un fichero que no es un tgz', async () => {
    await withBundledDir(async dir => {
        const fake = path.join(dir, 'roto.tgz')
        fs.writeFileSync(fake, 'esto no es un tar')
        assert.equal(await peekExtensionType(fake), undefined)
    })
})

test('cada manager ve SOLO los tgz de su tipo en el directorio compartido', async () => {
    await withBundledDir(async dir => {
        await makeTgz(dir, 'log', { id: 'log', extensionType: 'plugin' })
        await makeTgz(dir, 'magnify', { id: 'magnify', extensionType: 'login' })
        await makeTgz(dir, 'excubitor-docs', { id: 'excubitor', extensionType: 'docs', targetType: 'plugin' })
        await makeTgz(dir, 'entra', { id: 'entra', extensionType: 'idp' })

        const names = async (t: EExtensionType) => (await listBundledOfType(dir, t)).map(f => path.basename(f)).sort()

        assert.deepEqual(await names(EExtensionType.PLUGIN), ['log.tgz'])
        assert.deepEqual(await names(EExtensionType.LOGIN), ['magnify.tgz'])
        assert.deepEqual(await names(EExtensionType.DOCS), ['excubitor-docs.tgz'])
        assert.deepEqual(await names(EExtensionType.IDP), ['entra.tgz'])
    })
})

test('un login bundled NO se cuela como documentacion aunque lleve targetType', async () => {
    await withBundledDir(async dir => {
        // The login declares a targetType out of historical error; the only valid discriminator is extensionType.
        await makeTgz(dir, 'magnify', { id: 'magnify', extensionType: 'login', targetType: 'plugin' })
        assert.deepEqual(await listBundledOfType(dir, EExtensionType.DOCS), [])
    })
})

test('los tgz sin extensionType no se asignan a ningun tipo', async () => {
    await withBundledDir(async dir => {
        await makeTgz(dir, 'legacy', { id: 'legacy' })
        for (const t of [EExtensionType.PLUGIN, EExtensionType.LOGIN, EExtensionType.DOCS, EExtensionType.IDP]) {
            assert.deepEqual(await listBundledOfType(dir, t), [], `tipo ${t}`)
        }
    })
})

test('lo que no es .tgz se ignora', async () => {
    await withBundledDir(async dir => {
        await makeTgz(dir, 'log', { id: 'log', extensionType: 'plugin' })
        fs.writeFileSync(path.join(dir, 'README.md'), '# nada')
        fs.writeFileSync(path.join(dir, 'log.tgz.bak'), 'nada')
        const found = await listBundledOfType(dir, EExtensionType.PLUGIN)
        assert.equal(found.length, 1)
        assert.equal(path.basename(found[0]), 'log.tgz')
    })
})

test('un directorio bundled inexistente devuelve lista vacia, no excepcion', async () => {
    assert.deepEqual(await listBundledOfType(path.join(os.tmpdir(), 'kwirth-no-existe-jamas'), EExtensionType.PLUGIN), [])
})

test('devuelve rutas absolutas listas para install()', async () => {
    await withBundledDir(async dir => {
        await makeTgz(dir, 'log', { id: 'log', extensionType: 'plugin' })
        const [found] = await listBundledOfType(dir, EExtensionType.PLUGIN)
        assert.equal(path.isAbsolute(found), true)
        assert.equal(fs.existsSync(found), true)
    })
})

// ── G3 (magnify-plugin): what a bundle brings is identified by its package, and providers get installed ──

test('🔴 the id comes from the package, not from the file name: a plugin and a provider may share it', async () => {
    await withBundledDir(async dir => {
        // what fetch-bundled writes now: '<type>-<id>.tgz', so 'metrics' the plugin and 'metrics' the
        // provider no longer overwrite each other — the file name is no longer the id
        const plugin = await makeTgz(dir, 'plugins-metrics', { id: 'metrics', version: '0.1.1', extensionType: 'plugin' })
        const provider = await makeTgz(dir, 'providers-metrics', { id: 'metrics', version: '0.1.0', extensionType: 'provider' })
        assert.deepEqual(await peekBundledMeta(plugin), { id: 'metrics', version: '0.1.1', extensionType: 'plugin' })
        assert.deepEqual(await peekBundledMeta(provider), { id: 'metrics', version: '0.1.0', extensionType: 'provider' })
        assert.deepEqual((await listBundledOfType(dir, EExtensionType.PROVIDER)).map(f => path.basename(f)), ['providers-metrics.tgz'])
    })
})

test('peekBundledMeta of something that is not a tgz is empty, not an exception', async () => {
    await withBundledDir(async dir => {
        const fake = path.join(dir, 'roto.tgz')
        fs.writeFileSync(fake, 'esto no es un tar')
        assert.deepEqual(await peekBundledMeta(fake), {})
    })
})

/** A provider package as a bundle carries it: package.json and a back.js exporting the class. */
const makeProviderTgz = async (dir: string, name: string, id: string, version: string): Promise<string> => {
    const stage = path.join(dir, `.stage-${name}`, 'package')
    fs.mkdirSync(stage, { recursive: true })
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ id, name: `@e2e/kwirth-provider-${id}`, version, description: 'bundled', extensionType: 'provider' }))
    fs.writeFileSync(path.join(stage, 'back.js'), `class P { constructor () { this.id = '${id}' } }\nmodule.exports.default = P`)
    const tgz = path.join(dir, `${name}.tgz`)
    await tar.c({ gzip: true, file: tgz, cwd: path.dirname(stage) }, ['package'])
    fs.rmSync(path.dirname(stage), { recursive: true, force: true })
    return tgz
}

/** ConfigMaps in memory, keeping what is written. */
const storeConfigMaps = (): { cm: IConfigMaps, store: Map<string, unknown> } => {
    const store = new Map<string, unknown>()
    const cm: IConfigMaps = {
        read: async (name: string, def?: unknown) => store.has(name) ? store.get(name) : def,
        write: async (name: string, data: unknown) => { store.set(name, data) },
        writeKey: async () => { },
        readAllKeys: async () => ({})
    }
    return { cm, store }
}

test('🔴 the providers a bundle brings are installed (they used to be fetched and never installed)', async () => {
    await withBundledDir(async dir => {
        await makeProviderTgz(dir, 'providers-sample', 'e2e-bundled', '1.0.0')
        await makeTgz(dir, 'plugins-other', { id: 'other', extensionType: 'plugin' })   // not its type: ignored
        const { cm, store } = storeConfigMaps()
        const manager = new ProviderManager(cm)
        await manager.init()
        const registered = new Map<string, TProviderConstructor>()

        await manager.installBundled(dir, registered)

        const index = store.get('kwirth-providers-index') as IProviderMeta[]
        assert.deepEqual(index.map(p => [p.id, p.version, p.installedFrom]), [['e2e-bundled', '1.0.0', 'bundled']])
        assert.ok(registered.has('e2e-bundled'), 'the provider is not registered')
    })
})

test('a bundled provider already installed with the same version is left alone; a new version updates it', async () => {
    await withBundledDir(async dir => {
        const { cm, store } = storeConfigMaps()
        const manager = new ProviderManager(cm)
        await manager.init()
        const registered = new Map<string, TProviderConstructor>()

        await makeProviderTgz(dir, 'providers-sample', 'e2e-bundled', '1.0.0')
        await manager.installBundled(dir, registered)
        const writesAfterFirst = [...store.keys()].length
        store.set('marker', true)
        // same version again: nothing is rewritten (the meta keeps the very same object)
        const metaBefore = store.get('kwirth-provider-e2e-bundled-meta')
        await manager.installBundled(dir, registered)
        assert.equal(store.get('kwirth-provider-e2e-bundled-meta'), metaBefore)
        assert.ok(writesAfterFirst > 0)

        // a new image brings 1.1.0: it is installed over the old one
        fs.rmSync(path.join(dir, 'providers-sample.tgz'))
        await makeProviderTgz(dir, 'providers-sample', 'e2e-bundled', '1.1.0')
        await manager.installBundled(dir, registered)
        const index = store.get('kwirth-providers-index') as IProviderMeta[]
        assert.deepEqual(index.map(p => [p.id, p.version]), [['e2e-bundled', '1.1.0']])
    })
})

/** A plugin package as a bundle carries it, under the file name fetch-bundled gives it ('plugins-<id>.tgz'). */
const makePluginTgz = async (dir: string, id: string, version: string): Promise<void> => {
    const stage = path.join(dir, '.stage', 'package')
    fs.mkdirSync(stage, { recursive: true })
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ id, name: `@e2e/kwirth-plugin-${id}`, version, description: 'bundled', extensionType: 'plugin' }))
    fs.writeFileSync(path.join(stage, 'back.js'), `class C { constructor () { this.channelId = '${id}' } }\nmodule.exports.default = C`)
    fs.writeFileSync(path.join(stage, 'front.js'), `window.__kwirth_plugins__ = window.__kwirth_plugins__ || {}`)
    await tar.c({ gzip: true, file: path.join(dir, `plugins-${id}.tgz`), cwd: path.dirname(stage) }, ['package'])
    fs.rmSync(path.dirname(stage), { recursive: true, force: true })
}

/*
    The id used to be the FILE NAME. Installing still took the package's id, so the first install worked;
    what broke was everything that looks the plugin up by id — and the first of those is the update: with
    the file named 'plugins-<id>.tgz' the installed version was never found, and the new one an image
    brings hit 'already installed' and was skipped for ever.
*/
test('🔴 a bundled plugin is known by the id its package declares: a new version in the image updates it', async () => {
    await withBundledDir(async dir => {
        const { cm, store } = storeConfigMaps()
        const manager = new PluginManager(cm)
        await manager.init()

        await makePluginTgz(dir, 'e2e-bundled-plugin', '1.0.0')
        await manager.installBundled(dir, new Map<string, TChannelConstructor>())
        assert.deepEqual(manager.getInstalledIds(), ['e2e-bundled-plugin'])

        // a new image is a new start: a fresh manager over the same stored index, with 1.1.0 in the bundle
        fs.rmSync(path.join(dir, 'plugins-e2e-bundled-plugin.tgz'))
        await makePluginTgz(dir, 'e2e-bundled-plugin', '1.1.0')
        const restarted = new PluginManager(cm)
        await restarted.init()
        await restarted.installBundled(dir, new Map<string, TChannelConstructor>())

        const index = store.get('kwirth-plugins-index') as { id: string, version: string }[]
        assert.deepEqual(index.map(p => [p.id, p.version]), [['e2e-bundled-plugin', '1.1.0']])
    })
})
