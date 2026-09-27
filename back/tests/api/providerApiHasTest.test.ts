/*
    A provider may know how to CHECK its own configuration, and the manager has to find out so it can
    paint a test button next to the form.

    A user entering some credentials and not knowing whether they are any good until the provider brings
    nothing hours later is what every extension that cared about it solved on its own account. Here it is
    done once, in the core, for any provider.

    The detection looks at the configRouter's ROUTES instead of asking the provider to declare it: the
    endpoint is the only source that cannot lie —if it answers, it exists— and this way adding it tomorrow
    does not force touching the package.json or the extension's build as well.
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
    // routes the provider hangs off its configRouter; with no configRouter it is undefined
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
    // a typical cloud provider: state + health + quotas + test
    const list = await listar([fakeProvider('cloud-x', { configRoutes: ['/state', '/health', '/quotas', '/test'] })])

    assert.equal(list.find(e => e.id === 'cloud-x')?.hasTest, true)
})

test('un provider con configRouter pero SIN /test no lo anuncia: no habria boton que pintar', async () => {
    // another that exposes its state so it can be validated in isolation, but does not test credentials
    const list = await listar([fakeProvider('read-only-x', { configRoutes: ['/state'] })])

    assert.equal(list.find(e => e.id === 'read-only-x')?.hasTest, undefined)
})

test('un provider sin configRouter ninguno tampoco', async () => {
    const list = await listar([fakeProvider('events')])

    assert.equal(list.find(e => e.id === 'events')?.hasTest, undefined)
})

test('cada provider responde por si mismo: el /test de uno no se lo atribuye a los demas', async () => {
    const list = await listar([
        fakeProvider('cloud-x', { configRoutes: ['/test'] }),
        fakeProvider('read-only-x', { configRoutes: ['/state'] }),
        fakeProvider('events')
    ])

    assert.deepEqual(
        list.filter(e => ['cloud-x', 'read-only-x', 'events'].includes(e.id)).map(e => `${e.id}:${e.hasTest === true}`).sort(),
        ['cloud-x:true', 'events:false', 'read-only-x:false']
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
