import { APIRequestContext, Locator, Page } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect } from './fixtures'
import { clickExtensionMenuItem, dismissOpenDialogs, USER, PASS } from './helpers'

/*
    The EXEC capability on the card (plans/toolset-exec, R1): a toolset that declares ECapability.EXEC shows a
    red 'exec' chip, with the warning in its tooltip, so the admin sees it BEFORE granting it; one that does
    not, shows none.

    Both toolsets are fixtures written here (one tool, they talk to nothing) uploaded through the API.
    Non-destructive: they were not there before, and afterAll removes them with their settings and grants.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const DIALOG = /Manage AI toolsets/i

interface IAccessKey { id: string, type: string, resources: string }
interface IFixture { id: string, label: string, requires: string }

const WITH_EXEC: IFixture = { id: 'e2e-ts-exec', label: 'E2E Toolset Exec', requires: "['k8s', 'exec']" }
const WITHOUT_EXEC: IFixture = { id: 'e2e-ts-noexec', label: 'E2E Toolset No Exec', requires: "['k8s']" }

const tgzOf = (fx: IFixture): Buffer => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kwirth-e2e-${fx.id}-`))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: fx.id, name: `@e2e/kwirth-aitoolset-${fx.id}`, displayName: fx.label, version: '0.1.0', description: 'e2e toolset', extensionType: 'aitoolset' }))
    fs.writeFileSync(path.join(dir, 'back.js'), `module.exports.default = {
        id: '${fx.id}', version: '0.1.0', displayName: '${fx.label}', description: 'e2e', requires: ${fx.requires},
        tools: [{ name: 'noop', description: 'noop', effect: 'read', sensitivity: 'public', inputSchema: {}, execute: async () => 'ok' }]
    }`)
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    return fs.readFileSync(tgz)
}

test.describe.configure({ mode: 'serial' })

test.describe('AI toolsets: the EXEC capability is warned about on the card', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string> = {}

    const manager = () => page.getByRole('dialog').filter({ hasText: DIALOG })
    // THIS toolset's card: the nearest ancestor of its name holding its gear
    const card = (fx: IFixture): Locator => manager().getByText(fx.label, { exact: true }).first().locator('xpath=ancestor::*[.//span[@aria-label="Configure"]][1]')

    test.beforeAll(async ({ kwirth, playwright }) => {
        test.setTimeout(120000)
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
        const installed = await (await api.get('/core/aitoolsets', { headers: auth })).json() as { id: string }[]
        for (const fx of [WITH_EXEC, WITHOUT_EXEC]) {
            expect(installed.some(t => t.id === fx.id), `'${fx.id}' must not be there before`).toBe(false)
            const up = await api.post('/core/aitoolsets/upload', { headers: { ...auth, 'content-type': 'application/octet-stream' }, data: tgzOf(fx) })
            expect(up.status(), await up.text()).toBe(200)
        }
        page = kwirth
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'AI toolsets')
        await expect(manager()).toBeVisible({ timeout: 40000 })
    })

    // La pagina es de la CORRIDA, no de este fichero: se deja limpia, no se cierra.
    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        for (const fx of [WITH_EXEC, WITHOUT_EXEC]) await api?.delete(`/core/aitoolsets/${fx.id}?deleteConfig=true`, { headers: auth }).catch(() => undefined)
        await api?.dispose()
    })

    test('the installed list carries what each toolset declares it needs, as capabilities', async () => {
        const list = await (await api.get('/core/aitoolsets', { headers: auth })).json() as { id: string, capabilities?: string[], requires?: unknown }[]
        expect(list.find(t => t.id === WITH_EXEC.id)?.capabilities).toEqual(['k8s', 'exec'])
        expect(list.find(t => t.id === WITHOUT_EXEC.id)?.capabilities).toEqual(['k8s'])
    })

    test('🔴 a toolset with EXEC shows a red exec chip, and its tooltip warns', async () => {
        const chip = card(WITH_EXEC).locator('.MuiChip-root', { hasText: /^exec$/ })
        await expect(chip).toBeVisible({ timeout: 20000 })
        await expect(chip).toHaveClass(/MuiChip-colorError/)
        await chip.hover()
        await expect(page.getByRole('tooltip')).toContainText('it can run anything in any container Kwirth reaches')
        await page.mouse.move(0, 0)
    })

    test('a toolset without EXEC shows no exec chip', async () => {
        await expect(card(WITHOUT_EXEC).getByText(WITHOUT_EXEC.label, { exact: true })).toBeVisible()
        await expect(card(WITHOUT_EXEC).locator('.MuiChip-root', { hasText: /^exec$/ })).toHaveCount(0)
    })
})
