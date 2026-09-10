import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapOidcIdentity, tenantAllowed } from '../src/oidc'

// ---- mapOidcIdentity (C1: mapeo de claims con fallback de email y verified asumido) ----

test('mapOidcIdentity: comportamiento por defecto (sin opts) = email + email_verified', () => {
    const id = mapOidcIdentity({ email: 'a@b.com', email_verified: true, name: 'Alice', sub: '123' })
    assert.deepEqual(id, { email: 'a@b.com', emailVerified: true, name: 'Alice', sub: '123' })
})

test('mapOidcIdentity: sin email_verified → emailVerified false por defecto', () => {
    const id = mapOidcIdentity({ email: 'a@b.com' })
    assert.equal(id.emailVerified, false)
})

test('mapOidcIdentity: assumeVerified=true → verificado aunque no venga email_verified (Entra)', () => {
    const id = mapOidcIdentity({ email: 'a@b.com' }, { assumeVerified: true })
    assert.equal(id.emailVerified, true)
})

test('mapOidcIdentity: emailClaims hace fallback (email ausente → preferred_username)', () => {
    const id = mapOidcIdentity(
        { preferred_username: 'user@tenant.com', upn: 'user@tenant.com' },
        { emailClaims: ['email', 'preferred_username', 'upn'] }
    )
    assert.equal(id.email, 'user@tenant.com')
})

test('mapOidcIdentity: emailClaims respeta el orden (email gana a preferred_username)', () => {
    const id = mapOidcIdentity(
        { email: 'real@b.com', preferred_username: 'upn@b.com' },
        { emailClaims: ['email', 'preferred_username'] }
    )
    assert.equal(id.email, 'real@b.com')
})

test('mapOidcIdentity: ningún claim de email con valor → email vacío', () => {
    const id = mapOidcIdentity({ email: '' }, { emailClaims: ['email', 'preferred_username'] })
    assert.equal(id.email, '')
})

test('mapOidcIdentity: name/sub opcionales y sub a string', () => {
    const id = mapOidcIdentity({ email: 'a@b.com', sub: 42 })
    assert.equal(id.name, undefined)
    assert.equal(id.sub, '42')
})

// ---- tenantAllowed (C2: whitelist de tenants para multi-tenant) ----

test('tenantAllowed: sin allowlist → cualquier tenant permitido', () => {
    assert.equal(tenantAllowed('any-tid'), true)
    assert.equal(tenantAllowed('any-tid', []), true)
})

test('tenantAllowed: tid en la allowlist (case-insensitive) → true', () => {
    assert.equal(tenantAllowed('ABC-123', ['abc-123', 'other']), true)
})

test('tenantAllowed: tid fuera de la allowlist → false', () => {
    assert.equal(tenantAllowed('zzz', ['abc-123']), false)
})

test('tenantAllowed: allowlist no vacía y tid undefined → false', () => {
    assert.equal(tenantAllowed(undefined, ['abc-123']), false)
})
