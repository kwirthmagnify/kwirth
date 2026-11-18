import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { login, clickExtensionMenuItem, dismissOpenDialogs, USER, PASS } from './helpers'

/*
    A login extension's config through the common extension config store (plans/extension-config, S4):
    what the PACKAGE carries (login.json: layout, texts) stays apart from what the ADMIN edits (its
    configSchema, in a Secret). The page is served both, the admin's winning, and a save never wipes the
    package's layout.
    Uninstalling keeps the admin's config unless the confirmation's box is ticked (P5).

    The login is a fixture written here (package.json with a configSchema, and a login.json) and installed
    through the API. Non-destructive: there was no such login before, and afterAll uninstalls it.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const LOGIN_ID = 'e2e-config-login'
const DISPLAY = 'E2E Config Login'
const DIALOG = /Manage login extensions/i

interface IAccessKey { id: string, type: string, resources: string }

const SCHEMA = [
    { name: 'autoUser', label: 'Automatic user', type: 'text', required: true },
    { name: 'autoPassword', label: 'Automatic password', type: 'password' },
    { name: 'title', label: 'Title', type: 'text', default: 'Schema title' }
]
const LOGIN_JSON = { top: '12%', left: '34%', pageBackground: '#0a0b0c', title: 'Package title' }

const makeTgz = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-e2e-login-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: LOGIN_ID, name: `@e2e/kwirth-login-${LOGIN_ID}`, displayName: DISPLAY, version: '0.1.0', description: 'e2e login with an installation config', extensionType: 'login', configSchema: SCHEMA }))
    fs.writeFileSync(path.join(dir, 'login.json'), JSON.stringify(LOGIN_JSON))
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    return tgz
}

test.describe.configure({ mode: 'serial' })

test.describe('login extension config: the package\'s part and the admin\'s part', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string>

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })
    const configUrl = `/core/logins/${LOGIN_ID}/config`

    // THIS login's config dialog: the nearest ancestor of its name holding a gear is its card
    const openConfig = async () => {
        await clickExtensionMenuItem(page, 'Login extensions')
        await expect(dialog()).toBeVisible({ timeout: 40000 })
        await dialog().getByText(DISPLAY, { exact: true }).first()
            .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
            .locator('button[aria-label="Configure"]').first().click()
        const config = page.getByRole('dialog').filter({ hasText: `Configure — ${DISPLAY}` })
        await expect(config).toBeVisible({ timeout: 20000 })
        return config
    }

    test.beforeAll(async ({ browser, playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
        const installed = await (await api.get('/core/logins')).json() as { id: string }[]
        expect(installed.some(l => l.id === LOGIN_ID), `'${LOGIN_ID}' is already installed: a previous run did not clean up`).toBe(false)

        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        // with its config: this test brought it, and a kept config would be left behind in the cluster
        await api?.delete(`/core/logins/${LOGIN_ID}?deleteConfig=true`, { headers: auth }).catch(() => undefined)
        await page?.close()
        await api?.dispose()
    })

    test('installed through the API', async () => {
        const res = await api.post('/core/logins/upload', { headers: { ...auth, 'content-type': 'application/octet-stream' }, data: fs.readFileSync(makeTgz()) })
        expect(res.status(), await res.text()).toBe(200)
    })

    test('🔴 never configured: the page gets the package\'s login.json over the schema defaults', async () => {
        const config = await (await api.get(configUrl)).json() as Record<string, unknown>
        expect(config).toMatchObject(LOGIN_JSON)
        expect(config.autoUser).toBeUndefined()
    })

    test('🔴 a value that does not fit is a 400 naming every field, and nothing is saved', async () => {
        const res = await api.put(configUrl, { headers: auth, data: { autoPassword: 'x' } })
        expect(res.status()).toBe(400)
        expect(((await res.json()) as { fields: { field: string }[] }).fields.map(f => f.field)).toEqual(['autoUser'])
        expect(((await (await api.get(configUrl)).json()) as Record<string, unknown>).autoPassword).toBeUndefined()
    })

    test('🔴 the dialog marks the refused field and says why; editing it clears both', async () => {
        const config = await openConfig()
        await config.getByRole('button', { name: 'SAVE' }).click()
        await expect(config.getByText(`'Automatic user' is required`)).toBeVisible({ timeout: 20000 })
        const user = config.getByLabel(/^Automatic user/)
        await expect(user).toHaveAttribute('aria-invalid', 'true')
        await user.fill('typing')
        await expect(config.getByText(`'Automatic user' is required`)).toBeHidden()
        await config.getByRole('button', { name: 'CANCEL' }).click()
        await expect(config).toBeHidden({ timeout: 20000 })
        await dismissOpenDialogs(page)
    })

    test('🔴 saved from the dialog: the admin\'s values win, and the page\'s layout is still there', async () => {
        const config = await openConfig()
        await config.getByLabel(/^Automatic user/).fill('guest')
        const password = config.getByLabel('Automatic password', { exact: true })
        await password.fill('s3cr3t')
        await expect(password).toHaveAttribute('type', 'password')
        await config.getByLabel('Title', { exact: true }).fill('Admin title')
        await config.getByRole('button', { name: 'SAVE' }).click()
        await expect(config).toBeHidden({ timeout: 20000 })
        const served = await (await api.get(configUrl)).json() as Record<string, unknown>
        expect(served).toMatchObject({ autoUser: 'guest', autoPassword: 's3cr3t', title: 'Admin title', top: '12%', left: '34%', pageBackground: '#0a0b0c' })
        await dismissOpenDialogs(page)
    })

    // Uninstalled from THIS login's card: the confirmation, with the box to delete its config ticked or not
    const uninstallFromDialog = async (deleteConfig: boolean) => {
        await clickExtensionMenuItem(page, 'Login extensions')
        await expect(dialog()).toBeVisible({ timeout: 40000 })
        await dialog().getByText(DISPLAY, { exact: true }).first()
            .locator('xpath=ancestor::*[.//span[@aria-label="Uninstall"]][1]')
            .locator('span[aria-label="Uninstall"] button').first().click()
        const confirm = page.getByRole('dialog').filter({ hasText: /Are you sure you want to uninstall/ })
        await expect(confirm).toBeVisible({ timeout: 20000 })
        const box = confirm.getByLabel('Also delete its configuration')
        await expect(box, 'the box starts unticked: keeping is what you get without thinking').not.toBeChecked()
        if (deleteConfig) await box.check()
        await confirm.getByRole('button', { name: 'yes' }).click()
        await expect(confirm).toBeHidden({ timeout: 20000 })
        await expect.poll(async () => (await api.get(configUrl)).status(), { timeout: 30000 }).toBe(404)
        await dismissOpenDialogs(page)
    }

    const reinstall = async () => {
        const res = await api.post('/core/logins/upload', { headers: { ...auth, 'content-type': 'application/octet-stream' }, data: fs.readFileSync(makeTgz()) })
        expect(res.status(), await res.text()).toBe(200)
    }

    test('🔴 uninstalled from the dialog without the box: the config is kept, and a reinstall serves it again', async () => {
        await uninstallFromDialog(false)
        await reinstall()
        const served = await (await api.get(configUrl)).json() as Record<string, unknown>
        expect(served).toMatchObject({ autoUser: 'guest', autoPassword: 's3cr3t', title: 'Admin title' })
    })

    test('🔴 uninstalled with the box ticked: the config goes, and a reinstall starts from the package', async () => {
        await uninstallFromDialog(true)
        await reinstall()
        const served = await (await api.get(configUrl)).json() as Record<string, unknown>
        expect(served.autoUser).toBeUndefined()
        expect(served).toMatchObject(LOGIN_JSON)
    })

    test('uninstalled through the API with deleteConfig: nothing of it is left', async () => {
        expect((await api.delete(`/core/logins/${LOGIN_ID}?deleteConfig=true`, { headers: auth })).status()).toBe(200)
        expect((await api.get(configUrl)).status()).toBe(404)
    })
})
