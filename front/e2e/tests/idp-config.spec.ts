import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { login, clickExtensionMenuItem, dismissOpenDialogs, USER, PASS } from './helpers'

/*
    An IdP instance through the common extension config store (plans/extension-config, S5): one Secret per
    instance, validated against its connector's schema, its secrets travelling REAL (the dialog masks them
    with the eye), and kept on uninstalling the connector unless the confirmation's box is ticked (P5).

    The connector is a fixture written here (a class with a schema; it never talks to any real provider)
    and uploaded through the API. Non-destructive: there was no such connector before, its instance is
    switched OFF so the login never offers it, and afterAll removes both.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const CONNECTOR_ID = 'e2e-config-idp'
const LABEL = 'E2E Config IdP'
const DIALOG = /Identity providers/i

interface IAccessKey { id: string, type: string, resources: string }
interface IInstance { id: string, connectorId: string, label: string, enabled: boolean, config: Record<string, unknown> }

const BACK_JS = `class C {
    constructor() { this.id = '${CONNECTOR_ID}'; this.label = '${LABEL}'; this.kind = 'oidc' }
    getConfigSchema() { return [
        { name: 'clientId', label: 'Client ID', type: 'text', required: true },
        { name: 'clientSecret', label: 'Client secret', type: 'password', required: true }
    ] }
    buildAuthorizationUrl() { return 'https://idp.invalid/auth' }
    async handleCallback() { throw new Error('e2e connector: never used to log in') }
}
module.exports.default = C`

const makeTgz = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-e2e-idp-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: CONNECTOR_ID, name: `@e2e/kwirth-idp-${CONNECTOR_ID}`, displayName: LABEL, version: '0.1.0', description: 'e2e IdP connector with a config schema', extensionType: 'idp' }))
    fs.writeFileSync(path.join(dir, 'back.js'), BACK_JS)
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    return tgz
}

test.describe.configure({ mode: 'serial' })

test.describe('IdP instance config: one Secret per instance, real secrets, kept on uninstall unless asked', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string>

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })
    const instanceUrl = `/core/idps/instances/${CONNECTOR_ID}`

    // THIS connector's card: the nearest ancestor of its name holding the given button
    const cardButton = async (ariaLabel: string) => {
        await clickExtensionMenuItem(page, 'Identity providers')
        await expect(dialog()).toBeVisible({ timeout: 40000 })
        await dialog().getByText(LABEL, { exact: true }).first()
            .locator(`xpath=ancestor::*[.//span[@aria-label="${ariaLabel}"] or .//button[@aria-label="${ariaLabel}"]][1]`)
            .locator(`button[aria-label="${ariaLabel}"], span[aria-label="${ariaLabel}"] button`).first().click()
    }

    const openConfig = async () => {
        await cardButton('Configure')
        const config = page.getByRole('dialog').filter({ hasText: `Configure: ${LABEL}` })
        await expect(config).toBeVisible({ timeout: 20000 })
        return config
    }

    const install = async () => {
        const res = await api.post('/core/idps/upload', { headers: { ...auth, 'content-type': 'application/octet-stream' }, data: fs.readFileSync(makeTgz()) })
        expect(res.status(), await res.text()).toBe(200)
    }

    const uninstallFromDialog = async (deleteConfig: boolean) => {
        await cardButton('Uninstall')
        const confirm = page.getByRole('dialog').filter({ hasText: /Are you sure you want to uninstall/ })
        await expect(confirm).toBeVisible({ timeout: 20000 })
        const box = confirm.getByLabel('Also delete its configuration')
        await expect(box, 'the box starts unticked: keeping is what you get without thinking').not.toBeChecked()
        if (deleteConfig) await box.check()
        await confirm.getByRole('button', { name: 'yes' }).click()
        await expect(confirm).toBeHidden({ timeout: 20000 })
        await expect.poll(async () => ((await (await api.get('/core/idps', { headers: auth })).json()) as { id: string }[]).some(c => c.id === CONNECTOR_ID), { timeout: 30000 }).toBe(false)
        await dismissOpenDialogs(page)
    }

    test.beforeAll(async ({ browser, playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
        const connectors = await (await api.get('/core/idps', { headers: auth })).json() as { id: string }[]
        expect(connectors.some(c => c.id === CONNECTOR_ID), `'${CONNECTOR_ID}' is already installed: a previous run did not clean up`).toBe(false)
        expect((await api.get(instanceUrl, { headers: auth })).status(), `an instance '${CONNECTOR_ID}' is left from a previous run`).toBe(404)

        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        await api?.delete(`/core/idps/${CONNECTOR_ID}?deleteConfig=true`, { headers: auth }).catch(() => undefined)
        await api?.delete(instanceUrl, { headers: auth }).catch(() => undefined)
        await page?.close()
        await api?.dispose()
    })

    test('installed through the API', async () => {
        await install()
    })

    test('🔴 required fields empty DISABLE Save, and its tooltip says which; filled, it is enabled', async () => {
        const config = await openConfig()
        const save = config.getByRole('button', { name: 'Save' })
        await expect(save).toBeDisabled()
        await save.locator('xpath=..').hover()
        await expect(page.getByRole('tooltip')).toHaveText('Required fields missing: Client ID, Client secret')
        await config.getByLabel(/^Client ID/).fill('typing')
        await expect(save).toBeDisabled()
        await config.getByLabel(/^Client secret/).fill('typing')
        await expect(save).toBeEnabled()
        await config.getByRole('button', { name: 'Cancel' }).click()
        await expect(config).toBeHidden({ timeout: 20000 })
        expect((await api.get(instanceUrl, { headers: auth })).status(), 'nothing was saved').toBe(404)
        await dismissOpenDialogs(page)
    })

    test('🔴 what the connector refuses is marked on its field and said; editing it clears the mark', async () => {
        // a refusal the form cannot foresee, simulated on the wire
        // a NEW instance is POSTed to the collection, an existing one PUT to its own url: both are caught
        await page.route('**/core/idps/instances**', async route => route.request().method() === 'PUT' || route.request().method() === 'POST'
            ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: "'Client ID' is not valid", fields: [{ field: 'clientId', message: "'Client ID' is not valid" }] }) })
            : route.continue())
        try {
            const config = await openConfig()
            await config.getByLabel(/^Client ID/).fill('bad')
            await config.getByLabel(/^Client secret/).fill('x')
            await config.getByRole('button', { name: 'Save' }).click()
            const errors = config.getByTestId('config-field-errors')
            await expect(errors).toContainText(`'Client ID' is not valid`, { timeout: 20000 })
            const clientId = config.getByLabel(/^Client ID/)
            await expect(clientId).toHaveAttribute('aria-invalid', 'true')
            await clientId.fill('better')
            await expect(clientId).toHaveAttribute('aria-invalid', 'false')
            await config.getByRole('button', { name: 'Cancel' }).click()
            await expect(config).toBeHidden({ timeout: 20000 })
        }
        finally {
            await page.unroute('**/core/idps/instances**')
        }
        expect((await api.get(instanceUrl, { headers: auth })).status(), 'nothing was saved').toBe(404)
        await dismissOpenDialogs(page)
    })

    test('🔴 saved from the dialog, switched off: the API returns the secret REAL', async () => {
        const config = await openConfig()
        await config.getByLabel(/^Client ID/).fill('e2e-client')
        await config.getByLabel(/^Client secret/).fill('e2e-s3cr3t')
        await expect(config.getByLabel('Enabled')).not.toBeChecked()
        await config.getByRole('button', { name: 'Save' }).click()
        await expect(config).toBeHidden({ timeout: 20000 })
        const inst = await (await api.get(instanceUrl, { headers: auth })).json() as IInstance
        expect(inst).toMatchObject({ connectorId: CONNECTOR_ID, enabled: false, config: { clientId: 'e2e-client', clientSecret: 'e2e-s3cr3t' } })
        await dismissOpenDialogs(page)
    })

    test('🔴 reopened: the secret is already in its field, masked, and the eye shows it', async () => {
        const config = await openConfig()
        const secret = config.getByLabel(/^Client secret/)
        await expect(secret).toHaveAttribute('type', 'password')
        await expect(secret).toHaveValue('e2e-s3cr3t')
        await config.getByRole('button', { name: /show/i }).first().click()
        await expect(secret).toHaveAttribute('type', 'text')
        await config.getByRole('button', { name: 'Cancel' }).click()
        await expect(config).toBeHidden({ timeout: 20000 })
        await dismissOpenDialogs(page)
    })

    test('🔴 uninstalled from the dialog without the box: the instance is kept, and a reinstall finds it', async () => {
        await uninstallFromDialog(false)
        expect((await api.get(instanceUrl, { headers: auth })).status()).toBe(200)
        await install()
        const inst = await (await api.get(instanceUrl, { headers: auth })).json() as IInstance
        expect(inst.config).toEqual({ clientId: 'e2e-client', clientSecret: 'e2e-s3cr3t' })
    })

    test('🔴 uninstalled with the box ticked: its instance goes with it', async () => {
        await uninstallFromDialog(true)
        expect((await api.get(instanceUrl, { headers: auth })).status()).toBe(404)
    })
})
