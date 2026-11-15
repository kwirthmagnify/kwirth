import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs, openMenu, GUIDE_MEDIA, capturePedida } from './helpers'

/*
    Screenshots of the Routers guide (docs/<version>/guide/extensions/routers): the manager, a router's
    configuration and a routed cluster-list entry. Run by hand:
        CAPTURES=1 npx playwright test tests/capture-routers.spec.ts
    It needs the Bridge router installed (Manage extensions → Routers).

    🔴 The guide is PUBLIC and the development Kwirth is linked to a real customer's cluster: the forms are
    filled with EXAMPLE values right before shooting (never saved: Cancel / NEW), and the private marketplaces
    are disabled for as long as the capture lasts, then restored exactly as they were.
*/

const MEDIA = GUIDE_MEDIA

interface ISession { auth: string; backend: string }

async function captureSession(page: Page): Promise<ISession> {
    const found: ISession = { auth: '', backend: '' }
    page.on('request', req => {
        const h = req.headers()['authorization']
        if (h && !found.auth && req.url().includes('/config/')) {
            found.auth = h
            found.backend = new URL(req.url()).origin
        }
    })
    await login(page)
    await dismissOpenDialogs(page)
    await expect.poll(() => found.auth, { timeout: 15000 }).not.toBe('')
    return found
}

const readSettings = (page: Page, s: ISession) => page.evaluate(async ([b, a]) =>
    await (await fetch(`${b}/core/settings`, { headers: { Authorization: a } })).json(), [s.backend, s.auth])

const writeMarketplaces = (page: Page, s: ISession, marketplaces: unknown) => page.evaluate(async ([b, a, m]) => {
    await fetch(`${b}/core/settings`, { method: 'PUT', headers: { Authorization: a as string, 'Content-Type': 'application/json' }, body: JSON.stringify({ marketplaces: m }) })
}, [s.backend, s.auth, marketplaces] as [string, string, unknown])

test('capture the Routers guide (dark, example values only)', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    const s = await captureSession(page)
    const original = (await readSettings(page, s)).marketplaces ?? []
    // every configured marketplace off, as capture-managers does: the official public catalogue is built in
    const privatesOff = (original as Record<string, unknown>[]).map(m => ({ ...m, enabled: false }))

    try {
        await writeMarketplaces(page, s, privatesOff)

        // ── the manager ──
        await clickExtensionMenuItem(page, 'Routers')
        const manager = page.getByRole('dialog').filter({ hasText: /Manage routers/i })
        await expect(manager).toBeVisible({ timeout: 40000 })
        await expect(manager.getByText('Bridge').first()).toBeVisible({ timeout: 20000 })
        await page.mouse.move(0, 0)
        await page.waitForTimeout(1500)
        if (capturePedida('manage-routers')) await manager.screenshot({ path: `${MEDIA}/manage-routers.png` })

        // ── its configuration, with example values (never saved) ──
        if (capturePedida('router-config')) {
            const card = manager.locator('div').filter({ hasText: 'Bridge' }).filter({ has: page.getByRole('button', { name: 'Configure' }) }).last()
            await card.getByRole('button', { name: 'Configure' }).click()
            const config = page.getByRole('dialog').filter({ hasText: 'Configure: Bridge' })
            await expect(config).toBeVisible({ timeout: 20000 })
            await config.getByLabel(/Sibling URL/).fill('https://kwirth-b.example.com/kwirth')
            await config.getByLabel(/Access key created in the sibling/).fill('3f6c2a90-0000-4000-8000-example00000|permanent|bridge$peer::::')
            await page.mouse.move(0, 0)
            await page.waitForTimeout(600)
            await config.screenshot({ path: `${MEDIA}/router-config.png` })
            await config.getByRole('button', { name: 'CANCEL' }).click()
            await expect(config).toHaveCount(0)
        }
        await dismissOpenDialogs(page)

        // ── a routed cluster-list entry, typed and NOT saved; only the form is shot (the list holds real names) ──
        if (capturePedida('manage-clusters-route')) {
            await openMenu(page)
            await page.getByRole('menuitem', { name: 'Manage cluster list', exact: true }).click({ force: true })
            const clusters = page.getByRole('dialog').filter({ hasText: 'Manage clusters' })
            await expect(clusters).toBeVisible({ timeout: 20000 })
            await clusters.locator('.MuiDialogActions-root').getByRole('button', { name: 'NEW', exact: true }).click()
            await clusters.getByLabel('Name', { exact: true }).fill('kwirth-b')
            await clusters.getByLabel('URL', { exact: true }).fill('https://kwirth-b.example.com/kwirth')
            await clusters.getByLabel('API Key', { exact: true }).fill('9a1b7c00-0000-4000-8000-example00000|permanent|cluster::::')
            await clusters.getByRole('combobox', { name: 'Route' }).click()
            await page.getByRole('option', { name: 'bridge', exact: true }).click()
            await clusters.getByLabel('Cluster UID', { exact: true }).fill('5d2e8f41-7a3c-4b9e-9c0d-1e2f3a4b5c6d')
            // 'has' is queried INSIDE each candidate: the inner locators start from the page, not from the dialog
            const form = clusters.locator('.MuiStack-root').filter({ has: page.getByLabel('Name', { exact: true }) }).filter({ has: page.getByLabel('Cluster UID', { exact: true }) }).last()
            await page.mouse.move(0, 0)
            await page.waitForTimeout(600)
            await form.screenshot({ path: `${MEDIA}/manage-clusters-route.png` })
            await clusters.locator('.MuiDialogActions-root').getByRole('button', { name: 'NEW', exact: true }).click()
        }
        await dismissOpenDialogs(page)
    }
    finally {
        await writeMarketplaces(page, s, original)
    }
})
