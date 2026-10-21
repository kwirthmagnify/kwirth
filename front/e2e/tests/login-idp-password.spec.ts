import { test, expect, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'

/*
    🔴 A user bound to an IdP cannot log in with a password (plan: plans/signup/PLAN.md, S0).

    The drawer creates an IdP user with password '' and UserApi stores bcrypt(''), so before the gate a
    POST /login with that email and '' handed out an AccessKey without going through the IdP. This runs
    the real path against the dev core: the user is created exactly as the drawer does it.

    NON-destructive: the only user it creates carries the `e2e-s0-` prefix and is deleted at the end, even
    on failure. The IdP it binds to does not need to exist: the gate is on the binding, not on the IdP.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
const PASS = process.env.KWIRTH_E2E_PASS ?? ''

const IDP_USER = 'e2e-s0-idp-user@example.com'
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

interface IAccessKey { id: string, type: string, resources: string }

test.describe.configure({ mode: 'serial' })

test.describe('login: a user bound to an IdP cannot use a password', () => {
    let api: APIRequestContext
    let auth: Record<string, string>

    test.beforeAll(async ({ playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const login = await api.post('/login', { data: { user: USER, password: sha256(PASS) } })
        expect(login.status(), 'admin login against the back end').toBe(200)
        const key = (await login.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }

        // the same body ManageUserSecurity sends for an IdP user: empty password
        const created = await api.post('/user', { headers: auth, data: { id: IDP_USER, name: 'e2e S0', password: '', resources: '', idp: 'google' } })
        expect(created.status(), 'creating the IdP user').toBe(200)
    })

    test.afterAll(async () => {
        await api.delete(`/user/${IDP_USER}`, { headers: auth }).catch(() => {})
        await api.dispose()
    })

    test('🔴 POST /login with the empty password is refused (it used to return an AccessKey)', async () => {
        const res = await api.post('/login', { data: { user: IDP_USER, password: '' } })
        expect(res.status()).toBe(401)
    })

    test('POST /login with sha256 of the empty password is refused too', async () => {
        const res = await api.post('/login', { data: { user: IDP_USER, password: sha256('') } })
        expect(res.status()).toBe(401)
    })

    test('POST /login/password cannot be used to get in either', async () => {
        const res = await api.post('/login/password', { data: { user: IDP_USER, password: '', newpassword: sha256('x') } })
        expect(res.status()).toBe(401)
    })

    test('the user is still there, untouched: the gate refuses, it does not delete', async () => {
        const res = await api.get(`/user/${IDP_USER}`, { headers: auth })
        expect(res.status()).toBe(200)
        expect((await res.json()).idp).toBe('google')
    })
})
