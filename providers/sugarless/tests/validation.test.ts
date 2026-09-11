import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateConfig } from '../src/common/Validation'
import { MIN_INTERVAL_SECONDS, REQUEST_TIMEOUT_MS } from '../src/common/Sugarless'
import { testConfig } from './fixtures'

const errorsFor = (overrides: Parameters<typeof testConfig>[0]): string[] =>
    validateConfig(testConfig(overrides))

test('a complete configuration is valid', () => {
    assert.deepEqual(errorsFor({}), [])
})

test('rejects a missing configuration', () => {
    assert.deepEqual(validateConfig(undefined), ['No configuration provided'])
})

test('requires an email that looks like one', () => {
    assert.match(errorsFor({ email: '' }).join(' '), /Email is required/)
    assert.match(errorsFor({ email: '   ' }).join(' '), /Email is required/)
    assert.match(errorsFor({ email: 'not-an-email' }).join(' '), /does not look like an email/)
    assert.match(errorsFor({ email: 'a@b' }).join(' '), /does not look like an email/)
    assert.deepEqual(errorsFor({ email: 'a.b+tag@c.example.com' }), [])
})

test('requires the password, with no "empty means keep the stored one" exception', () => {
    // El secreto viaja entero al dialogo y vuelve entero, asi que vacio quiere decir vacio.
    assert.match(errorsFor({ password: '' }).join(' '), /Password is required/)
})

test('enforces the minimum polling interval', () => {
    assert.match(errorsFor({ intervalSeconds: 10 }).join(' '), new RegExp(`at least ${MIN_INTERVAL_SECONDS}`))
    assert.match(errorsFor({ intervalSeconds: 0 }).join(' '), /at least/)
    assert.match(errorsFor({ intervalSeconds: -5 }).join(' '), /at least/)
    assert.deepEqual(errorsFor({ intervalSeconds: MIN_INTERVAL_SECONDS }), [])
})

test('rejects a non numeric interval', () => {
    assert.match(errorsFor({ intervalSeconds: Number.NaN }).join(' '), /must be a number/)
})

test('the minimum interval leaves room for a request to finish', () => {
    /*
        Invariante entre las dos constantes, no validacion de entrada: mientras el minimo permitido
        sea mayor que el timeout, un ciclo no puede pisar al siguiente. La comprobacion de
        'shorter than the request timeout' que hay en Validation existe para el dia que alguien baje
        el minimo; hoy es inalcanzable, y este test es lo que avisara si deja de serlo.
    */
    assert.ok(MIN_INTERVAL_SECONDS * 1000 >= REQUEST_TIMEOUT_MS,
        `the minimum interval (${MIN_INTERVAL_SECONDS}s) must not be shorter than the request timeout (${REQUEST_TIMEOUT_MS}ms)`)

    const found = errorsFor({ intervalSeconds: 5 }).join(' ')
    assert.match(found, /at least 30 seconds/)
})

test('bounds the history size', () => {
    assert.match(errorsFor({ maxSamples: 1 }).join(' '), /at least 2/)
    assert.match(errorsFor({ maxSamples: 20001 }).join(' '), /not exceed 20000/)
    assert.match(errorsFor({ maxSamples: 10.5 }).join(' '), /whole number/)
    assert.deepEqual(errorsFor({ maxSamples: 2 }), [])
    assert.deepEqual(errorsFor({ maxSamples: 20000 }), [])
})

test('requires a version that looks like a version', () => {
    assert.match(errorsFor({ clientVersion: '' }).join(' '), /Client version is required/)
    assert.match(errorsFor({ clientVersion: 'latest' }).join(' '), /must look like 4\.16\.0/)
    assert.deepEqual(errorsFor({ clientVersion: '4.16.0' }), [])
    assert.deepEqual(errorsFor({ clientVersion: '5' }), [])
})

test('accepts an empty region and rejects one that could not be a host label', () => {
    assert.deepEqual(errorsFor({ region: '' }), [])
    assert.deepEqual(errorsFor({ region: 'eu' }), [])
    // Lo importante: que no se pueda inyectar nada en el hostname.
    assert.match(errorsFor({ region: 'eu.evil.com' }).join(' '), /short alphanumeric/)
    assert.match(errorsFor({ region: 'eu/x' }).join(' '), /short alphanumeric/)
    assert.match(errorsFor({ region: 'a'.repeat(21) }).join(' '), /short alphanumeric/)
})

test('reports every problem at once instead of one at a time', () => {
    const found = validateConfig({
        email: '',
        password: '',
        region: 'bad/region',
        intervalSeconds: 1,
        maxSamples: 0,
        clientVersion: ''
    })

    assert.ok(found.length >= 5, `expected several errors, got ${found.length}: ${found.join(' | ')}`)
})
