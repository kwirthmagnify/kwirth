import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SenderManager } from '../../src/tools/SenderManager'
import { ProviderManager } from '../../src/tools/ProviderManager'
import { WebhookManager } from '../../src/tools/WebhookManager'

/*
    An extension registered in kwirth-dev.json REPLACES the installed one with the same id: it is not
    added to it.

    It sounded obvious and it was not. 'listInstalled()' concatenates the installed index with the dev
    metadata, and in senders, providers and webhooks filtering out the overridden ones was missing: in a
    development environment —where an extension is installed AND also mounted from its dist— the same one
    came out TWICE, and the duplicate travelled as it was through '/core/senders', '/core/providers' and
    '/core/webhooks' to all their consumers: the front end's managers and any extension that lists. The
    sender-debug e2e caught it, its dropdown painting 'console' twice.

    Plugin, theme, login, homepage and aitoolset already did it right; these three had been left behind.
*/

// ── mocks ────────────────────────────────────────────────────────────────────

// In-memory IConfigMaps, seeded with whichever installed index is to be tested.
const makeConfigMaps = (seed: Record<string, unknown> = {}) => {
    const store = new Map<string, unknown>(Object.entries(seed))
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

/*
    Sets up a real dev workspace: a kwirth-dev.json with its section and one dist per extension
    (package.json + back.js), and runs the body with the cwd there — which is where the managers read the
    file from. The dev maps are deliberately not faked by hand: the path to be tested is the one the core
    walks at startup.
*/
const withDevWorkspace = async (section: string, ids: string[], version: string, body: () => Promise<void>): Promise<void> => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-dev-ws-'))
    const entries: Record<string, string> = {}
    for (const id of ids) {
        const dist = path.join(root, id, 'dist')
        fs.mkdirSync(dist, { recursive: true })
        fs.writeFileSync(path.join(dist, 'package.json'), JSON.stringify({ id, name: id, displayName: `${id} (dev)`, version, description: 'dev build' }))
        // a minimal back.js: all it takes is that it exports a class. Were it to fail, the dev
        // registration happens anyway (it is the first thing that occurs), but this way the whole path is walked.
        fs.writeFileSync(path.join(dist, 'back.js'), `class Dev { constructor() { this.id = ${JSON.stringify(id)} } }\nmodule.exports = Dev\n`)
        entries[id] = path.join(root, id, 'dist')
    }
    fs.writeFileSync(path.join(root, 'kwirth-dev.json'), JSON.stringify({ [section]: entries }))

    const previous = process.cwd()
    process.chdir(root)
    try {
        await body()
    }
    finally {
        process.chdir(previous)
        // the dev watchers are persistent:false, but they are released all the same so nothing is left
        // watching a temporary directory that is deleted right after
        for (const id of ids) fs.unwatchFile(path.join(root, id, 'dist', 'back.js'))
        fs.rmSync(root, { recursive: true, force: true })
    }
}

const installed = (id: string, version: string) => ({ id, name: id, displayName: `${id} (installed)`, version, description: 'installed', installedFrom: 'https://marketplace.example/x.tgz' })

// ── senders ──────────────────────────────────────────────────────────────────

describe('SenderManager.listInstalled', () => {
    test('un sender que esta instalado Y en dev sale UNA vez, con los metadatos de dev', async () => {
        await withDevWorkspace('senders', ['console'], '9.9.9-dev', async () => {
            const manager = new SenderManager(makeConfigMaps({ 'kwirth-senders-index': [installed('console', '0.2.0')] }) as never)
            await manager.init()
            manager.loadDevSenders()

            const list = await manager.listInstalled()
            assert.deepEqual(list.map(m => m.id), ['console'])
            // the dev one rules: it is what getSender() ends up resolving, so it is what describes the
            // sender that will really receive the message
            assert.equal(list[0].version, '9.9.9-dev')
            assert.equal(list[0].displayName, 'console (dev)')
        })
    })

    test('lo instalado que NO esta en dev se conserva, junto a lo de dev', async () => {
        await withDevWorkspace('senders', ['console'], '9.9.9-dev', async () => {
            const index = [installed('console', '0.2.0'), installed('teams', '0.4.1')]
            const manager = new SenderManager(makeConfigMaps({ 'kwirth-senders-index': index }) as never)
            await manager.init()
            manager.loadDevSenders()

            const list = await manager.listInstalled()
            assert.deepEqual(list.map(m => m.id).sort(), ['console', 'teams'])
            assert.equal(list.find(m => m.id === 'teams')!.version, '0.4.1')
        })
    })

    test('sin nada en dev, el indice de instalados sale intacto', async () => {
        const manager = new SenderManager(makeConfigMaps({ 'kwirth-senders-index': [installed('console', '0.2.0'), installed('jira', '0.1.0')] }) as never)
        await manager.init()

        const list = await manager.listInstalled()
        assert.deepEqual(list.map(m => m.id), ['console', 'jira'])
        assert.equal(list[0].version, '0.2.0')
    })

    test('un sender solo en dev sale, aunque no este en el indice', async () => {
        await withDevWorkspace('senders', ['brandnew'], '0.0.1', async () => {
            const manager = new SenderManager(makeConfigMaps({ 'kwirth-senders-index': [] }) as never)
            await manager.init()
            manager.loadDevSenders()

            const list = await manager.listInstalled()
            assert.deepEqual(list.map(m => m.id), ['brandnew'])
        })
    })
})

// ── providers ────────────────────────────────────────────────────────────────

describe('ProviderManager.listInstalled', () => {
    test('un provider que esta instalado Y en dev sale UNA vez, con los metadatos de dev', async () => {
        await withDevWorkspace('providers', ['azure'], '9.9.9-dev', async () => {
            const manager = new ProviderManager(makeConfigMaps({ 'kwirth-providers-index': [installed('azure', '0.2.0')] }) as never)
            await manager.init()
            manager.loadDevProviders(new Map())

            const list = await manager.listInstalled()
            assert.deepEqual(list.map(m => m.id), ['azure'])
            assert.equal(list[0].version, '9.9.9-dev')
        })
    })

    test('lo instalado que NO esta en dev se conserva', async () => {
        await withDevWorkspace('providers', ['azure'], '9.9.9-dev', async () => {
            const index = [installed('azure', '0.2.0'), installed('suse-longhorn', '0.1.0')]
            const manager = new ProviderManager(makeConfigMaps({ 'kwirth-providers-index': index }) as never)
            await manager.init()
            manager.loadDevProviders(new Map())

            const list = await manager.listInstalled()
            assert.deepEqual(list.map(m => m.id).sort(), ['azure', 'suse-longhorn'])
        })
    })
})

// ── webhooks ─────────────────────────────────────────────────────────────────

describe('WebhookManager.listInstalled', () => {
    test('un webhook que esta instalado Y en dev sale UNA vez, con los metadatos de dev', async () => {
        await withDevWorkspace('webhooks', ['jira'], '9.9.9-dev', async () => {
            const manager = new WebhookManager(makeConfigMaps({ 'kwirth-webhooks-index': [installed('jira', '0.3.0')] }) as never)
            await manager.init()
            manager.loadDevWebhooks()

            const list = await manager.listInstalled()
            assert.deepEqual(list.map(m => m.id), ['jira'])
            assert.equal(list[0].version, '9.9.9-dev')
        })
    })

    test('lo instalado que NO esta en dev se conserva', async () => {
        await withDevWorkspace('webhooks', ['jira'], '9.9.9-dev', async () => {
            const index = [installed('jira', '0.3.0'), installed('github', '0.1.2')]
            const manager = new WebhookManager(makeConfigMaps({ 'kwirth-webhooks-index': index }) as never)
            await manager.init()
            manager.loadDevWebhooks()

            const list = await manager.listInstalled()
            assert.deepEqual(list.map(m => m.id).sort(), ['github', 'jira'])
        })
    })
})
