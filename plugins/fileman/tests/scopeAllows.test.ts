import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scopeAllows } from '../src/back/index'
import { EFilemanScope, FILEMAN_SCOPES, FILEMAN_SCOPE_LADDER } from '../src/common/FilemanTypes'

/*
    The gate that decides whether a key may read or write through fileman.

    Why it exists: until now NOTHING checked it. The core's `processHttpChannelRequest` only validates
    that the key is authentic (`getKey` is authentication, not authorization), fileman declared a ladder
    it never read, and `checkAkr` —the real check— is only called when an object is attached to the
    stream. So a session opened with read could upload, delete and rename.
*/

// the channel's own ladder — the real one, not a copy, so a change there is caught here
const levelOf = (scope: string): number => FILEMAN_SCOPE_LADDER.indexOf(scope)

const USER = EFilemanScope.USER
const READ = EFilemanScope.READ
const WRITE = EFilemanScope.WRITE

const allows = (resources: string, required: string) => scopeAllows(resources, required, levelOf)

test('🔴 solo lectura NO puede escribir: es el caso que lo motiva', () => {
    assert.equal(allows('fileman$read:pre:::', READ), true)
    assert.equal(allows('fileman$read:pre:::', WRITE), false)
})

// The ladder already meant this: write sits above read, so granting write grants reading too and
// nobody has to be given both.
test('quien puede escribir puede leer, sin concederle los dos', () => {
    assert.equal(allows('fileman$write:pre:::', READ), true)
    assert.equal(allows('fileman$write:pre:::', WRITE), true)
})

test('cluster y admin estan por encima de write y pasan', () => {
    for (const scope of ['cluster', 'admin']) {
        assert.equal(allows(`${scope}::::`, WRITE), true, `'${scope}' deberia pasar`)
        assert.equal(allows(`${scope}::::`, READ), true, `'${scope}' deberia pasar`)
    }
})

test('sin scope, con recursos vacios o con un scope desconocido no se concede nada', () => {
    for (const resources of ['::::', '', 'log$view:pre:::', 'fileman$inventado:pre:::']) {
        assert.equal(allows(resources, READ), false, `'${resources}' no deberia leer`)
        assert.equal(allows(resources, WRITE), false, `'${resources}' no deberia escribir`)
    }
})

/*
    Several resources are OR'd and the HIGHEST scope wins, which is what the core's getScopeLevel does.
    This is the "read in pro, write in pre" grant, and it is also the honest limit of this gate: it
    answers about the VERB, so here write passes for everything, not only for 'pre'. The target is a
    separate piece of work.
*/
test('varios recursos se combinan con OR y gana el scope mas alto', () => {
    const mixto = 'fileman$read:pro:::;fileman$write:pre:::'
    assert.equal(allows(mixto, READ), true)
    assert.equal(allows(mixto, WRITE), true)
})

test('una lista de scopes en el mismo recurso tambien se recorre entera', () => {
    assert.equal(allows('log$view,fileman$write:pre:::', WRITE), true)
    assert.equal(allows('log$view,fileman$read:pre:::', WRITE), false)
})

/*
    ── los tres niveles ──────────────────────────────────────────────────────────────────────────────

    'user' opens the channel and browses; 'read' opens files; 'write' modifies the filesystem. Each one
    grants the ones below, so nobody has to be given the three.
*/

test('🔴 user abre y navega, pero NI lee NI escribe', () => {
    assert.equal(allows('fileman$user:pre:::', USER), true)
    assert.equal(allows('fileman$user:pre:::', READ), false)
    assert.equal(allows('fileman$user:pre:::', WRITE), false)
})

test('read incluye user, y write incluye los dos', () => {
    assert.equal(allows('fileman$read:pre:::', USER), true)
    assert.equal(allows('fileman$write:pre:::', USER), true)
    assert.equal(allows('fileman$write:pre:::', READ), true)
})

/*
    'cluster' and 'admin' stay above write on purpose: they are the only ones who could open File
    Manager before the catalogue existed, and dropping them out of the ladder would lock out every
    current user the day this ships (plans/completed/channel-start-rbac/PLAN.md §5).
*/
test('🔴 cluster y admin siguen por encima: nadie se queda fuera al publicar esto', () => {
    for (const scope of ['cluster', 'admin']) {
        assert.equal(allows(`${scope}::::`, USER), true, `'${scope}' deberia poder abrir`)
        assert.equal(allows(`${scope}::::`, WRITE), true, `'${scope}' deberia poder escribir`)
    }
})

test('el catalogo declara exactamente los tres, y todos estan en la escalera', () => {
    assert.deepEqual(FILEMAN_SCOPES.map(s => s.scope), [USER, READ, WRITE])
    for (const s of FILEMAN_SCOPES) {
        assert.ok(FILEMAN_SCOPE_LADDER.includes(s.scope), `'${s.scope}' se ofrece pero no esta en la escalera`)
        assert.ok(s.label.trim().length > 0 && s.description.trim().length > 0, `'${s.scope}' sin etiqueta o descripcion`)
    }
})
