import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { login, clickExtensionMenuItem, dismissOpenDialogs, USER, PASS } from './helpers'

/*
    A provider's installation config through the common extension config store (plans/extension-config,
    S3): the core's generic dialog with the schema defaults, a refused value marked in the form, a secret
    masked with the eye and coming back real.

    The provider is a fixture written here (plain JS: a class and the 'schema' export the core caches on
    installing it) and installed through the API. Non-destructive: there was no such provider before, and
    afterAll uninstalls it, which also removes its config.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const PROVIDER_ID = 'e2e-config-provider'
const DISPLAY = 'E2E Config Provider'
const DIALOG = /Manage providers/i

interface IAccessKey { id: string, type: string, resources: string }

const PROVIDER_JS = `
class E2eConfigProvider {
    constructor() { this.id = '${PROVIDER_ID}'; this.providesRouter = false; this.requiresApiKeyApi = false }
    async startProvider() {}
    async stopProvider() {}
    async addSubscriber() {}
    async removeSubscriber() {}
}
module.exports.default = E2eConfigProvider
module.exports.schema = [
    { name: 'endpoint', label: 'Endpoint', type: 'text', required: true },
    { name: 'apiToken', label: 'API token', type: 'password' },
    { name: 'pollSeconds', label: 'Poll every (seconds)', type: 'number', default: 30 }
]
`

const makeTgz = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-e2e-provider-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: PROVIDER_ID, name: `@e2e/kwirth-provider-${PROVIDER_ID}`, displayName: DISPLAY, version: '0.1.0', description: 'e2e provider with an installation config', extensionType: 'provider' }))
    fs.writeFileSync(path.join(dir, 'back.js'), PROVIDER_JS)
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    return tgz
}

test.describe.configure({ mode: 'serial' })

test.describe('provider installation config: the common store behind the generic dialog', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string>

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })
    const configUrl = `/core/providers/${PROVIDER_ID}/config`

    // THIS provider's config dialog: the nearest ancestor of its name holding a gear is its card. The gear by
    // its exact aria-label: the disabled ones of other providers say "Configured from the '…' plugin".
    const openConfig = async () => {
        await clickExtensionMenuItem(page, 'Providers')
        await expect(dialog()).toBeVisible({ timeout: 40000 })
        await dialog().getByText(DISPLAY, { exact: true }).first()
            .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
            .locator('button[aria-label="Configure"]').first().click()
        const config = page.getByRole('dialog').filter({ hasText: `Configure: ${DISPLAY}` })
        await expect(config).toBeVisible({ timeout: 20000 })
        return config
    }

    test.beforeAll(async ({ browser, playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
        const installed = await (await api.get('/core/providers')).json() as { id: string }[]
        expect(installed.some(p => p.id === PROVIDER_ID), `'${PROVIDER_ID}' is already installed: a previous run did not clean up`).toBe(false)

        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        await api?.delete(`/core/providers/${PROVIDER_ID}`, { headers: auth }).catch(() => undefined)
        await page?.close()
        await api?.dispose()
    })

    test('installed through the API, with its schema cached', async () => {
        const res = await api.post('/core/providers/upload', { headers: { ...auth, 'content-type': 'application/octet-stream' }, data: fs.readFileSync(makeTgz()) })
        expect(res.status(), await res.text()).toBe(200)
        const schema = await (await api.get(`/core/providers/${PROVIDER_ID}/schema`)).json() as { name: string }[]
        expect(schema.map(f => f.name)).toEqual(['endpoint', 'apiToken', 'pollSeconds'])
    })

    test('🔴 never configured: the config comes back with the schema defaults, and the form shows them', async () => {
        expect(await (await api.get(configUrl, { headers: auth })).json()).toEqual({ pollSeconds: 30 })
        const config = await openConfig()
        await expect(config.getByLabel('Poll every (seconds)', { exact: true })).toHaveValue('30')
        await config.getByRole('button', { name: 'CANCEL' }).click()
        await expect(config).toBeHidden({ timeout: 20000 })
        await dismissOpenDialogs(page)
    })

    test('🔴 a value that does not fit the schema is a 400 naming every field, and nothing is saved', async () => {
        const res = await api.put(configUrl, { headers: auth, data: { pollSeconds: 'often' } })
        expect(res.status()).toBe(400)
        const body = await res.json() as { fields: { field: string }[] }
        expect(body.fields.map(f => f.field)).toEqual(['endpoint', 'pollSeconds'])
        expect(await (await api.get(configUrl, { headers: auth })).json()).toEqual({ pollSeconds: 30 })
    })

    test('🔴 the dialog marks the refused field and stays open', async () => {
        const config = await openConfig()
        await config.getByRole('button', { name: 'SAVE' }).click()
        await expect(config.getByText(`'Endpoint' is required`)).toBeVisible({ timeout: 20000 })
        await expect(config.getByLabel(/^Endpoint/)).toHaveAttribute('aria-invalid', 'true')
        await config.getByRole('button', { name: 'CANCEL' }).click()
        await expect(config).toBeHidden({ timeout: 20000 })
        await dismissOpenDialogs(page)
    })

    test('🔴 saved from the dialog: the secret masked with the eye, and everything comes back REAL', async () => {
        const config = await openConfig()
        await config.getByLabel(/^Endpoint/).fill('https://e2e.example')
        const token = config.getByLabel('API token', { exact: true })
        await token.fill('s3cr3t')
        await expect(token).toHaveAttribute('type', 'password')
        await config.getByRole('button', { name: 'SAVE' }).click()
        await expect(config).toBeHidden({ timeout: 20000 })
        expect(await (await api.get(configUrl, { headers: auth })).json()).toEqual({ endpoint: 'https://e2e.example', apiToken: 's3cr3t', pollSeconds: 30 })
        await dismissOpenDialogs(page)
    })

    test('uninstalled: its config goes with it', async () => {
        expect((await api.delete(`/core/providers/${PROVIDER_ID}`, { headers: auth })).status()).toBe(200)
        expect(await (await api.get(configUrl, { headers: auth })).json()).toEqual({})
    })
})
