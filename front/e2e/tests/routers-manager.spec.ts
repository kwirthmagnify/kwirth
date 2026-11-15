import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { login, clickExtensionMenuItem, dismissOpenDialogs, openMenu, USER, PASS } from './helpers'

/*
    The `router` type end to end (plans/router-extension, S4): installing one with NO restart, its card saying
    it is started, its config in the core's generic dialog (the secret masked, with the eye, and coming back
    real), the core's door (a session ticket, refused without one), and Manage clusters offering it as a route.

    The router is a fixture written here (plain JS, the shape the scaffolder generates) and installed through
    the API. Non-destructive: there was no such router before, and afterAll uninstalls it. Nothing is saved in
    the cluster list.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const ROUTER_ID = 'e2e-echo'
const DIALOG = /Manage routers/i

interface IAccessKey { id: string, type: string, resources: string }

const ROUTER_JS = `
class EchoRouter {
    constructor(context) { this.context = context; this.config = {} }
    getRouterData() { return { id: '${ROUTER_ID}', pathTemplate: '/{routeTicket}/{clusterUid}', needsTicket: true } }
    getConfigSchema() { return [{ name: 'greeting', label: 'Greeting', type: 'text' }, { name: 'secretToken', label: 'Secret token', type: 'password' }] }
    getScopeCatalog() { return [{ scope: '${ROUTER_ID}$use', label: 'E2E echo · Use', description: 'e2e' }] }
    async startRouter(config) { this.config = config }
    async applyConfig(config) { this.config = config }
    async stopRouter() {}
    getStatus() { return { started: true, detail: 'echoing' } }
    routerRequest(req, res, caller) { res.json({ via: caller.via, path: req.url, greeting: this.config.greeting ?? '' }) }
}
module.exports.default = EchoRouter
`

const makeTgz = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-e2e-router-'))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: ROUTER_ID, name: `@e2e/kwirth-router-${ROUTER_ID}`, displayName: 'E2E Echo Router', version: '0.1.0', description: 'e2e echo router', extensionType: 'router' }))
    fs.writeFileSync(path.join(dir, 'back.js'), ROUTER_JS)
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    return tgz
}

test.describe.configure({ mode: 'serial' })

test.describe('routers: the manager, the config dialog, the door and Manage clusters', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string>

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    test.beforeAll(async ({ browser, playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
        const installed = await (await api.get('/core/routers')).json() as { id: string }[]
        expect(installed.some(r => r.id === ROUTER_ID), `'${ROUTER_ID}' is already installed: a previous run did not clean up`).toBe(false)

        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        await api?.delete(`/core/routers/${ROUTER_ID}`, { headers: auth }).catch(() => undefined)
        await page?.close()
        await api?.dispose()
    })

    test('🔴 Routers is a family of its own in the extensions menu', async () => {
        await clickExtensionMenuItem(page, 'Routers')
        await expect(dialog()).toBeVisible({ timeout: 40000 })
        await expect(dialog().getByText(/Installed routers/i)).toBeVisible()
        await dismissOpenDialogs(page)
    })

    test('🔴 installed with NO restart: it is started at once and announced to the front', async () => {
        const res = await api.post('/core/routers/upload', { headers: { ...auth, 'content-type': 'application/octet-stream' }, data: fs.readFileSync(makeTgz()) })
        expect(res.status(), await res.text()).toBe(200)
        const listed = (await (await api.get('/core/routers')).json() as { id: string, requiresRestart: boolean, status: { started: boolean } }[]).find(r => r.id === ROUTER_ID)
        expect(listed?.status.started).toBe(true)
        expect(listed?.requiresRestart).toBe(false)
        const info = await (await api.get('/config/info', { headers: auth })).json() as { routers?: { id: string }[] }
        expect(info.routers?.some(r => r.id === ROUTER_ID)).toBe(true)
    })

    test('its card says Started', async () => {
        await clickExtensionMenuItem(page, 'Routers')
        await expect(dialog()).toBeVisible({ timeout: 40000 })
        await expect(dialog().getByText('E2E Echo Router').first()).toBeVisible()
        await expect(dialog().getByText('Started', { exact: true }).first()).toBeVisible()
    })

    test('🔴 its config is the core\'s generic dialog: the secret masked with the eye, saved and returned REAL', async () => {
        // THIS router's gear: other routers may be installed (the innermost box holding its name and a gear is its card)
        const card = dialog().locator('div').filter({ hasText: 'E2E Echo Router' }).filter({ has: page.getByRole('button', { name: 'Configure' }) }).last()
        await card.getByRole('button', { name: 'Configure' }).click()
        const config = page.getByRole('dialog').filter({ hasText: `Configure: E2E Echo Router` })
        await expect(config).toBeVisible({ timeout: 20000 })
        await config.getByLabel('Greeting', { exact: true }).fill('hola')
        const secret = config.getByLabel('Secret token', { exact: true })
        await secret.fill('s3cr3t')
        await expect(secret).toHaveAttribute('type', 'password')
        await config.getByRole('button', { name: 'SAVE' }).click()
        await expect(config).toBeHidden({ timeout: 20000 })
        const saved = await (await api.get(`/core/routers/${ROUTER_ID}/config`, { headers: auth })).json()
        expect(saved).toMatchObject({ greeting: 'hola', secretToken: 's3cr3t' })
        await dismissOpenDialogs(page)
    })

    test('🔴 the core\'s door: with the session ticket the router answers (applied config included); without it, 401', async () => {
        const ticket = await (await api.post('/core/routes/ticket', { headers: auth })).json() as { routeTicket: string }
        const ok = await api.get(`/router/${ROUTER_ID}/${ticket.routeTicket}/u1/x`)
        expect(ok.status()).toBe(200)
        expect(await ok.json()).toEqual({ via: 'ticket', path: '/u1/x', greeting: 'hola' })
        expect((await api.get(`/router/${ROUTER_ID}/not-a-ticket/u1/x`)).status()).toBe(401)
    })

    test('🔴 Manage clusters offers it as a route; choosing it enables the Cluster UID', async () => {
        await dismissOpenDialogs(page)
        await openMenu(page)
        await page.getByRole('menuitem', { name: 'Manage cluster list', exact: true }).click({ force: true })
        const clusters = page.getByRole('dialog').filter({ hasText: 'Manage clusters' })
        await expect(clusters).toBeVisible({ timeout: 20000 })
        await clusters.locator('.MuiDialogActions-root').getByRole('button', { name: 'NEW', exact: true }).click()
        const route = clusters.getByRole('combobox', { name: 'Route' })
        await expect(route).not.toHaveAttribute('aria-disabled', 'true')
        await route.click()
        await page.getByRole('option', { name: ROUTER_ID, exact: true }).click()
        await expect(clusters.getByLabel('Cluster UID', { exact: true })).toBeEnabled()
        // nothing is saved: NEW leaves the form empty again
        await clusters.locator('.MuiDialogActions-root').getByRole('button', { name: 'NEW', exact: true }).click()
        await dismissOpenDialogs(page)
    })

    test('uninstalled with NO restart: its route is gone at once', async () => {
        expect((await api.delete(`/core/routers/${ROUTER_ID}`, { headers: auth })).status()).toBe(200)
        const ticket = await (await api.post('/core/routes/ticket', { headers: auth })).json() as { routeTicket: string }
        expect((await api.get(`/router/${ROUTER_ID}/${ticket.routeTicket}/u1/x`)).status()).toBe(404)
    })
})
