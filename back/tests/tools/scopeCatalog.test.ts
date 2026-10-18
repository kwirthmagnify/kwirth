import { test } from 'node:test'
import assert from 'node:assert/strict'
import { unknownScopesIn } from '../../src/tools/ScopeCatalog'
import { buildThinScope } from '@kwirthmagnify/kwirth-common'

/*
    What the core refuses to STORE in a user or an API key. It is not the door —at runtime an unknown
    scope grants nothing, because the channel's ladder answers -1— it is the warning the admin gets
    instead of granting something that would silently do nothing.
*/

const VALID = new Set(['cluster', 'admin', 'view', 'fileman$read', 'fileman$write', 'magnify$read'])
const unknown = (resources: string) => unknownScopesIn(resources, VALID)

test('un scope del catalogo se acepta y uno inventado se delata', () => {
    assert.deepEqual(unknown('fileman$read::::'), [])
    assert.deepEqual(unknown('fileman$inventado::::'), ['fileman$inventado'])
    assert.deepEqual(unknown('cluster,view,fileman$write::::'), [])
})

/*
    🔴 The one this file exists for. A thin scope is judged by the permission it narrows: without it the
    security editor composes a token that saving rejects with a 400 — a feature that works everywhere
    except where it is used.
*/
test('un scope fino vale si vale el permiso que acota', () => {
    assert.deepEqual(unknown(`${buildThinScope('fileman', 'write', '/tmp')}::::`), [])
    assert.deepEqual(unknown(`${buildThinScope('magnify', 'read', { hideKinds: ['Secret'] })}::::`), [])
    // and beside its wide form, which is the combination the editor's guard warns about but stores fine
    assert.deepEqual(unknown(`fileman$read,${buildThinScope('fileman', 'write', '/tmp')}::::`), [])
})

test('un scope fino sobre un permiso que no existe se delata', () => {
    const token = buildThinScope('fileman', 'inventado', '/tmp')
    assert.deepEqual(unknown(`${token}::::`), [token])
    const otro = buildThinScope('canalquenoexiste', 'read', '/tmp')
    assert.deepEqual(unknown(`${otro}::::`), [otro])
})

test('varios recursos se revisan todos, y no se repite el mismo aviso', () => {
    assert.deepEqual(unknown('fileman$malo:pre:::;fileman$malo:pro:::'), ['fileman$malo'])
    assert.deepEqual(unknown('cluster::::;fileman$otro::::'), ['fileman$otro'])
})

// It runs inside a route handler that answers 400 or 200. An exception here would be a 500 on saving a
// user, and the admin would have no idea which scope was the problem.
test('basura y vacios no lanzan', () => {
    for (const resources of ['', '::::', 'basura', ';;;', 'fileman#roto#!!!::::', '#::::']) {
        assert.doesNotThrow(() => unknown(resources), `'${resources}' no deberia lanzar`)
    }
    // a token that LOOKS thin but is not decodable is not a scope anybody granted: it is reported
    assert.deepEqual(unknown('fileman#roto#!!!::::'), ['fileman#roto#!!!'])
})
