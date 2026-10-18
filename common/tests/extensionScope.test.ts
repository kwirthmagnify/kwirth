import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildThinScope, parseThinScope, isThinScope } from '../src/ExtensionScope'

/*
    The thin scope format: `channel#scope#<b64>`.

    What these tests defend is not the encoding, it is the PROPERTY the whole design rests on — that a
    token the reader does not understand grants nothing, and that nothing a channel puts in its config can
    break the accessKey it travels inside.
*/

const roundTrip = (config: unknown) => parseThinScope(buildThinScope('fileman', 'write', config))?.config

test('ida y vuelta: el canal recupera exactamente lo que metió', () => {
    // The four shapes the PRD names: a path, a regex, a list and a whole JSON object.
    assert.deepEqual(roundTrip('/tmp'), '/tmp')
    assert.deepEqual(roundTrip('^/usr/app/.*$'), '^/usr/app/.*$')
    assert.deepEqual(roundTrip(['pre', 'pro']), ['pre', 'pro'])
    assert.deepEqual(roundTrip({ path: '/usr/app', write: true, max: 3 }), { path: '/usr/app', write: true, max: 3 })
})

test('el canal y el scope se recuperan por separado, y la forma ancha ya compuesta', () => {
    const parsed = parseThinScope(buildThinScope('fileman', 'write', '/tmp'))
    assert.equal(parsed?.channel, 'fileman')
    assert.equal(parsed?.scope, 'write')
    /*
        🔴 The wide form is what the channel's LADDER is written in, so it is what getChannelScopeLevel()
        takes. It is handed over composed because every channel reading a thin scope needs it, and a step
        every consumer repeats is a step that drifts.
    */
    assert.equal(parsed?.wide, 'fileman$write')
})

/*
    🔴 The one that matters for where this is stored. `resources` is split by ';' (resources), ':'
    (fields) and ',' (scopes); a token carrying any of them would silently become two things. The base64
    alphabet has none of them, but what is asserted here is the PROPERTY, not the alphabet — so it still
    holds the day somebody changes the encoding.
*/
test('nada de lo que el canal meta puede contener un separador de resources', () => {
    const nasty = [
        'a:b;c,d#e',
        { 'key:with;every,separator#inside': 'a:b;c,d#e' },
        ['x;y', 'z,w', 'p:q', 'r#s'],
        '//comment: ; , #',
        '😀 acentuación, dos puntos: y punto y coma;'
    ]
    for (const config of nasty) {
        const token = buildThinScope('fileman', 'write', config)
        const encoded = token.split('#')[2]
        for (const sep of [';', ':', ',', '#']) {
            assert.ok(!encoded.includes(sep), `el config codificado de ${JSON.stringify(config)} contiene '${sep}'`)
        }
        assert.deepEqual(parseThinScope(token)?.config, config)
    }
})

// A non-ASCII path or label must not blow up on btoa, which only takes code points below 256.
test('el utf-8 sobrevive: acentos y emoji', () => {
    assert.equal(roundTrip('/configuración/ñandú'), '/configuración/ñandú')
    assert.equal(roundTrip('🔒'), '🔒')
})

/*
    🔴 A classic scope is NOT thin, and saying so is what keeps the two worlds apart: the wide form is
    granted by the ladder, and this parser must not claim it.
*/
test('un scope clásico no es fino', () => {
    for (const token of ['fileman$write', 'cluster', 'admin', '']) {
        assert.equal(parseThinScope(token), undefined, `'${token}'`)
        assert.equal(isThinScope(token), false, `'${token}'`)
    }
})

/*
    🔴 It NEVER throws. It is reached from async handlers, where an escaping exception becomes an
    unhandledRejection — which is what took the core down on 2026-10-16. And what arrives is not
    trustworthy: an accessKey cannot be tampered with, but one is also made BY HAND through `/key`.
*/
test('basura: devuelve undefined y NO lanza', () => {
    const garbage = [
        'fileman#write#not-base64!!',     // outside the alphabet
        'fileman#write#abc',              // valid alphabet, impossible length
        'fileman#write#' + btoa('no es json'),
        'fileman#write#',                 // empty config
        'fileman#write',                  // two parts
        'fileman#write#aaaa#bbbb',        // four parts
        '#write#' + btoa('"x"'),          // no channel
        'fileman##' + btoa('"x"'),        // no scope
        '##',
        '#',
        'fileman#write#' + btoa('{"roto":'),
        undefined as unknown as string,
        null as unknown as string,
        42 as unknown as string
    ]
    for (const token of garbage) {
        assert.doesNotThrow(() => parseThinScope(token), `'${String(token)}' no deberia lanzar`)
        assert.equal(parseThinScope(token), undefined, `'${String(token)}'`)
    }
})

/*
    Building with a broken name DOES throw, and on purpose: the names come from the channel's own
    getScopeCatalog(), never from the admin. A separator in there is a bug in the catalogue, and a token
    built from it would be unparseable later — the worst moment to discover that a PERMISSION no longer
    means what it says.
*/
test('un nombre con separador se rechaza al construir, no al leer', () => {
    for (const bad of ['file:man', 'file;man', 'file,man', 'file#man', 'file$man', '']) {
        assert.throws(() => buildThinScope(bad, 'write', '/tmp'), `canal '${bad}'`)
        assert.throws(() => buildThinScope('fileman', bad, '/tmp'), `scope '${bad}'`)
    }
})

test('un config vacío sigue siendo un token válido', () => {
    // Not the same as a broken one: the channel declared no fields, or the admin left them blank.
    assert.equal(parseThinScope(buildThinScope('fileman', 'read', null))?.config, null)
    assert.equal(parseThinScope(buildThinScope('fileman', 'read', undefined))?.config, null)
    assert.deepEqual(parseThinScope(buildThinScope('fileman', 'read', {}))?.config, {})
    assert.equal(parseThinScope(buildThinScope('fileman', 'read', ''))?.config, '')
})
