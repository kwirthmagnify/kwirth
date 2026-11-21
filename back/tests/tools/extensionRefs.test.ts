import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EExtensionType } from '@kwirthmagnify/kwirth-common'
import { buildExtensionRefs, IExtensionRefSources } from '../../src/tools/ExtensionRefs'

/*
    Who goes into the Kwirth export. Routers and logins did not (plans/extension-config, S7): their
    configuration lives in the core like a plugin's, and ☰ Kwirth export left it behind.
*/

const none = { listInstalled: async () => [] }

const sources = (): IExtensionRefSources => ({
    pluginManager: none,
    providerManager: none,
    senderManager: none,
    webhookManager: none,
    aiToolsetManager: none,
    dceManager: none,
    idpManager: { listConnectors: () => [] },
    routerManager: {
        listInstalled: async () => [{ id: 'gw', displayName: 'Gateway', version: '1.0.0' }],
        getSavedConfig: async () => ({ host: 'h' }),
        getSchema: () => []
    },
    loginManager: {
        listInstalled: async () => [{ id: 'corp', displayName: 'Corporate', version: '2.0.0' }],
        getSavedConfig: async () => ({ title: 'Welcome' }),
        getConfigSchema: () => []
    },
    channels: new Map(),
    providers: []
} as unknown as IExtensionRefSources)

test('🔴 routers and logins are listed, each with the core part that exports its configuration', async () => {
    const refs = await buildExtensionRefs(sources())
    const router = refs.find(r => r.type === EExtensionType.ROUTER && r.id === 'gw')
    const login = refs.find(r => r.type === EExtensionType.LOGIN && r.id === 'corp')
    assert.ok(router?.coreInstance, 'the router is there, with the core part')
    assert.ok(login?.coreInstance, 'the login is there, with the core part')
    assert.equal(router.displayName, 'Gateway')
    assert.deepEqual(await router.coreInstance.exportConfig!({ includeCredentials: true }), { installConfig: { host: 'h' } })
    assert.deepEqual(await login.coreInstance.exportConfig!({ includeCredentials: true }), { installConfig: { title: 'Welcome' } })
})
