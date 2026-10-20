import { test } from 'node:test'
import assert from 'node:assert/strict'
import { TrivyProvider } from '../../src/index'
import { fakeCluster } from '../helpers'

/*
    The config router: managing the Trivy Operator, which moved here from the trivy plugin in 0.4.0.

    🔴 What is really under test is the DOOR. The core mounts configRouter at
    '/core/providerconfig/trivy' behind `validKey`, and that is AUTHENTICATION: it proves the caller
    holds a valid Kwirth key, not that the key may install or delete a deployment, its CRDs and its RBAC
    across the whole cluster. The providers manager is an admin-only screen, but a screen is not a door:
    these routes answer to curl with any valid key.

    The plugin had this hole and `trivy-endpoint-auth` closed it on 2026-10-17. Moving the feature is no
    reason to reopen it, so the check came along — and these tests are what keeps it from being dropped
    by somebody tidying up later.

    The router is exercised directly, with no express server: a Router is a function (req, res, next),
    and that is all that is needed to prove who gets through.
*/

/** An accessKey as it travels in the header: `id|type|resources`. */
const key = (resources: string) => `11111111-2222-3333-4444-555555555555|permanent|${resources}`

interface IFakeResponse {
    code: number
    body: unknown
    status: (c: number) => IFakeResponse
    send: (b?: unknown) => IFakeResponse
    json: (b?: unknown) => IFakeResponse
}

const fakeRes = (): IFakeResponse => {
    const res: IFakeResponse = {
        code: 0,
        body: undefined,
        status (c: number) { res.code = c; return res },
        send (b?: unknown) { res.body = b; return res },
        json (b?: unknown) { res.body = b; return res }
    }
    return res
}

/** Drives the provider's configRouter as express would, and resolves when the response is written. */
const call = async (provider: any, method: string, url: string, authorization?: string): Promise<IFakeResponse> => {
    const res = fakeRes()
    const req: any = { method: method.toUpperCase(), url, originalUrl: url, baseUrl: '', path: url, headers: authorization ? { authorization } : {}, query: {}, body: {} }
    await new Promise<void>((resolve) => {
        const done = () => resolve()
        // express writes through res.send/res.json: resolve when either has been called
        const origSend = res.send, origJson = res.json
        res.send = (b?: unknown) => { origSend(b); done(); return res }
        res.json = (b?: unknown) => { origJson(b); done(); return res }
        provider.configRouter(req, res, () => resolve())
    })
    return res
}

test('🔴 without admin, installing the operator is refused — the core only authenticates', async () => {
    const { clusterInfo } = fakeCluster()
    const provider: any = new TrivyProvider(clusterInfo, {})
    for (const resources of ['trivy$user::::', 'cluster::::', 'view:default:::']) {
        const res = await call(provider, 'post', '/install', `Bearer ${key(resources)}`)
        assert.equal(res.code, 403, `'${resources}' got through to install`)
    }
})

test('🔴 without admin, removing the operator is refused too', async () => {
    const { clusterInfo } = fakeCluster()
    const provider: any = new TrivyProvider(clusterInfo, {})
    const res = await call(provider, 'post', '/remove', `Bearer ${key('trivy$user::::')}`)
    assert.equal(res.code, 403)
})

test('no key at all, or one that cannot be read, authorises nothing', async () => {
    const { clusterInfo } = fakeCluster()
    const provider: any = new TrivyProvider(clusterInfo, {})
    assert.equal((await call(provider, 'get', '/status')).code, 403, 'no Authorization header got through')
    assert.equal((await call(provider, 'get', '/status', 'Bearer not-a-key')).code, 403, 'garbage got through')
    assert.equal((await call(provider, 'get', '/status', 'Basic abc')).code, 403, 'a non-bearer scheme got through')
})

test('with admin, the status says the operator is installed', async () => {
    const { clusterInfo } = fakeCluster()
    const provider: any = new TrivyProvider(clusterInfo, {})
    const res = await call(provider, 'get', '/status', `Bearer ${key('cluster,admin::::')}`)
    assert.equal(res.code, 200)
    assert.equal((res.body as any).installed, true)
})

test('with admin and no operator in the cluster, the status says so instead of failing', async () => {
    // The configMap missing IS how 'not installed' looks: answering 500 would turn the normal case into
    // an error and leave the dialog unable to say why there is nothing to show.
    const { clusterInfo } = fakeCluster({ trivyMissing: true })
    const provider: any = new TrivyProvider(clusterInfo, {})
    const res = await call(provider, 'get', '/status', `Bearer ${key('admin::::')}`)
    assert.equal(res.code, 200)
    assert.equal((res.body as any).installed, false)
})
