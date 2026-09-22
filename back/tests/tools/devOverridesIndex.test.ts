import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { SenderManager } from '../../src/tools/SenderManager'
import { ProviderManager } from '../../src/tools/ProviderManager'
import { WebhookManager } from '../../src/tools/WebhookManager'

/*
    Una extension registrada en kwirth-dev.json SUSTITUYE a la instalada con su mismo id: no se suma
    a ella.

    Sonaba obvio y no lo era. 'listInstalled()' concatena el indice de instalados con los metadatos
    de dev, y en senders, providers y webhooks faltaba filtrar los que se pisan: en un entorno de
    desarrollo —donde una extension esta instalada Y ademas montada desde su dist— la misma salia
    DOS veces, y el duplicado viajaba tal cual por '/core/senders', '/core/providers' y
    '/core/webhooks' a todos sus consumidores: los gestores del front y cualquier extension que
    liste. Lo cazo el e2e de sender-debug, cuyo desplegable pintaba 'console' repetido.

    Plugin, theme, login, homepage y aitoolset ya lo hacian bien; estos tres se habian quedado atras.
*/

// ── mocks ────────────────────────────────────────────────────────────────────

// IConfigMaps en memoria, sembrado con el indice de instalados que se quiera probar.
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
    Monta un workspace de dev de verdad: un kwirth-dev.json con su seccion y un dist por extension
    (package.json + back.js), y ejecuta el cuerpo con el cwd ahi — que es de donde los managers leen
    el fichero. No se falsean los mapas de dev a mano a proposito: el camino que se quiere probar es
    el que recorre el core al arrancar.
*/
const withDevWorkspace = async (section: string, ids: string[], version: string, body: () => Promise<void>): Promise<void> => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-dev-ws-'))
    const entries: Record<string, string> = {}
    for (const id of ids) {
        const dist = path.join(root, id, 'dist')
        fs.mkdirSync(dist, { recursive: true })
        fs.writeFileSync(path.join(dist, 'package.json'), JSON.stringify({ id, name: id, displayName: `${id} (dev)`, version, description: 'dev build' }))
        // back.js minimo: lo unico que hace falta es que exporte una clase. Si fallase, el registro
        // de dev se hace igual (es lo primero que ocurre), pero asi se recorre el camino completo.
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
        // los watchers de dev son persistent:false, pero se sueltan igual para no dejar nada mirando
        // a un directorio temporal que se borra a continuacion
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
            // manda el de dev: es el que getSender() acaba resolviendo, asi que es el que describe
            // al sender que de verdad recibira el mensaje
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
            const index = [installed('azure', '0.2.0'), installed('longhorn', '0.1.0')]
            const manager = new ProviderManager(makeConfigMaps({ 'kwirth-providers-index': index }) as never)
            await manager.init()
            manager.loadDevProviders(new Map())

            const list = await manager.listInstalled()
            assert.deepEqual(list.map(m => m.id).sort(), ['azure', 'longhorn'])
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
