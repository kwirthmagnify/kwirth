import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import tar from 'tar'
import { EExtensionTag } from '@kwirthmagnify/kwirth-common'
import { PluginManager } from '../../src/tools/PluginManager'
import { ProviderManager } from '../../src/tools/ProviderManager'
import { fakeConfigStore } from './fakeExtensionConfigStore'
import { SenderManager } from '../../src/tools/SenderManager'
import { WebhookManager } from '../../src/tools/WebhookManager'
import { ThemeManager } from '../../src/tools/ThemeManager'
import { HomepageManager } from '../../src/tools/HomepageManager'
import { LoginManager } from '../../src/tools/LoginManager'

/*
    An installed extension carries the `tags` of its package.json (plans/completed/extension-taxonomy/PRD.md),
    exactly the way `website` and `requiresExtension` travel.

    The package.json is untrusted input: whatever is not in the closed catalogue (EExtensionTag) is
    dropped, and so are duplicates. A manager whose metadata IS the whole package.json (plugins,
    providers, senders, webhooks, AI toolsets) would otherwise store the raw array as it came.
*/

// In-memory IConfigMaps
const makeConfigMaps = () => {
    const store = new Map<string, unknown>()
    return {
        store,
        // no store limit: the login manager asks for one before sizing its background
        storeLimit: () => undefined,
        write: async (name: string, data: unknown) => { store.set(name, data) },
        read: async (name: string, def?: unknown) => (store.has(name) ? store.get(name) : def),
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
}

// A typo, a duplicate and a non-string next to two good ones: only the catalogue's survive, once each
const RAW_TAGS: unknown[] = ['observability', 'log', 'logs', 'log', 42]
const EXPECTED: EExtensionTag[] = [EExtensionTag.OBSERVABILITY, EExtensionTag.LOG]

/** A real dev workspace with one extension in `section`, and the cwd there while `body` runs. */
const withDevWorkspace = async (section: string, id: string, tags: unknown, body: () => Promise<void>): Promise<void> => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-dev-tags-'))
    const dist = path.join(root, id, 'dist')
    fs.mkdirSync(dist, { recursive: true })
    fs.writeFileSync(path.join(dist, 'package.json'), JSON.stringify({ id, name: id, version: '1.0.0', description: 'dev build', ...(tags !== undefined ? { tags } : {}) }))
    fs.writeFileSync(path.join(dist, 'back.js'), `class Dev { constructor() { this.id = ${JSON.stringify(id)} } }\nmodule.exports = Dev\n`)
    fs.writeFileSync(path.join(root, 'kwirth-dev.json'), JSON.stringify({ [section]: { [id]: dist } }))
    const previous = process.cwd()
    process.chdir(root)
    try {
        await body()
    }
    finally {
        process.chdir(previous)
        fs.unwatchFile(path.join(dist, 'back.js'))
        fs.rmSync(root, { recursive: true, force: true })
    }
}

interface IDevCase {
    section: string
    /** Builds the manager, loads its dev section and lists what is installed. */
    list: () => Promise<{ id: string, tags?: EExtensionTag[] }[]>
}

const CASES: Record<string, IDevCase> = {
    plugin: { section: 'plugins', list: async () => { const m = new PluginManager(makeConfigMaps() as never, fakeConfigStore()); m.loadDevPlugins(new Map()); return m.listInstalled() } },
    provider: { section: 'providers', list: async () => { const m = new ProviderManager(makeConfigMaps() as never, fakeConfigStore()); await m.init(); m.loadDevProviders(new Map()); return m.listInstalled() } },
    sender: { section: 'senders', list: async () => { const m = new SenderManager(makeConfigMaps() as never, fakeConfigStore()); await m.init(); m.loadDevSenders(); return m.listInstalled() } },
    webhook: { section: 'webhooks', list: async () => { const m = new WebhookManager(makeConfigMaps() as never, fakeConfigStore()); await m.init(); m.loadDevWebhooks(); return m.listInstalled() } },
    theme: { section: 'themes', list: async () => { const m = new ThemeManager(makeConfigMaps() as never); m.loadDevThemes(); return m.listInstalled() } },
    homepage: { section: 'homepages', list: async () => { const m = new HomepageManager(makeConfigMaps() as never); m.loadDevHomepages(); return m.listInstalled() } }
}

for (const [kind, c] of Object.entries(CASES)) {
    test(`a dev ${kind} carries the catalogue tags of its package.json`, async () => {
        await withDevWorkspace(c.section, `dev-${kind}`, RAW_TAGS, async () => {
            const list = await c.list()
            assert.deepEqual(list.map(m => [m.id, m.tags]), [[`dev-${kind}`, EXPECTED]])
        })
    })

    test(`a dev ${kind} without tags, or with garbage instead of a list, carries none`, async () => {
        await withDevWorkspace(c.section, `dev-${kind}`, undefined, async () => {
            assert.deepEqual((await c.list())[0].tags, [])
        })
        await withDevWorkspace(c.section, `dev-${kind}`, 'observability', async () => {
            assert.deepEqual((await c.list())[0].tags, [])
        })
    })
}

// ── installed from a tgz ───────────────────────────────────────────────────────

/** A tgz with the given package.json and files (name → content). */
const makeTgz = async (pkg: Record<string, unknown>, files: Record<string, string>): Promise<string> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-tags-tgz-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg))
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content)
    const tgz = path.join(dir, 'bundle.tgz')
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['package.json', ...Object.keys(files)])
    return tgz
}

test('🔴 a sender installed from a tgz stores its tags NORMALIZED, though its meta is the whole package.json', async () => {
    const cm = makeConfigMaps()
    const manager = new SenderManager(cm as never, fakeConfigStore())
    await manager.init()

    const meta = await manager.install(await makeTgz(
        { id: 'mail', name: '@test/sender-mail', version: '1.0.0', tags: RAW_TAGS },
        { 'back.js': 'module.exports = class { async send() { return { success: true } } }' }
    ), 'test')

    assert.deepEqual(meta.tags, EXPECTED)
    const index = cm.store.get('kwirth-senders-index') as { id: string, tags?: EExtensionTag[] }[]
    assert.deepEqual(index.find(m => m.id === 'mail')?.tags, EXPECTED, 'the index keeps the normalized list, not the raw one')
})

test('a theme installed from a tgz carries its catalogue tags', async () => {
    const manager = new ThemeManager(makeConfigMaps() as never)
    await manager.init()

    const meta = await manager.install(await makeTgz(
        { id: 'tagged', name: '@test/theme-tagged', version: '1.0.0', tags: RAW_TAGS },
        { 'front.js': 'window.__theme = {}' }
    ))

    assert.deepEqual(meta.tags, EXPECTED)
    assert.deepEqual((await manager.listInstalled()).find(m => m.id === 'tagged')?.tags, EXPECTED)
})

test('a login installed from a tgz without tags carries none', async () => {
    const manager = new LoginManager(makeConfigMaps() as never, fakeConfigStore())
    await manager.init()

    const meta = await manager.install(await makeTgz(
        { id: 'plain', name: '@test/login-plain', version: '1.0.0' },
        { 'login.json': JSON.stringify({ title: 'plain' }) }
    ), 'test')

    assert.deepEqual(meta.tags, [])
})
