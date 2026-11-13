import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IClusterRouteResolver, resolveClusterRouteUrl } from '../src/ClusterRoute'

/*
    Proxied cluster-list entries. The front (with its backend url) and the back (with its loopback url)
    resolve with this same function, so what is tested here is what both sides agree on.
*/

const RESOLVERS: IClusterRouteResolver[] = [
    { id: 'relay', pathTemplate: '/to/{clusterUid}' }
]

test('a route with a known resolver resolves under /channel/<id> of the base url', () => {
    assert.equal(
        resolveClusterRouteUrl('https://core.acme/kwirth', { resolver: 'relay', clusterUid: 'abc-123' }, RESOLVERS),
        'https://core.acme/kwirth/channel/relay/to/abc-123'
    )
})

test('a trailing slash on the base url and a template without a leading slash give the same url', () => {
    const expected = 'http://localhost:3883/channel/relay/to/u1'
    assert.equal(resolveClusterRouteUrl('http://localhost:3883/', { resolver: 'relay', clusterUid: 'u1' }, RESOLVERS), expected)
    assert.equal(resolveClusterRouteUrl('http://localhost:3883', { resolver: 'relay', clusterUid: 'u1' }, [{ id: 'relay', pathTemplate: 'to/{clusterUid}' }]), expected)
})

test('the uid is url-encoded, so it cannot add path segments or a query', () => {
    assert.equal(
        resolveClusterRouteUrl('http://h', { resolver: 'relay', clusterUid: '../x?y=1' }, RESOLVERS),
        'http://h/channel/relay/to/..%2Fx%3Fy%3D1'
    )
})

test('every placeholder in the template is replaced', () => {
    assert.equal(
        resolveClusterRouteUrl('http://h', { resolver: 'r', clusterUid: 'u' }, [{ id: 'r', pathTemplate: '/{clusterUid}/x/{clusterUid}' }]),
        'http://h/channel/r/u/x/u'
    )
})

test('nothing resolves without a route, without a matching resolver, or with an incomplete route', () => {
    assert.equal(resolveClusterRouteUrl('http://h', undefined, RESOLVERS), undefined)
    assert.equal(resolveClusterRouteUrl('http://h', { resolver: 'other', clusterUid: 'u' }, RESOLVERS), undefined)
    assert.equal(resolveClusterRouteUrl('http://h', { resolver: 'relay', clusterUid: 'u' }, []), undefined)
    assert.equal(resolveClusterRouteUrl('http://h', { resolver: '', clusterUid: 'u' }, RESOLVERS), undefined)
    assert.equal(resolveClusterRouteUrl('http://h', { resolver: 'relay', clusterUid: '' }, RESOLVERS), undefined)
})

test('a resolver that needs a ticket resolves only with one, and puts it (encoded) in the url', () => {
    const resolvers: IClusterRouteResolver[] = [{ id: 'relay', pathTemplate: '/{routeTicket}/to/{clusterUid}', needsTicket: true }]
    const route = { resolver: 'relay', clusterUid: 'u1' }
    assert.equal(resolveClusterRouteUrl('http://h', route, resolvers), undefined, 'no ticket yet: wait, do not resolve')
    assert.equal(resolveClusterRouteUrl('http://h', route, resolvers, ''), undefined)
    assert.equal(resolveClusterRouteUrl('http://h', route, resolvers, 't1'), 'http://h/channel/relay/t1/to/u1')
    assert.equal(resolveClusterRouteUrl('http://h', route, resolvers, 'a/b?c'), 'http://h/channel/relay/a%2Fb%3Fc/to/u1')
})

test('a resolver that needs a ticket but has no ticket placeholder resolves nothing (it could not carry it)', () => {
    assert.equal(resolveClusterRouteUrl('http://h', { resolver: 'r', clusterUid: 'u' }, [{ id: 'r', pathTemplate: '/to/{clusterUid}', needsTicket: true }], 't'), undefined)
})

test('a resolver that does not need a ticket ignores one, and leaves a literal placeholder alone', () => {
    assert.equal(resolveClusterRouteUrl('http://h', { resolver: 'relay', clusterUid: 'u1' }, RESOLVERS, 't1'), 'http://h/channel/relay/to/u1')
})

test('a resolver whose template has no placeholder resolves nothing (it could not tell clusters apart)', () => {
    assert.equal(resolveClusterRouteUrl('http://h', { resolver: 'r', clusterUid: 'u' }, [{ id: 'r', pathTemplate: '/fixed' }]), undefined)
})
