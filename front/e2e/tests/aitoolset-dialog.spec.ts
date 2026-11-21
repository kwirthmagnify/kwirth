import { APIRequestContext, Locator, Page } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect } from './fixtures'
import { clickExtensionMenuItem, dismissOpenDialogs, USER, PASS } from './helpers'

/*
    The AI toolset dialog, Grants and Settings in tabs (plans/extension-config, S9): Settings drawn from the
    toolset's configSchema with its defaults, the password masked behind the eye and REAL, a refused field
    marked with the tab saying so and the dialog kept open, Cancel discarding, ONE Save storing both tabs,
    and a toolset that declares no settings showing the tab disabled with its reason.

    Both toolsets are fixtures written here (one tool, they talk to nothing) uploaded through the API.
    Non-destructive: they were not there before, and afterAll removes them with their settings and grants.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const DIALOG = /Manage AI toolsets/i

interface IAccessKey { id: string, type: string, resources: string }
interface IFixture { id: string, label: string, schema: string }

const WITH: IFixture = {
    id: 'e2e-ts-settings', label: 'E2E Toolset Settings', schema: `configSchema: [
        { name: 'namespace', label: 'Namespace', required: true, default: 'default' },
        { name: 'mode', label: 'Mode', type: 'select', options: ['plan', 'apply'], default: 'plan' },
        { name: 'token', label: 'Token', type: 'password' }
    ],`
}
const WITHOUT: IFixture = { id: 'e2e-ts-nosettings', label: 'E2E Toolset No Settings', schema: '' }

const tgzOf = (fx: IFixture): Buffer => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kwirth-e2e-${fx.id}-`))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: fx.id, name: `@e2e/kwirth-aitoolset-${fx.id}`, displayName: fx.label, version: '0.1.0', description: 'e2e toolset', extensionType: 'aitoolset' }))
    fs.writeFileSync(path.join(dir, 'back.js'), `module.exports.default = {
        id: '${fx.id}', version: '0.1.0', displayName: '${fx.label}', description: 'e2e', requires: [], ${fx.schema}
        tools: [{ name: 'echo', description: 'echo', effect: 'read', sensitivity: 'public', inputSchema: {}, execute: async (args, host) => host.config }]
    }`)
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    return fs.readFileSync(tgz)
}

test.describe.configure({ mode: 'serial' })

test.describe('AI toolset dialog: Grants and Settings tabs', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string> = {}

    const settingsOf = async () => (await api.get(`/core/aitoolsets/${WITH.id}/config`, { headers: auth })).json()
    const grantsOf = async () => ((await (await api.get('/core/aitoolsets/grants', { headers: auth })).json()) as Record<string, { pluginId: string }[]>)[WITH.id]

    const manager = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    // THIS toolset's gear: the nearest ancestor of its name holding it
    const open = async (fx: IFixture): Promise<Locator> => {
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'AI toolsets')
        await expect(manager()).toBeVisible({ timeout: 40000 })
        await manager().getByText(fx.label, { exact: true }).first()
            .locator('xpath=ancestor::*[.//span[@aria-label="Configure"]][1]')
            .locator('span[aria-label="Configure"] button').first().click()
        const dlg = page.getByRole('dialog').filter({ hasText: `AI toolset: ${fx.label}` })
        await expect(dlg).toBeVisible({ timeout: 20000 })
        return dlg
    }

    test.beforeAll(async ({ kwirth, playwright }) => {
        test.setTimeout(120000)
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
        const installed = await (await api.get('/core/aitoolsets', { headers: auth })).json() as { id: string }[]
        for (const fx of [WITH, WITHOUT]) {
            expect(installed.some(t => t.id === fx.id), `'${fx.id}' must not be there before`).toBe(false)
            const up = await api.post('/core/aitoolsets/upload', { headers: { ...auth, 'content-type': 'application/octet-stream' }, data: tgzOf(fx) })
            expect(up.status(), await up.text()).toBe(200)
        }
        page = kwirth
    })

    // La pagina es de la CORRIDA, no de este fichero: se deja limpia, no se cierra.
    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        for (const fx of [WITH, WITHOUT]) await api?.delete(`/core/aitoolsets/${fx.id}?deleteConfig=true`, { headers: auth }).catch(() => undefined)
        await api?.dispose()
    })

    test('🔴 no settings declared: the Settings tab is THERE, disabled, and says why', async () => {
        const dlg = await open(WITHOUT)
        const tab = dlg.getByRole('tab', { name: 'Settings', exact: true })
        await expect(tab).toBeVisible()
        await expect(tab).toBeDisabled()
        await tab.hover()
        await expect(page.getByRole('tooltip')).toHaveText('This toolset declares no settings')
        await dlg.getByRole('button', { name: 'Cancel' }).click()
        await expect(dlg).toHaveCount(0)
    })

    test('🔴 with settings: the tab draws the schema with its defaults', async () => {
        const dlg = await open(WITH)
        await expect(dlg.getByRole('tab', { name: 'Grants' })).toHaveAttribute('aria-selected', 'true')
        await dlg.getByRole('tab', { name: 'Settings' }).click()
        await expect(dlg.getByLabel(/^Namespace/)).toHaveValue('default')
        await expect(dlg.getByLabel(/^Token/)).toHaveValue('')
        await dlg.getByRole('button', { name: 'Cancel' }).click()
    })

    test('🔴 a required field emptied is marked, the tab says so, the dialog stays open and nothing is saved', async () => {
        const dlg = await open(WITH)
        await dlg.getByRole('tab', { name: 'Settings' }).click()
        await dlg.getByLabel(/^Namespace/).fill('')
        await dlg.getByRole('button', { name: 'Save' }).click()
        await expect(dlg.getByTestId('config-field-errors')).toContainText("'Namespace' is required")
        await expect(dlg.getByRole('tab', { name: /^Settings \(errors\)/ })).toBeVisible()
        await expect(dlg).toBeVisible()
        expect(await settingsOf()).toEqual({ namespace: 'default', mode: 'plan' })
        await dlg.getByRole('button', { name: 'Cancel' }).click()
    })

    test('Cancel discards what was typed', async () => {
        const dlg = await open(WITH)
        await dlg.getByRole('tab', { name: 'Settings' }).click()
        await dlg.getByLabel(/^Namespace/).fill('typed-and-cancelled')
        await dlg.getByRole('button', { name: 'Cancel' }).click()
        await expect(dlg).toHaveCount(0)
        expect(await settingsOf()).toEqual({ namespace: 'default', mode: 'plan' })
    })

    test('🔴 ONE Save stores both tabs: a grant and the settings, the token REAL', async () => {
        const dlg = await open(WITH)
        // the first plugin row, whichever it is
        const all = dlg.getByRole('switch', { name: / all tools$/ }).first()
        const pluginId = ((await all.getAttribute('aria-label')) ?? '').replace(/ all tools$/, '')
        await all.click()
        await dlg.getByRole('tab', { name: 'Settings' }).click()
        await dlg.getByLabel(/^Namespace/).fill('apps')
        await dlg.getByLabel(/^Token/).fill('e2e-token')
        await dlg.getByRole('button', { name: 'Save' }).click()
        await expect(dlg).toHaveCount(0, { timeout: 20000 })
        expect(await settingsOf()).toEqual({ namespace: 'apps', mode: 'plan', token: 'e2e-token' })
        expect((await grantsOf())?.map(g => g.pluginId)).toEqual([pluginId])
    })

    test('🔴 reopened: the values come back, the token masked, and the eye shows the REAL one', async () => {
        const dlg = await open(WITH)
        await dlg.getByRole('tab', { name: 'Settings' }).click()
        await expect(dlg.getByLabel(/^Namespace/)).toHaveValue('apps')
        const token = dlg.getByLabel(/^Token/)
        await expect(token).toHaveAttribute('type', 'password')
        await expect(token).toHaveValue('e2e-token')
        await dlg.getByRole('button', { name: /show/i }).first().click()
        await expect(token).toHaveAttribute('type', 'text')
        await dlg.getByRole('button', { name: 'Cancel' }).click()
    })
})
