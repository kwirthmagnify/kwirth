import { test } from 'node:test'
import assert from 'node:assert/strict'
import { githubIdentityFromToken } from '../src/github'

const API = 'https://api.github.com'

// enruta el fetch mock por path del recurso GitHub
function mockGithub(user: any, emails: any, opts: { emailsFail?: boolean } = {}) {
    global.fetch = (async (url: any) => {
        const u = String(url)
        if (u.endsWith('/user')) return { ok: true, json: async () => user }
        if (u.endsWith('/user/emails')) {
            if (opts.emailsFail) return { ok: false, status: 403, json: async () => ({}) }
            return { ok: true, json: async () => emails }
        }
        return { ok: false, status: 404, json: async () => ({}) }
    }) as any
}

test('elige el email primary verificado y name/sub', async () => {
    mockGithub(
        { login: 'octocat', name: 'The Octocat', id: 583231 },
        [
            { email: 'secondary@x.com', primary: false, verified: true },
            { email: 'octo@github.com', primary: true, verified: true }
        ]
    )
    const id = await githubIdentityFromToken(API, 'tok')
    assert.equal(id.email, 'octo@github.com')
    assert.equal(id.emailVerified, true)
    assert.equal(id.name, 'The Octocat')
    assert.equal(id.sub, '583231')
})

test('email primary NO verificado → emailVerified false', async () => {
    mockGithub(
        { login: 'octocat', id: 1 },
        [{ email: 'octo@github.com', primary: true, verified: false }]
    )
    const id = await githubIdentityFromToken(API, 'tok')
    assert.equal(id.email, 'octo@github.com')
    assert.equal(id.emailVerified, false)
    assert.equal(id.name, 'octocat', 'name cae a login si no hay name')
})

test('si /user/emails falla, cae al email público de /user (no verificado)', async () => {
    mockGithub({ login: 'octocat', email: 'public@x.com', id: 2 }, [], { emailsFail: true })
    const id = await githubIdentityFromToken(API, 'tok')
    assert.equal(id.email, 'public@x.com')
    assert.equal(id.emailVerified, false)
})

test('apiBaseUrl con barra final se normaliza (GHE .../api/v3/)', async () => {
    let calledUser = ''
    global.fetch = (async (url: any) => {
        const u = String(url)
        if (u.endsWith('/user')) { calledUser = u; return { ok: true, json: async () => ({ login: 'x', id: 9 }) } }
        return { ok: true, json: async () => [] }
    }) as any
    await githubIdentityFromToken('https://ghe.corp/api/v3/', 'tok')
    assert.equal(calledUser, 'https://ghe.corp/api/v3/user', 'sin doble barra')
})
