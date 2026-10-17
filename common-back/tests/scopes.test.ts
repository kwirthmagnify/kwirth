import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scopeAllows, keyAllows } from '../src/Scopes'
import { AccessKey } from '@kwirthmagnify/kwirth-common'

/*
    The check a channel makes when the core does not make it for it. It had been written three times
    (excubitor, fileman, trivy) before living here, so these tests are the ones none of the three had.
*/

// a channel's ladder, in the shape every channel declares it
const LADDER = ['', 'demo$user', 'demo$write', 'cluster', 'admin']
const levelOf = (scope: string): number => LADDER.indexOf(scope)

const USER = 'demo$user'
const WRITE = 'demo$write'

const allows = (resources: string, required: string) => scopeAllows(resources, required, levelOf)

test('el minimo no alcanza lo que esta por encima', () => {
    assert.equal(allows('demo$user:pre:::', USER), true)
    assert.equal(allows('demo$user:pre:::', WRITE), false)
})

test('un scope mas alto concede los de debajo', () => {
    assert.equal(allows('demo$write:pre:::', USER), true)
    assert.equal(allows('demo$write:pre:::', WRITE), true)
})

test('cluster y admin estan por encima de la escalera del canal', () => {
    for (const scope of ['cluster', 'admin']) {
        assert.equal(allows(`${scope}::::`, WRITE), true, `'${scope}'`)
    }
})

/*
    🔴 The property the whole thin-scopes design rests on: a token the ladder does not know is -1 and
    grants NOTHING, with nobody writing code for it. It covers a renamed scope (trivy$workload, gone in
    0.2.30), another channel's scope, and — when they arrive — a thin scope on a channel that does not
    understand the format.
*/
test('un scope desconocido no concede nada: fail-closed sin escribir codigo', () => {
    for (const resources of ['demo$inventado:pre:::', 'otro$write:pre:::', 'demo#write#L3RtcA==:pre:::']) {
        assert.equal(allows(resources, USER), false, `'${resources}'`)
        assert.equal(allows(resources, WRITE), false, `'${resources}'`)
    }
})

test('sin scopes o con recursos vacios no se concede nada', () => {
    for (const resources of ['::::', '']) {
        assert.equal(allows(resources, USER), false, `'${resources}'`)
    }
})

test('varios recursos se combinan con OR y gana el mas alto', () => {
    assert.equal(allows('demo$user:pro:::;demo$write:pre:::', WRITE), true)
    assert.equal(allows('demo$user:pro:::;demo$user:pre:::', WRITE), false)
})

test('una lista de scopes en el mismo recurso se recorre entera', () => {
    assert.equal(allows('log$view,demo$write:pre:::', WRITE), true)
    assert.equal(allows('log$view,demo$user:pre:::', WRITE), false)
})

// It must not throw: it is called from async route handlers, and an exception escaping one of those
// surfaces as an unhandledRejection — which is what took the core down on 2026-10-16.
test('unos recursos malformados no conceden nada, y NO lanzan', () => {
    for (const resources of ['::::::::::', 'basura', ';;;', ':']) {
        assert.doesNotThrow(() => allows(resources, USER), `'${resources}' no deberia lanzar`)
        assert.equal(allows(resources, USER), false, `'${resources}'`)
    }
})

test('keyAllows: sin clave no hay permiso', () => {
    assert.equal(keyAllows(undefined, USER, levelOf), false)
    const key = { id: 'x', type: 'permanent', resources: 'demo$write:pre:::' } as AccessKey
    assert.equal(keyAllows(key, WRITE, levelOf), true)
    assert.equal(keyAllows({ ...key, resources: 'demo$user:pre:::' } as AccessKey, WRITE, levelOf), false)
})
