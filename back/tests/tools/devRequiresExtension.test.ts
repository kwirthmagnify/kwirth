import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { EExtensionType, IExtensionRequirement } from '@kwirthmagnify/kwirth-common'
import { PluginManager } from '../../src/tools/PluginManager'
import { ProviderManager } from '../../src/tools/ProviderManager'
import { SenderManager } from '../../src/tools/SenderManager'
import { WebhookManager } from '../../src/tools/WebhookManager'
import { ThemeManager } from '../../src/tools/ThemeManager'
import { HomepageManager } from '../../src/tools/HomepageManager'

/*
    An extension registered in kwirth-dev.json carries the `requiresExtension` of its package.json.

    Installed from a tgz it always did — its metadata IS the package.json. The dev path builds the
    metadata by hand and left it out, so in development nobody required any DCE: the consumer resolver
    found nobody, the Status channel's DCE tab said "nobody" of a DCE in use, and a DCE could be
    uninstalled from under the extension using it. The Status e2e caught it.
*/

// In-memory IConfigMaps, empty: only the dev path is under test.
const makeConfigMaps = () => {
    const store = new Map<string, unknown>()
    return {
        write: async (name: string, data: unknown) => { store.set(name, data) },
        read: async (name: string, def?: unknown) => (store.has(name) ? store.get(name) : def),
        writeKey: async () => {},
        readAllKeys: async () => ({})
    }
}

const REQUIRES: IExtensionRequirement[] = [{ extensionType: EExtensionType.DCE, id: 'nettools', minVersion: '0.2.0' }]

/** A real dev workspace with one extension in `section`, and the cwd there while `body` runs. */
const withDevWorkspace = async (section: string, id: string, requiresExtension: IExtensionRequirement[] | undefined, body: () => Promise<void>): Promise<void> => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-dev-req-'))
    const dist = path.join(root, id, 'dist')
    fs.mkdirSync(dist, { recursive: true })
    fs.writeFileSync(path.join(dist, 'package.json'), JSON.stringify({ id, name: id, version: '1.0.0', description: 'dev build', ...(requiresExtension ? { requiresExtension } : {}) }))
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
    list: () => Promise<{ id: string, requiresExtension?: IExtensionRequirement[] }[]>
}

const CASES: Record<string, IDevCase> = {
    plugin: { section: 'plugins', list: async () => { const m = new PluginManager(makeConfigMaps() as never); m.loadDevPlugins(new Map()); return m.listInstalled() } },
    provider: { section: 'providers', list: async () => { const m = new ProviderManager(makeConfigMaps() as never); await m.init(); m.loadDevProviders(new Map()); return m.listInstalled() } },
    sender: { section: 'senders', list: async () => { const m = new SenderManager(makeConfigMaps() as never); await m.init(); m.loadDevSenders(); return m.listInstalled() } },
    webhook: { section: 'webhooks', list: async () => { const m = new WebhookManager(makeConfigMaps() as never); await m.init(); m.loadDevWebhooks(); return m.listInstalled() } },
    theme: { section: 'themes', list: async () => { const m = new ThemeManager(makeConfigMaps() as never); m.loadDevThemes(); return m.listInstalled() } },
    homepage: { section: 'homepages', list: async () => { const m = new HomepageManager(makeConfigMaps() as never); m.loadDevHomepages(); return m.listInstalled() } }
}

for (const [kind, c] of Object.entries(CASES)) {
    test(`🔴 a dev ${kind} carries the requiresExtension of its package.json`, async () => {
        await withDevWorkspace(c.section, `dev-${kind}`, REQUIRES, async () => {
            const list = await c.list()
            assert.deepEqual(list.map(m => [m.id, m.requiresExtension]), [[`dev-${kind}`, REQUIRES]])
        })
    })

    test(`a dev ${kind} that requires nothing says so with an empty list`, async () => {
        await withDevWorkspace(c.section, `dev-${kind}`, undefined, async () => {
            const list = await c.list()
            assert.deepEqual(list[0].requiresExtension, [])
        })
    })
}
