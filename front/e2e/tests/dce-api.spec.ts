import { test, expect, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

/*
    The `dce` type through its API (plan: plans/completed/dce/PLAN.md, S1). No UI yet: the manager dialog is S2.

    It needs the dev core with the sample DCE loaded (kwirth-dev.json → dces.sample). What is checked
    is the type's own rules, end to end against a real core:

      · the sample is installed, its back end LOADED, and its front.js is served
      · a DCE uploaded as a tgz is loaded hot, and its front is served
      · RF8: a consumer requiring a DCE that is not there is refused, with the reason
      · RF9: a DCE somebody requires is not uninstalled (409, naming who); free, it is

    NON-destructive: everything it installs carries the `e2e-dce-` prefix and is removed at the end,
    even on failure. The consumer is a THEME, the lightest extension that can declare requiresExtension.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
const PASS = process.env.KWIRTH_E2E_PASS ?? ''

const DCE_ID = 'e2e-dce-test'
const CONSUMER_ID = 'e2e-dce-consumer'

interface IAccessKey { id: string, type: string, resources: string }

/** A tgz with a package.json and the given files, built with the system tar, like a real package. */
const makeTgz = (files: Record<string, string>): Buffer => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-e2e-dce-'))
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content)
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    const buffer = fs.readFileSync(tgz)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.rmSync(tgz, { force: true })
    return buffer
}

const dceTgz = (id: string, version = '1.0.0'): Buffer => makeTgz({
    'package.json': JSON.stringify({ id, name: `@e2e/kwirth-dce-${id}`, version, description: 'e2e dce', extensionType: 'dce' }),
    'back.js': `module.exports.default = { create: async (host) => { host.logger.info('e2e dce created'); return { id: host.id, hello: () => 'hi' } } }`,
    'front.js': `window.__kwirth_dce_factories__ = window.__kwirth_dce_factories__ || {}; window.__kwirth_dce_factories__['${id}'] = { create: () => ({ id: '${id}' }) }`
})

const themeTgz = (id: string, requires: string[]): Buffer => makeTgz({
    'package.json': JSON.stringify({ id, name: `@e2e/kwirth-theme-${id}`, version: '1.0.0', description: 'e2e consumer', extensionType: 'theme', requiresExtension: requires }),
    'front.js': `window.__kwirth_themes__ = window.__kwirth_themes__ || {}; window.__kwirth_themes__['${id}'] = { displayName: '${id}', getThemeOptions: () => ({}) }`
})

test.describe.configure({ mode: 'serial' })

test.describe('dce: the type through its API', () => {
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
        // Whatever happened, nothing of ours stays: the consumer first, or the DCE refuses to go.
        await api.delete(`/core/themes/${CONSUMER_ID}`, { headers: auth }).catch(() => {})
        await api.delete(`/core/dce/${DCE_ID}`, { headers: auth }).catch(() => {})
        await api.dispose()
    })

    const upload = (route: string, body: Buffer) =>
        api.post(route, { headers: { ...auth, 'Content-Type': 'application/octet-stream' }, data: body })

    test('the sample DCE is installed, its back end LOADED, and its front is served', async () => {
        const res = await api.get('/core/dce', { headers: auth })
        expect(res.status()).toBe(200)
        const sample = (await res.json()).find((m: { id: string }) => m.id === 'sample')
        expect(sample, 'the sample DCE from kwirth-dev.json').toBeTruthy()
        expect(sample.hasBack).toBe(true)
        expect(sample.hasFront).toBe(true)
        expect(sample.requiresRestart, 'forced true for every DCE').toBe(true)
        expect(sample.back?.state).toBe('loaded')

        const front = await api.get('/core/dce/sample/front')
        expect(front.status()).toBe(200)
        expect(front.headers()['content-type']).toContain('javascript')
        // The bundle reads the registry's name from common at runtime, so what is pinned is the registration itself.
        expect(await front.text()).toMatch(/DCE_FRONT_FACTORIES|__kwirth_dce_factories__/)
        expect(await front.text()).toContain('factories["sample"]')
    })

    test('a DCE uploaded as a tgz is loaded hot and served', async () => {
        const res = await upload('/core/dce/upload', dceTgz(DCE_ID))
        expect(res.status(), await res.text()).toBe(200)
        const meta = await res.json()
        expect(meta.id).toBe(DCE_ID)
        expect(meta.version).toBe('1.0.0')

        const listed = (await (await api.get('/core/dce', { headers: auth })).json()).find((m: { id: string }) => m.id === DCE_ID)
        expect(listed.back?.state).toBe('loaded')
        expect(await (await api.get(`/core/dce/${DCE_ID}/front`)).text()).toContain(`'${DCE_ID}'`)
    })

    test('🔴 RF8: a consumer requiring a DCE that is not there is refused, and the message says which', async () => {
        const res = await upload('/core/themes/upload', themeTgz(CONSUMER_ID, ['dce:e2e-dce-missing:1.0.0']))
        expect(res.status()).toBe(500)
        expect((await res.json()).error).toMatch(/Theme 'e2e-dce-consumer' cannot be installed: Required dce 'e2e-dce-missing' \(>=1\.0\.0\) is not installed/)
        const themes = await (await api.get('/core/themes', { headers: auth })).json()
        expect(themes.some((t: { id: string }) => t.id === CONSUMER_ID), 'nothing was installed').toBe(false)
    })

    /*
        RF12: a pack carries a DCE and a consumer of it, listed in the WORST order — the consumer first.

        Kwirth has to reorder the members, install the DCE before the consumer, and undo it the other way
        round when the pack is removed. Without that, this very pack would fail to install, and the error
        would blame the consumer for a dependency the pack itself brings.
    */
    test('🔴 RF12: a pack installs its DCE before the consumer that requires it, listed the wrong way round', async () => {
        const PACK_ID = 'e2e-dce-pack'
        const packDce = 'e2e-pack-dce'
        const packConsumer = 'e2e-pack-consumer'
        const dceTgzName = 'member-dce.tgz'
        const consumerTgzName = 'member-consumer.tgz'

        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-e2e-pack-'))
        fs.writeFileSync(path.join(dir, dceTgzName), dceTgz(packDce))
        fs.writeFileSync(path.join(dir, consumerTgzName), themeTgz(packConsumer, [`dce:${packDce}:1.0.0`]))
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
            name: `@e2e/${PACK_ID}`, id: PACK_ID, displayName: 'E2E DCE pack', version: '1.0.0',
            description: 'e2e', extensionType: 'pack'
        }))
        // The consumer FIRST: this is the order that only works if kwirth reorders.
        fs.writeFileSync(path.join(dir, 'pack.json'), JSON.stringify({
            extensions: [
                { extensionType: 'theme', id: packConsumer, tgz: consumerTgzName },
                { extensionType: 'dce', id: packDce, tgz: dceTgzName }
            ]
        }))
        const packTgz = `${dir}.tgz`
        execFileSync('tar', ['-czf', packTgz, '-C', dir, '.'])
        const body = fs.readFileSync(packTgz)
        fs.rmSync(dir, { recursive: true, force: true })
        fs.rmSync(packTgz, { force: true })

        try {
            const res = await upload('/core/packs/upload', body)
            expect(res.status(), await res.text()).toBe(200)

            // Both members are in, and the DCE is loaded — it was installed first.
            const dces = await (await api.get('/core/dce', { headers: auth })).json()
            const installedDce = dces.find((d: { id: string }) => d.id === packDce)
            expect(installedDce, 'the pack did not install its DCE').toBeTruthy()
            expect(installedDce.back?.state).toBe('loaded')
            expect(installedDce.installedFrom).toBe(`pack:${PACK_ID}`)

            const themes = await (await api.get('/core/themes', { headers: auth })).json()
            expect(themes.some((t: { id: string }) => t.id === packConsumer), 'the consumer was refused').toBe(true)

            // And a pack-owned DCE is not removed on its own: the pack owns it.
            const refused = await api.delete(`/core/dce/${packDce}`, { headers: auth })
            expect(refused.status(), 'a DCE in use by its own pack was removed').toBe(409)
        }
        finally {
            // Uninstalling the pack takes both, in the opposite order: the DCE goes last.
            await api.delete(`/core/packs/${PACK_ID}`, { headers: auth }).catch(() => {})
        }

        const dcesAfter = await (await api.get('/core/dce', { headers: auth })).json()
        expect(dcesAfter.some((d: { id: string }) => d.id === packDce), 'the pack left its DCE behind').toBe(false)
        const themesAfter = await (await api.get('/core/themes', { headers: auth })).json()
        expect(themesAfter.some((t: { id: string }) => t.id === packConsumer), 'the pack left its consumer behind').toBe(false)
    })

    test('🔴 RF9: a DCE somebody requires is not uninstalled, and names who; free, it goes', async () => {
        const installed = await upload('/core/themes/upload', themeTgz(CONSUMER_ID, [`dce:${DCE_ID}:1.0.0`]))
        expect(installed.status(), await installed.text()).toBe(200)

        const refused = await api.delete(`/core/dce/${DCE_ID}`, { headers: auth })
        expect(refused.status()).toBe(409)
        expect((await refused.json()).error).toMatch(new RegExp(`DCE '${DCE_ID}' is in use and cannot be uninstalled: required by theme '${CONSUMER_ID}' \\(dce:${DCE_ID}:1\\.0\\.0\\)`))
        // still there
        expect((await (await api.get('/core/dce', { headers: auth })).json()).some((m: { id: string }) => m.id === DCE_ID)).toBe(true)

        expect((await api.delete(`/core/themes/${CONSUMER_ID}`, { headers: auth })).status()).toBe(200)
        expect((await api.delete(`/core/dce/${DCE_ID}`, { headers: auth })).status()).toBe(200)
        expect((await (await api.get('/core/dce', { headers: auth })).json()).some((m: { id: string }) => m.id === DCE_ID)).toBe(false)
        expect((await api.get(`/core/dce/${DCE_ID}/front`)).status()).toBe(404)
    })
})
