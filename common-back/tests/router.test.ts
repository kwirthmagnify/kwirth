// The router contract (plans/router-extension/PRD.md): the smallest router a developer can write compiles
// against IRouter, and the core's three ways of authenticating a caller are fixed values.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ERouteCallerVia, IRouteCaller, IRouter, IRouterContext, TRouterConfig, TRouterConstructor } from '../src/IRouter'
import { IConfigFieldDef, IRouterData } from '@kwirthmagnify/kwirth-common'

class EchoRouter implements IRouter {
    private config: TRouterConfig = {}
    constructor(private context: IRouterContext) {}
    getRouterData = (): IRouterData => ({ id: 'echo', pathTemplate: '/{clusterUid}', needsTicket: false })
    getConfigSchema = (): IConfigFieldDef[] => [{ name: 'greeting', label: 'Greeting', type: 'text' }]
    startRouter = async (config: TRouterConfig) => { this.config = config }
    applyConfig = async (config: TRouterConfig) => { this.config = config }
    stopRouter = async () => { this.config = {} }
    getStatus = () => ({ started: true, detail: `${this.context.clusterName}: ${String(this.config.greeting ?? '')}` })
}

test('the smallest router: getRouterData, its schema and its lifecycle', async () => {
    const ctor: TRouterConstructor = EchoRouter
    const router = new ctor({ clusterUid: 'u1', clusterName: 'k3d', kwirthVersion: '0.6.117', loopbackUrl: 'http://localhost:3883', logger: { info: () => {}, trace: () => {}, warning: () => {}, error: () => {} } })
    assert.deepEqual(router.getRouterData(), { id: 'echo', pathTemplate: '/{clusterUid}', needsTicket: false })
    await router.startRouter({ greeting: 'hi' })
    assert.equal(router.getStatus?.().detail, 'k3d: hi')
    await router.applyConfig({ greeting: 'bye' })
    assert.equal(router.getStatus?.().detail, 'k3d: bye')
    assert.equal(router.routerRequest, undefined, 'HTTP and WebSocket handling are optional')
})

test('how the core authenticated a caller: three fixed values', () => {
    assert.deepEqual(Object.values(ERouteCallerVia), ['ticket', 'accesskey', 'loopback'])
    const loopback: IRouteCaller = { via: ERouteCallerVia.LOOPBACK }
    assert.equal(loopback.accessKey, undefined)
})
