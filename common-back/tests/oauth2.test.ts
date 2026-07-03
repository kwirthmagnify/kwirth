import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oauth2BuildAuthorizationUrl, oauth2HandleCallback, IOAuth2Endpoints } from '../src/oauth2'

const EP: IOAuth2Endpoints = {
    authorizationEndpoint: 'https://idp.test/login/oauth/authorize',
    tokenEndpoint: 'https://idp.test/login/oauth/access_token',
    defaultScopes: 'read:user user:email'
}
const CONFIG = { clientId: 'cid', clientSecret: 'sec' }
const AUTH_CTX = { redirectUri: 'https://kwirth/cb', state: 'st4te', codeChallenge: 'chal' }
const CB_CTX = { code: 'thecode', codeVerifier: 'ver', redirectUri: 'https://kwirth/cb' }

test('oauth2BuildAuthorizationUrl arma la URL (state + scope, sin PKCE por defecto)', () => {
    const u = new URL(oauth2BuildAuthorizationUrl(CONFIG, AUTH_CTX, EP))
    assert.equal(u.origin + u.pathname, 'https://idp.test/login/oauth/authorize')
    assert.equal(u.searchParams.get('client_id'), 'cid')
    assert.equal(u.searchParams.get('redirect_uri'), 'https://kwirth/cb')
    assert.equal(u.searchParams.get('response_type'), 'code')
    assert.equal(u.searchParams.get('state'), 'st4te')
    assert.equal(u.searchParams.get('scope'), 'read:user user:email')
    assert.equal(u.searchParams.get('code_challenge'), null, 'sin PKCE por defecto')
})

test('oauth2BuildAuthorizationUrl incluye PKCE si usePkce=true', () => {
    const u = new URL(oauth2BuildAuthorizationUrl(CONFIG, AUTH_CTX, { ...EP, usePkce: true }))
    assert.equal(u.searchParams.get('code_challenge'), 'chal')
    assert.equal(u.searchParams.get('code_challenge_method'), 'S256')
})

test('oauth2BuildAuthorizationUrl usa config.scopes si viene', () => {
    const u = new URL(oauth2BuildAuthorizationUrl({ ...CONFIG, scopes: 'custom' }, AUTH_CTX, EP))
    assert.equal(u.searchParams.get('scope'), 'custom')
})

test('oauth2HandleCallback intercambia code→token y delega en fetchIdentity', async () => {
    let calledUrl = '', sentBody = ''
    global.fetch = (async (url: any, init: any) => {
        calledUrl = String(url); sentBody = String(init.body)
        assert.equal(init.headers['Accept'], 'application/json')
        return { ok: true, json: async () => ({ access_token: 'TOK' }) }
    }) as any

    let gotToken = ''
    const id = await oauth2HandleCallback(CONFIG, CB_CTX, EP, async (t) => {
        gotToken = t
        return { email: 'a@b.c', emailVerified: true }
    })
    assert.equal(calledUrl, EP.tokenEndpoint)
    assert.match(sentBody, /grant_type=authorization_code/)
    assert.match(sentBody, /code=thecode/)
    assert.match(sentBody, /client_id=cid/)
    assert.equal(sentBody.includes('code_verifier'), false, 'sin PKCE no manda code_verifier')
    assert.equal(gotToken, 'TOK')
    assert.deepEqual(id, { email: 'a@b.c', emailVerified: true })
})

test('oauth2HandleCallback manda code_verifier si usePkce=true', async () => {
    let sentBody = ''
    global.fetch = (async (_url: any, init: any) => {
        sentBody = String(init.body)
        return { ok: true, json: async () => ({ access_token: 'TOK' }) }
    }) as any
    await oauth2HandleCallback(CONFIG, CB_CTX, { ...EP, usePkce: true }, async () => ({ email: 'x', emailVerified: true }))
    assert.match(sentBody, /code_verifier=ver/)
})

test('oauth2HandleCallback lanza si el IdP devuelve error', async () => {
    global.fetch = (async () => ({ ok: true, json: async () => ({ error: 'bad_verification_code', error_description: 'nope' }) })) as any
    await assert.rejects(
        () => oauth2HandleCallback(CONFIG, CB_CTX, EP, async () => ({ email: 'x', emailVerified: true })),
        /bad token|token exchange failed|nope/i
    )
})

test('oauth2HandleCallback lanza si el token endpoint no responde 200', async () => {
    global.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as any
    await assert.rejects(
        () => oauth2HandleCallback(CONFIG, CB_CTX, EP, async () => ({ email: 'x', emailVerified: true })),
        /returned 500/
    )
})
