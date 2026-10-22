import { test, expect, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { ISignupRequest } from '@kwirthmagnify/kwirth-common'

/*
    Signup through the REAL dev core (plan: plans/signup/PLAN.md, S2). The whole flow, callback included,
    is pinned in the back end's harness (tests/api/Signup.test.ts) with a fake IdP; a real IdP round trip
    cannot be automated here. What this checks is what only the running core can tell: that the routes are
    mounted where the front end will call them, that the admin API is behind the admin scope, and that the
    public endpoints refuse a code nobody was given.

    NON-destructive: it creates no request and touches none. Approve/reject/delete are only aimed at an id
    that does not exist.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
const PASS = process.env.KWIRTH_E2E_PASS ?? ''
const NOBODY = encodeURIComponent('e2e-signup-nobody@example.com')

interface IAccessKey { id: string, type: string, resources: string }

test.describe.configure({ mode: 'serial' })

test.describe('signup: the API on the running core', () => {
    let api: APIRequestContext
    let auth: Record<string, string>

    test.beforeAll(async ({ playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const login = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(login.status(), 'admin login against the back end').toBe(200)
        const key = (await login.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
    })

    test.afterAll(async () => {
        await api.dispose()
    })

    test('GET /core/signups needs a key, and with the admin one answers a list', async () => {
        expect((await api.get('/core/signups')).status()).toBe(403)
        const res = await api.get('/core/signups', { headers: auth })
        expect(res.status()).toBe(200)
        const all = await res.json() as ISignupRequest[]
        expect(Array.isArray(all)).toBe(true)
    })

    test('approve, reject and delete of a request that does not exist → 404', async () => {
        expect((await api.post(`/core/signups/${NOBODY}/approve`, { headers: auth, data: { resources: '' } })).status()).toBe(404)
        expect((await api.post(`/core/signups/${NOBODY}/reject`, { headers: auth })).status()).toBe(404)
        expect((await api.delete(`/core/signups/${NOBODY}`, { headers: auth })).status()).toBe(404)
    })

    test('the public endpoints answer without a key, and refuse a code nobody was given', async () => {
        expect((await api.post('/core/auth/signup/info', { data: { code: 'e2e-bogus' } })).status()).toBe(404)
        expect((await api.post('/core/auth/signup', { data: { code: 'e2e-bogus', name: 'e2e' } })).status()).toBe(404)
    })
})
