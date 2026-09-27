// GET /core/providers serves pluviders TOO, and that is deliberate: whoever consumes producers need not
// know there are two classes. They ask for the list, pick one and subscribe — the id's prefix is resolved
// by the core internally. The 'pluvider' flag exists only for the extension manager, which does need to
// tell them apart because a pluvider is neither installed nor uninstalled separately.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'net'
import { ApiKeyApi } from '../../src/api/ApiKeyApi'
import { IPluviderHostInfo, ProviderApi, TProviderApiEntry } from '../../src/api/ProviderApi'
import { ProviderManager } from '../../src/tools/ProviderManager'
import { IConfigMaps } from '../../src/tools/IConfigMap'
import { IProvider, IProviderSubscriptionHelp } from '../../src/providers/IProvider'
import { TPluviderChannel } from '../../src/providers/Pluvider'

const memConfigMaps = (): IConfigMaps => ({
    read: (async (_name: string, def?: unknown) => def) as IConfigMaps['read'],
    write: (async () => {}) as IConfigMaps['write'],
    writeKey: async () => {},
    readAllKeys: async () => ({})
})

const fakeProvider = (id: string): IProvider => ({
    id,
    providesRouter: false,
    requiresApiKeyApi: false,
    addSubscriber: async () => {},
    removeSubscriber: async () => {},
    startProvider: async () => {},
    stopProvider: async () => {},
    router: undefined,
    routerAlias: undefined,
    apiKeyApi: undefined
} as unknown as IProvider)

const fakePluvider = (description: string, help?: IProviderSubscriptionHelp, broken = false): TPluviderChannel => ({
    getPluviderData: () => {
        if (broken) throw new Error('getPluviderData ha reventado')
        return { description, eventTypeName: 'IFakeAlert' }
    },
    addSubscriber: async () => {},
    removeSubscriber: async () => {},
    startProvider: async () => {},
    stopProvider: async () => {},
    ...(help ? { getSubscriptionHelp: () => help } : {})
} as unknown as TPluviderChannel)

const serve = async (providers: IProvider[], pluviders: Map<string, TPluviderChannel>, plugins: Record<string, IPluviderHostInfo> = {}): Promise<{ list: TProviderApiEntry[], close: () => void }> => {
    const configMaps = memConfigMaps()
    const providerManager = new ProviderManager(configMaps)
    await providerManager.init()
    const apiKeyApi = new ApiKeyApi(configMaps, {} as never)
    const api = new ProviderApi(providerManager, new Map(), apiKeyApi, {}, () => providers, () => pluviders, async id => plugins[id])

    const app = express()
    app.use('/core/providers', api.router)
    const server = app.listen(0)
    await new Promise(r => server.once('listening', r))
    const port = (server.address() as AddressInfo).port
    const res = await fetch(`http://127.0.0.1:${port}/core/providers`)
    const list = await res.json() as TProviderApiEntry[]
    return { list, close: () => server.close() }
}

test('un pluvider vivo se lista junto a los providers, marcado y con su plugin', async () => {
    const { list, close } = await serve([fakeProvider('events')], new Map([['plugin:agora', fakePluvider('Proactive alerts')]]))
    close()

    const pluv = list.find(e => e.id === 'plugin:agora')
    assert.ok(pluv, 'el pluvider tiene que salir en la MISMA lista que los providers')
    assert.equal(pluv.pluvider, true)
    assert.equal(pluv.hostedBy, 'agora')
    assert.equal(pluv.description, 'Proactive alerts')
    // a live pluvider is running by definition: it exists because its plugin is instantiated
    assert.equal(pluv.running, true)
})

test('el nombre y la version de un pluvider son los de SU PLUGIN', async () => {
    // A pluvider is neither named nor versioned separately: it goes inside the plugin that publishes it.
    const { list, close } = await serve(
        [], new Map([['plugin:agora', fakePluvider('alertas')]]),
        { agora: { name: 'Agora', displayName: 'Agora', version: '0.1.55' } }
    )
    close()

    const pluv = list.find(e => e.id === 'plugin:agora')
    assert.equal(pluv?.version, '0.1.55')
    assert.equal(pluv?.name, 'Agora')
    assert.equal(pluv?.displayName, 'Agora')
})

test('si no se puede resolver el plugin, no se inventa ni nombre ni version', async () => {
    // It used to put the literal 'plugin' in the version, and the card drew it as "vplugin".
    const { list, close } = await serve([], new Map([['plugin:agora', fakePluvider('alertas')]]))
    close()

    const pluv = list.find(e => e.id === 'plugin:agora')
    assert.equal(pluv?.version, '')
    // with no plugin metadata, the name falls back to the plugin's id, which is the only certain thing known
    assert.equal(pluv?.name, 'agora')
})

test('la procedencia de un pluvider es su plugin, no un marketplace', async () => {
    // Without this it would fall into the front end's fallback and announce itself as served by the PUBLIC
    // marketplace, which is false — and with a paid plugin it would announce it as OSS on top of that.
    const { list, close } = await serve([], new Map([['plugin:agora', fakePluvider('alertas')]]))
    close()

    assert.equal(list.find(e => e.id === 'plugin:agora')?.installedFrom, 'plugin:agora')
})

test('el provider de al lado no se contamina: sigue sin marca de pluvider', async () => {
    const { list, close } = await serve([fakeProvider('events')], new Map([['plugin:agora', fakePluvider('alertas')]]))
    close()

    const events = list.find(e => e.id === 'events')
    assert.ok(events)
    assert.equal(events.pluvider, undefined)
    assert.equal(events.hostedBy, undefined)
})

test('la ayuda de suscripcion de un pluvider viaja igual que la de un provider', async () => {
    const help = { usage: 'te llegan las alertas segun se producen', example: {} }
    const { list, close } = await serve([], new Map([['plugin:agora', fakePluvider('alertas', help)]]))
    close()

    assert.deepEqual(list.find(e => e.id === 'plugin:agora')?.subscriptionHelp, help)
})

test('la ayuda viaja ENTERA: usage, example y fields', async () => {
    /*
        This is the path provider-debug's form really uses: it reads GET /core/providers, not the
        websocket's catalogue. If 'fields' were lost along the way, the Form tab would be left disabled
        and the user would have to write the JSON by hand without knowing which fields it admits.
    */
    const help = {
        usage: 'subscribe with the configs you care about',
        example: { configs: ['payments', 'orders'] },
        fields: [{ name: 'configs', type: 'string[]' as const, required: false, description: 'Config names. Empty means all.' }]
    }
    const { list, close } = await serve([], new Map([['plugin:montag', fakePluvider('issues', help)]]))
    close()

    const got = list.find(e => e.id === 'plugin:montag')?.subscriptionHelp
    assert.deepEqual(got?.example, { configs: ['payments', 'orders'] })
    assert.equal(got?.fields?.length, 1)
    assert.equal(got?.fields?.[0].name, 'configs')
    assert.equal(got?.fields?.[0].type, 'string[]')
})

test('un pluvider sin ayuda se lista igual, simplemente sin ella', async () => {
    const { list, close } = await serve([], new Map([['plugin:agora', fakePluvider('alertas')]]))
    close()

    const pluv = list.find(e => e.id === 'plugin:agora')
    assert.ok(pluv)
    assert.equal(pluv.subscriptionHelp, undefined)
})

test('un pluvider que revienta al describirse no tumba el listado de los demas', async () => {
    const { list, close } = await serve(
        [fakeProvider('events')],
        new Map([['plugin:roto', fakePluvider('', undefined, true)], ['plugin:agora', fakePluvider('alertas')]])
    )
    close()

    assert.ok(list.find(e => e.id === 'events'), 'los providers siguen ahi')
    assert.ok(list.find(e => e.id === 'plugin:agora'), 'y los pluviders sanos tambien')
    assert.equal(list.find(e => e.id === 'plugin:roto')?.description, '', 'el roto se lista sin descripcion, no se cae')
})

test('sin pluviders la lista es exactamente la de siempre', async () => {
    const { list, close } = await serve([fakeProvider('events'), fakeProvider('metrics')], new Map())
    close()

    assert.deepEqual(list.map(e => e.id).sort(), ['events', 'metrics'])
    assert.ok(list.every(e => e.pluvider === undefined))
})
