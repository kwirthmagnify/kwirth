/*
    Un provider puede saber COMPROBAR su propia configuracion, y el gestor tiene que enterarse para
    pintarle un boton de prueba junto al formulario.

    Que un usuario meta unas credenciales y no sepa si valen hasta que el provider no trae nada horas
    despues es justo lo que Excubitor resolvio a mano con su 'Test connection' para los conectores cloud.
    Aqui se hace una vez, en el core, para cualquier provider.

    La deteccion mira las RUTAS del configRouter en vez de pedirle al provider que lo declare: el
    endpoint es la unica fuente que no puede mentir —si responde, existe— y asi añadirlo mañana no
    obliga a tocar tambien el package.json ni el build de la extension.
*/

import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'net'
import { ApiKeyApi } from '../../src/api/ApiKeyApi'
import { ProviderApi, TProviderApiEntry } from '../../src/api/ProviderApi'
import { ProviderManager } from '../../src/tools/ProviderManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { IProvider } from '../../src/providers/IProvider'

const memConfigMaps = (): IConfigMaps => ({
    read: (async (_name: string, def?: unknown) => def) as IConfigMaps['read'],
    write: (async () => {}) as IConfigMaps['write'],
    writeKey: async () => {},
    readAllKeys: async () => ({})
})

interface IFakeProviderOptions {
    // rutas que el provider cuelga de su configRouter; sin configRouter si es undefined
    configRoutes?: string[]
}

const fakeProvider = (id: string, options: IFakeProviderOptions = {}): IProvider => {
    let configRouter
    if (options.configRoutes) {
        configRouter = express.Router()
        for (const ruta of options.configRoutes) configRouter.route(ruta).get((_req, res) => res.status(200).json({}))
    }
    return {
        id,
        providesRouter: false,
        requiresApiKeyApi: false,
        addSubscriber: async () => {},
        removeSubscriber: async () => {},
        startProvider: async () => {},
        stopProvider: async () => {},
        router: undefined,
        routerAlias: undefined,
        apiKeyApi: undefined,
        configRouter
    } as unknown as IProvider
}

const listar = async (providers: IProvider[]): Promise<TProviderApiEntry[]> => {
    const configMaps = memConfigMaps()
    const providerManager = new ProviderManager(configMaps)
    await providerManager.init()
    const apiKeyApi = new ApiKeyApi(configMaps, {} as never)
    const api = new ProviderApi(providerManager, new Map(), apiKeyApi, {}, () => providers, () => new Map(), async () => ({}))

    const app = express()
    app.use('/core/providers', api.router)
    const server = app.listen(0)
    await new Promise(r => server.once('listening', r))
    const port = (server.address() as AddressInfo).port
    const res = await fetch(`http://127.0.0.1:${port}/core/providers`)
    const list = await res.json() as TProviderApiEntry[]
    server.close()
    return list
}

test('un provider con /test en su configRouter se anuncia con hasTest', async () => {
    // como azure: state + health + quotas + test
    const list = await listar([fakeProvider('azure', { configRoutes: ['/state', '/health', '/quotas', '/test'] })])

    assert.equal(list.find(e => e.id === 'azure')?.hasTest, true)
})

test('un provider con configRouter pero SIN /test no lo anuncia: no habria boton que pintar', async () => {
    // como longhorn: expone su estado para poder validarlo aislado, pero no prueba credenciales
    const list = await listar([fakeProvider('longhorn', { configRoutes: ['/state'] })])

    assert.equal(list.find(e => e.id === 'longhorn')?.hasTest, undefined)
})

test('un provider sin configRouter ninguno tampoco', async () => {
    const list = await listar([fakeProvider('events')])

    assert.equal(list.find(e => e.id === 'events')?.hasTest, undefined)
})

test('cada provider responde por si mismo: el /test de uno no se lo atribuye a los demas', async () => {
    const list = await listar([
        fakeProvider('azure', { configRoutes: ['/test'] }),
        fakeProvider('longhorn', { configRoutes: ['/state'] }),
        fakeProvider('events')
    ])

    assert.deepEqual(
        list.filter(e => ['azure', 'longhorn', 'events'].includes(e.id)).map(e => `${e.id}:${e.hasTest === true}`).sort(),
        ['azure:true', 'events:false', 'longhorn:false']
    )
})

test('la ruta tiene que ser /test exactamente: /testing o /test/algo no cuentan', async () => {
    const list = await listar([
        fakeProvider('casi', { configRoutes: ['/testing'] }),
        fakeProvider('anidado', { configRoutes: ['/test/deep'] })
    ])

    assert.equal(list.find(e => e.id === 'casi')?.hasTest, undefined)
    assert.equal(list.find(e => e.id === 'anidado')?.hasTest, undefined)
})
