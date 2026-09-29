import { test, expect, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

/*
    The `nettools` DCE against a real core (plan: plans/completed/nettools/PLAN.md, S1.10).

    It needs the dev core with the DCE loaded (kwirth-dev.json → dces.nettools). What is checked here is
    what only a running core can answer — that the package the build produces is loaded, that it is
    back only, and that a consumer's declared version is honoured against it. What the tools DO is the
    DCE's own harness: 60 unit tests that need no network.

    There is no HTTP way to call a DCE, and that is by design: a DCE is consumed in-process by another
    extension, with getDce(). Pinging from here would be testing Playwright, not Kwirth.

    NON-destructive: the only thing it installs is a theme with the `e2e-nettools-` prefix, removed at
    the end even on failure. Nothing that is already installed is touched.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
const PASS = process.env.KWIRTH_E2E_PASS ?? ''

const DCE_ID = 'nettools'
const CONSUMER_ID = 'e2e-nettools-consumer'

interface IAccessKey { id: string, type: string, resources: string }
interface IDceListed {
    id: string
    version: string
    hasBack: boolean
    hasFront: boolean
    requiresRestart: boolean
    back?: { state: string, instance?: { id: string } }
}

/** A tgz with a package.json and the given files, built with the system tar, like a real package. */
const makeTgz = (files: Record<string, string>): Buffer => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-e2e-nettools-'))
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content)
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    const buffer = fs.readFileSync(tgz)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(tgz, { force: true })
    return buffer
}

/** A theme is the lightest extension that can declare `requiresExtension`, so it stands in for a consumer. */
const consumerTgz = (requires: string[]): Buffer => makeTgz({
    'package.json': JSON.stringify({
        name: `@e2e/kwirth-theme-${CONSUMER_ID}`, id: CONSUMER_ID, version: '1.0.0',
        description: 'e2e nettools consumer', extensionType: 'theme', requiresExtension: requires
    }),
    'front.js': `window.__kwirth_themes__ = window.__kwirth_themes__ || {}; window.__kwirth_themes__['${CONSUMER_ID}'] = { displayName: '${CONSUMER_ID}', getThemeOptions: () => ({}) }`
})

test.describe.configure({ mode: 'serial' })

test.describe('dce nettools: loaded, back only, and consumable by version', () => {
    let api: APIRequestContext
    let auth: Record<string, string>

    test.beforeAll(async ({ playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const login = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(login.status(), 'login against the back end').toBe(200)
        const key = (await login.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
    })

    test.afterAll(async () => {
        // Only ours goes, and it goes whatever happened. The DCE itself is never removed: it is not ours.
        await api.delete(`/core/themes/${CONSUMER_ID}`, { headers: auth }).catch(() => {})
        await api.dispose()
    })

    const listed = async (): Promise<IDceListed | undefined> => {
        const res = await api.get('/core/dce', { headers: auth })
        expect(res.status()).toBe(200)
        return ((await res.json()) as IDceListed[]).find(dce => dce.id === DCE_ID)
    }

    test('the DCE is installed and its factory ran: the instance carries its own id', async () => {
        const nettools = await listed()
        expect(nettools, 'nettools is not installed — is it in back/kwirth-dev.json?').toBeTruthy()
        expect(nettools?.back?.state, 'the factory failed at load').toBe('loaded')
        expect(nettools?.back?.instance?.id).toBe(DCE_ID)
        expect(nettools?.requiresRestart, 'forced true for every DCE').toBe(true)
        expect(nettools?.version).toMatch(/^\d+\.\d+\.\d+$/)
    })

    test('🔴 it is back only: no front is declared and none is served', async () => {
        const nettools = await listed()
        expect(nettools?.hasBack).toBe(true)
        expect(nettools?.hasFront, 'a front slipped into a back-only DCE').toBe(false)
        expect((await api.get(`/core/dce/${DCE_ID}/front`)).status()).toBe(404)
    })

    test('a consumer that requires the version installed goes in', async () => {
        const res = await api.post('/core/themes/upload', {
            headers: { ...auth, 'Content-Type': 'application/octet-stream' },
            data: consumerTgz([`dce:${DCE_ID}:0.1.0`])
        })
        expect(res.status(), await res.text()).toBe(200)

        const themes = await (await api.get('/core/themes', { headers: auth })).json()
        expect(themes.some((theme: { id: string }) => theme.id === CONSUMER_ID)).toBe(true)
        expect((await api.delete(`/core/themes/${CONSUMER_ID}`, { headers: auth })).status()).toBe(200)
    })

    test('🔴 a consumer that asks for a version this DCE does not reach is refused, and the message says so', async () => {
        const res = await api.post('/core/themes/upload', {
            headers: { ...auth, 'Content-Type': 'application/octet-stream' },
            data: consumerTgz([`dce:${DCE_ID}:9.0.0`])
        })
        expect(res.status()).toBe(500)
        expect((await res.json()).error).toMatch(new RegExp(`dce '${DCE_ID}'`))
        expect((await res.json()).error).toMatch(/9\.0\.0/)

        const themes = await (await api.get('/core/themes', { headers: auth })).json()
        expect(themes.some((theme: { id: string }) => theme.id === CONSUMER_ID), 'nothing was installed').toBe(false)
    })
})
