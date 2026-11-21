import { test, expect, Page, APIRequestContext, Locator } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { login, clickExtensionMenuItem, dismissOpenDialogs, USER, PASS } from './helpers'

/*
    The MULTIPLE shape through the common extension config store (plans/extension-config, S6): a sender's and
    a webhook's named configurations and their common base, edited in ConfigListDialog — one Secret per
    extension, the base kept across a reload (the webhook's was never stored before), what the schema
    refuses marked on its field, and the whole document kept on uninstall unless the box is ticked (P5);
    a kept webhook comes back with the SAME URL.

    Both extensions are fixtures written here (a class with a schema; neither talks to anything) uploaded
    through the API. Non-destructive: there were none before, and afterAll removes them with their config.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'

interface IAccessKey { id: string, type: string, resources: string }
interface IStored { configs: Record<string, unknown>[], [key: string]: unknown }

interface IFixture {
    /** the family as the API names it: '/core/<family>' */
    family: 'senders' | 'webhooks'
    id: string
    label: string
    manager: RegExp
    menu: string
    backJs: string
}

const SCHEMA = `[
    { name: 'name', label: 'Name', required: true },
    { name: 'host', label: 'Host', required: true, common: true },
    { name: 'password', label: 'Password', type: 'password', common: true },
    { name: 'to', label: 'To', required: true },
    { name: 'route', label: 'Route', type: 'json' }
]`

const SENDER: IFixture = {
    family: 'senders', id: 'e2e-named-sender', label: 'E2E Named Sender', manager: /Manage senders/i, menu: 'Senders',
    backJs: `module.exports.default = class {
        constructor() { this.id = 'e2e-named-sender'; this.c = new Map() }
        getConfigSchema() { return ${SCHEMA} }
        addConfig(c) { this.c.set(c.name, c) }
        removeConfig(n) { this.c.delete(n) }
        hasConfig(n) { return this.c.has(n) }
        getConfigNames() { return [...this.c.keys()] }
        async startSender() {}
        async stopSender() {}
        async send() {}
    }`
}

const WEBHOOK: IFixture = {
    family: 'webhooks', id: 'e2e-named-webhook', label: 'E2E Named Webhook', manager: /Manage webhooks/i, menu: 'Webhooks',
    backJs: `module.exports.default = class {
        constructor() { this.id = 'e2e-named-webhook'; this.c = new Map() }
        getConfigSchema() { return ${SCHEMA} }
        verify() { return false }
        parse() { return null }
        addConfig(c) { this.c.set(c.name, c) }
        removeConfig(n) { this.c.delete(n) }
        hasConfig(n) { return this.c.has(n) }
        getConfigNames() { return [...this.c.keys()] }
    }`
}

const makeTgz = (fx: IFixture): Buffer => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kwirth-e2e-${fx.id}-`))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: fx.id, name: `@e2e/kwirth-${fx.id}`, displayName: fx.label, version: '0.1.0', description: 'e2e extension with named configurations' }))
    fs.writeFileSync(path.join(dir, 'back.js'), fx.backJs)
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    return fs.readFileSync(tgz)
}

test.describe.configure({ mode: 'serial' })

test.describe('named configurations (sender, webhook): one Secret, the base kept, refusals marked, kept on uninstall', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string>

    const install = async (fx: IFixture) => {
        const res = await api.post(`/core/${fx.family}/upload`, { headers: { ...auth, 'content-type': 'application/octet-stream' }, data: makeTgz(fx) })
        expect(res.status(), await res.text()).toBe(200)
    }

    const storedOf = async (fx: IFixture): Promise<IStored> => (await api.get(`/core/${fx.family}/${fx.id}/configs`, { headers: auth })).json() as Promise<IStored>

    const managerDialog = (fx: IFixture) => page.getByRole('dialog').filter({ hasText: fx.manager })

    // THIS extension's card button: the nearest ancestor of its name holding it
    const cardButton = async (fx: IFixture, ariaLabel: string) => {
        await clickExtensionMenuItem(page, fx.menu)
        await expect(managerDialog(fx)).toBeVisible({ timeout: 40000 })
        await managerDialog(fx).getByText(fx.label, { exact: true }).first()
            .locator(`xpath=ancestor::*[.//span[@aria-label="${ariaLabel}"] or .//button[@aria-label="${ariaLabel}"]][1]`)
            .locator(`button[aria-label="${ariaLabel}"], span[aria-label="${ariaLabel}"] button`).first().click()
    }

    const openConfig = async (fx: IFixture): Promise<Locator> => {
        await cardButton(fx, 'Configure')
        const cfg = page.getByRole('dialog').filter({ hasText: `Configure: ${fx.label}` })
        await expect(cfg).toBeVisible({ timeout: 20000 })
        return cfg
    }

    const closeConfig = async (cfg: Locator) => {
        await cfg.getByRole('button', { name: 'Close' }).click()
        await expect(cfg).toBeHidden({ timeout: 20000 })
        await dismissOpenDialogs(page)
    }

    const saveBase = async (cfg: Locator, host: string, password: string) => {
        await cfg.getByRole('button', { name: 'Edit base configuration' }).click()
        const base = page.getByRole('dialog').filter({ hasText: 'Base configuration' })
        await expect(base).toBeVisible({ timeout: 10000 })
        await base.getByLabel(/^Host/).fill(host)
        await base.getByLabel(/^Password/).fill(password)
        await base.getByRole('button', { name: 'Save' }).click()
        await expect(base).toBeHidden({ timeout: 20000 })
    }

    const uninstallFromDialog = async (fx: IFixture, deleteConfig: boolean) => {
        await cardButton(fx, 'Uninstall')
        const confirm = page.getByRole('dialog').filter({ hasText: /Are you sure you want to uninstall/ })
        await expect(confirm).toBeVisible({ timeout: 20000 })
        const box = confirm.getByLabel('Also delete its configuration')
        await expect(box, 'the box starts unticked').not.toBeChecked()
        if (deleteConfig) await box.check()
        await confirm.getByRole('button', { name: 'yes' }).click()
        await expect(confirm).toBeHidden({ timeout: 20000 })
        await expect.poll(async () => ((await (await api.get(`/core/${fx.family}`, { headers: auth })).json()) as { id: string }[]).some(e => e.id === fx.id), { timeout: 30000 }).toBe(false)
        await dismissOpenDialogs(page)
    }

    test.beforeAll(async ({ browser, playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
        for (const fx of [SENDER, WEBHOOK]) {
            const there = await (await api.get(`/core/${fx.family}`, { headers: auth })).json() as { id: string }[]
            expect(there.some(e => e.id === fx.id), `'${fx.id}' is already installed: a previous run did not clean up`).toBe(false)
        }
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        for (const fx of [SENDER, WEBHOOK]) await api?.delete(`/core/${fx.family}/${fx.id}?deleteConfig=true`, { headers: auth }).catch(() => undefined)
        await page?.close()
        await api?.dispose()
    })

    for (const fx of [SENDER, WEBHOOK]) {
        test(`${fx.family}: installed through the API`, async () => {
            await install(fx)
        })

        test(`🔴 ${fx.family}: the base saved from the dialog is stored, the password REAL, and comes back on reopening`, async () => {
            const cfg = await openConfig(fx)
            await saveBase(cfg, 'smtp.e2e.invalid', 'e2e-pw')
            expect(await storedOf(fx)).toMatchObject({ host: 'smtp.e2e.invalid', password: 'e2e-pw', configs: [] })
            await closeConfig(cfg)

            const again = await openConfig(fx)
            await again.getByRole('button', { name: 'Edit base configuration' }).click()
            const base = page.getByRole('dialog').filter({ hasText: 'Base configuration' })
            await expect(base.getByLabel(/^Host/)).toHaveValue('smtp.e2e.invalid')
            await expect(base.getByLabel(/^Password/)).toHaveAttribute('type', 'password')
            await expect(base.getByLabel(/^Password/)).toHaveValue('e2e-pw')
            await base.getByRole('button', { name: 'Cancel' }).click()
            await closeConfig(again)
        })

        test(`🔴 ${fx.family}: what the schema refuses is marked on its field and said; fixing it saves`, async () => {
            const cfg = await openConfig(fx)
            await cfg.getByRole('button', { name: 'New' }).click()
            await cfg.getByLabel(/^Name/).fill('qa-one')
            await cfg.getByLabel(/^To/).fill('ops@e2e.invalid')
            await cfg.getByLabel(/^Route/).fill('{not json')
            await cfg.getByRole('button', { name: 'Add' }).click()
            const errors = cfg.getByTestId('config-field-errors')
            await expect(errors).toContainText(`'Route' must be valid JSON`, { timeout: 20000 })
            await expect(cfg.getByLabel(/^Route/)).toHaveAttribute('aria-invalid', 'true')
            expect((await storedOf(fx)).configs, 'nothing was saved').toEqual([])

            await cfg.getByLabel(/^Route/).fill('{"steps":[1]}')
            await expect(errors).toBeHidden()
            await cfg.getByRole('button', { name: 'Add' }).click()
            await expect(cfg.getByText('qa-one', { exact: true })).toBeVisible({ timeout: 20000 })
            expect((await storedOf(fx)).configs).toEqual([{ name: 'qa-one', to: 'ops@e2e.invalid', route: '{"steps":[1]}' }])
            await closeConfig(cfg)
        })

        test(`${fx.family}: editing a config replaces it, and the base is still there`, async () => {
            const cfg = await openConfig(fx)
            await cfg.getByText('qa-one', { exact: true }).click()
            await cfg.getByLabel(/^To/).fill('sre@e2e.invalid')
            await cfg.getByRole('button', { name: 'Update' }).click()
            await expect.poll(async () => (await storedOf(fx)).configs[0]?.to, { timeout: 20000 }).toBe('sre@e2e.invalid')
            expect((await storedOf(fx)).host, 'saving a config does not lose the base').toBe('smtp.e2e.invalid')
            await closeConfig(cfg)
        })

        /*
            ☰ Kwirth export (S7): the base travels WITH the configs —a webhook's used to be lost— and without
            credentials every secret is emptied, in the base and in each config. Only THIS fixture is
            exported and imported: it is given back exactly what it handed over.
        */
        test(`🔴 ${fx.family}: the Kwirth export carries base and configs, secrets emptied without credentials; importing gives the same document back`, async () => {
            const key = `${fx.family.replace(/s$/, '')}/${fx.id}`
            const antes = await storedOf(fx)
            expect(antes.password, 'the base has a password to hide').toBeTruthy()

            const sinCredenciales = await (await api.get(`/core/config-bundle/export?include=${key}`, { headers: auth })).json()
            expect(sinCredenciales.extensions[0].coreConfig.stored).toEqual({ ...antes, password: '' })

            const conCredenciales = await (await api.get(`/core/config-bundle/export?include=${key}&credentials=true`, { headers: auth })).json()
            expect(conCredenciales.extensions[0].coreConfig.stored, 'the password travels REAL when asked').toEqual(antes)

            const res = await api.post('/core/config-bundle/import', { headers: auth, data: { bundle: conCredenciales, include: [key] } })
            expect(res.status(), await res.text()).toBe(200)
            const informe = await res.json() as { entries: { error?: string, result?: { applied: number, warnings: string[] } }[] }
            expect(informe.entries[0].error).toBeUndefined()
            expect(informe.entries[0].result?.warnings).toEqual([])
            expect(await storedOf(fx), 'the same document, base included').toEqual(antes)
        })

        test(`🔴 ${fx.family}: uninstalled without the box, everything is kept and a reinstall finds it`, async () => {
            const urlBefore = fx.family === 'webhooks'
                ? (await (await api.get(`/core/webhooks/${fx.id}/configs/qa-one/url`, { headers: auth })).json()).url as string
                : undefined
            await uninstallFromDialog(fx, false)
            await install(fx)
            expect(await storedOf(fx)).toMatchObject({ host: 'smtp.e2e.invalid', password: 'e2e-pw', configs: [{ name: 'qa-one', to: 'sre@e2e.invalid' }] })
            if (urlBefore) {
                const urlAfter = (await (await api.get(`/core/webhooks/${fx.id}/configs/qa-one/url`, { headers: auth })).json()).url
                expect(urlAfter, 'the same URL: nothing to paste again at the provider').toBe(urlBefore)
            }
        })

        test(`${fx.family}: deleting a config from the list removes it from the store`, async () => {
            const cfg = await openConfig(fx)
            await cfg.getByText('qa-one', { exact: true }).locator('xpath=ancestor::*[.//button[@aria-label="Delete"]][1]')
                .getByRole('button', { name: 'Delete' }).click()
            // asked first: answering 'no' leaves it where it was
            const ask = page.getByRole('dialog').filter({ hasText: "delete config 'qa-one'" })
            await ask.getByRole('button', { name: 'no', exact: true }).click()
            await expect(ask).toHaveCount(0)
            expect((await storedOf(fx)).configs.length).toBe(1)
            await cfg.getByText('qa-one', { exact: true }).locator('xpath=ancestor::*[.//button[@aria-label="Delete"]][1]')
                .getByRole('button', { name: 'Delete' }).click()
            await ask.getByRole('button', { name: 'yes', exact: true }).click()
            await expect.poll(async () => (await storedOf(fx)).configs.length, { timeout: 20000 }).toBe(0)
            await closeConfig(cfg)
        })

        test(`🔴 ${fx.family}: uninstalled with the box ticked, the configuration goes and a reinstall starts empty`, async () => {
            await uninstallFromDialog(fx, true)
            await install(fx)
            expect(await storedOf(fx)).toEqual({ configs: [] })
            const res = await api.delete(`/core/${fx.family}/${fx.id}?deleteConfig=true`, { headers: auth })
            expect(res.status()).toBe(200)
        })
    }
})
