// DCE `swagger-ui`: the object it hands out, the page and the files its handler serves, by value.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import dce from '../src/back/index'
import { IHandlerRequest, IHandlerResponse, createHandler, pageHtml } from '../src/back/handler'
import { IDceBackHost, IDceStore } from '@kwirthmagnify/kwirth-common-back'

/** A host in memory: the factory only logs. */
const fakeHost = (): { host: IDceBackHost, logged: string[] } => {
    const store = new Map<string, unknown>()
    const logged: string[] = []
    const memory: IDceStore = {
        read: async (name, def) => store.has(name) ? store.get(name) : def,
        write: async (name, data) => { store.set(name, data) }
    }
    const host: IDceBackHost = {
        id: 'swagger-ui',
        logger: { info: m => logged.push(String(m)), warning: m => logged.push(String(m)), error: m => logged.push(String(m)) },
        configMaps: memory,
        secrets: memory,
        libs: {}
    }
    return { host, logged }
}

interface IFakeResponse extends IHandlerResponse {
    headers: Record<string, string>
    body?: string
}

const fakeResponse = (): IFakeResponse => {
    const res: IFakeResponse = {
        statusCode: 0,
        headers: {},
        setHeader(name: string, value: string) { res.headers[name.toLowerCase()] = value },
        end(body?: string) { res.body = body }
    }
    return res
}

type THandle = (req: IHandlerRequest, res: IHandlerResponse, next: (err?: unknown) => void) => void

const ASSETS = { bundleJs: 'window.SwaggerUIBundle = function () {}', css: '.swagger-ui { color: red }', version: '5.0.0' }
const OPTIONS = { specUrl: '../openapi.json', title: 'IRIA Specula API' }

// Runs the handler once; `next` says whether it passed the request on.
const call = (req: IHandlerRequest): { res: IFakeResponse, passed: boolean } => {
    const res = fakeResponse()
    let passed = false
    ;(createHandler(ASSETS, OPTIONS) as unknown as THandle)(req, res, () => { passed = true })
    return { res, passed }
}

test('the factory hands the handler and the version of Swagger UI inside, and logs it', async () => {
    const { host, logged } = fakeHost()
    const instance = await dce.create(host)
    assert.equal(instance.id, 'swagger-ui')
    assert.match(instance.swaggerUiVersion, /^5\.\d+\.\d+$/)
    assert.equal(typeof instance.handler(OPTIONS), 'function')
    assert.match(logged[0], /swagger-ui created, with Swagger UI 5\./)
})

test('🔴 the real Swagger UI is inside the bundle: its script and stylesheet are served whole, not fetched', async () => {
    const { host } = fakeHost()
    const handle = (await dce.create(host)).handler(OPTIONS) as unknown as THandle
    const js = fakeResponse()
    handle({ url: '/swagger-ui-bundle.js', method: 'GET' }, js, () => assert.fail('passed on'))
    assert.equal(js.statusCode, 200)
    assert.ok((js.body ?? '').length > 1_000_000, 'the bundle is the real one, over 1 MB')
    assert.match(js.body ?? '', /SwaggerUIBundle/)
    const css = fakeResponse()
    handle({ url: '/swagger-ui.css', method: 'GET' }, css, () => assert.fail('passed on'))
    assert.ok((css.body ?? '').length > 100_000)
})

test('the page at the mount path with a slash: the title, the spec it loads, and the files next to it', () => {
    const { res, passed } = call({ url: '/', originalUrl: '/channel/specula/v1/docs/', method: 'GET' })
    assert.equal(passed, false)
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['content-type'], 'text/html; charset=utf-8')
    assert.equal(res.headers['cache-control'], 'no-store')
    assert.match(res.body ?? '', /<title>IRIA Specula API<\/title>/)
    assert.match(res.body ?? '', /url: "\.\.\/openapi\.json"/)
    assert.match(res.body ?? '', /href="swagger-ui\.css"/)
    assert.match(res.body ?? '', /src="swagger-ui-bundle\.js"/)
})

test('without the trailing slash it redirects to it, keeping the query', () => {
    const plain = call({ url: '/', originalUrl: '/channel/specula/v1/docs', method: 'GET' }).res
    assert.equal(plain.statusCode, 301)
    assert.equal(plain.headers['location'], '/channel/specula/v1/docs/')
    const query = call({ url: '/?x=1', originalUrl: '/root/channel/specula/v1/docs?x=1', method: 'GET' }).res
    assert.equal(query.headers['location'], '/root/channel/specula/v1/docs/?x=1')
})

test('the files, with their types and a cache', () => {
    const css = call({ url: '/swagger-ui.css', method: 'GET' }).res
    assert.equal(css.statusCode, 200)
    assert.equal(css.headers['content-type'], 'text/css; charset=utf-8')
    assert.equal(css.headers['cache-control'], 'public, max-age=3600')
    assert.equal(css.body, ASSETS.css)
    const js = call({ url: '/swagger-ui-bundle.js?v=1', method: 'GET' }).res
    assert.equal(js.headers['content-type'], 'application/javascript; charset=utf-8')
    assert.equal(js.body, ASSETS.bundleJs)
})

test('anything else, or another method, is passed on', () => {
    assert.equal(call({ url: '/other.js', method: 'GET' }).passed, true)
    assert.equal(call({ url: '/', originalUrl: '/docs/', method: 'POST' }).passed, true)
})

test('🔴 the title and the spec URL cannot break out of the page', () => {
    const html = pageHtml({ title: '<script>alert(1)</script> & "x"', specUrl: '</script><script>alert(2)</script>' })
    assert.match(html, /<title>&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;x&quot;<\/title>/)
    assert.ok(!html.includes('</script><script>alert(2)'), 'the spec URL does not close the script')
    assert.match(html, /\\u003c\/script>\\u003cscript>alert\(2\)/)
})
