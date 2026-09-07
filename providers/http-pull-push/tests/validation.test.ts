import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateConfigs } from '../src/common/Validation'
import { EAuthType, newHttpPullConfig } from '../src/common/HttpPullPush'

// La validacion vive en common porque la aplican los dos lados: el back en el PUT (un cliente puede
// saltarse el dialogo) y el front antes de guardar.

const ok = () => ({ ...newHttpPullConfig('good'), url: 'https://example.com/x' })

test('a well formed connection produces no errors', () => {
    assert.deepEqual(validateConfigs([ok()]), [])
})

test('a connection with no name is rejected', () => {
    const errors = validateConfigs([{ ...ok(), name: '   ' }])
    assert.equal(errors.length, 1)
    assert.match(errors[0], /no name/)
})

test('duplicated names are rejected', () => {
    const errors = validateConfigs([ok(), ok()])
    assert.ok(errors.some(e => e.includes("Duplicated connection name: 'good'")))
})

test('the url must be http or https', () => {
    assert.ok(validateConfigs([{ ...ok(), url: 'ftp://example.com' }]).some(e => e.includes('must start with http')))
    assert.ok(validateConfigs([{ ...ok(), url: '' }]).some(e => e.includes('must start with http')))
    assert.deepEqual(validateConfigs([{ ...ok(), url: 'http://example.com' }]), [])
})

test('interval and timeout must be positive', () => {
    assert.ok(validateConfigs([{ ...ok(), intervalSeconds: 0 }]).some(e => e.includes('interval must be greater than zero')))
    assert.ok(validateConfigs([{ ...ok(), timeoutMs: 0 }]).some(e => e.includes('timeout must be greater than zero')))
})

test('a timeout longer than the interval is rejected: the pulls would overlap', () => {
    const errors = validateConfigs([{ ...ok(), intervalSeconds: 5, timeoutMs: 10000 }])
    assert.ok(errors.some(e => e.includes('timeout is longer than the polling interval')))
})

test('each auth type demands its own fields', () => {
    assert.ok(validateConfigs([{ ...ok(), auth: { type: EAuthType.BASIC } }]).some(e => e.includes('needs a username')))
    assert.ok(validateConfigs([{ ...ok(), auth: { type: EAuthType.BEARER } }]).some(e => e.includes('needs a token')))
    assert.ok(validateConfigs([{ ...ok(), auth: { type: EAuthType.HEADER } }]).some(e => e.includes('needs a header name')))
    assert.deepEqual(validateConfigs([{ ...ok(), auth: { type: EAuthType.NONE } }]), [])
})

test('a basic auth with username but no password is allowed (empty password is legitimate)', () => {
    assert.deepEqual(validateConfigs([{ ...ok(), auth: { type: EAuthType.BASIC, username: 'u' } }]), [])
})

test('errors from several connections are all reported, naming each one', () => {
    const errors = validateConfigs([
        { ...ok(), name: 'a', url: 'nope' },
        { ...ok(), name: 'b', intervalSeconds: -1 }
    ])
    assert.ok(errors.some(e => e.startsWith("'a'")))
    assert.ok(errors.some(e => e.startsWith("'b'")))
})
