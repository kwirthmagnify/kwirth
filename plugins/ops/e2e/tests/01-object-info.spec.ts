import { test, expect, Page } from '@playwright/test'
import { CHANNEL, CLUSTER, login } from './helpers'

/*
    Ops' 'Object info' (describe) shows the object as JSON coloured by type — the shared JsonBlock of
    kwirth-common-front, which replaced react-json-view-lite (2026-11-15).

    ⛔ READ-ONLY: it only opens 'Object info'. No terminal is opened and nothing is restarted or deleted.
*/

test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const NAMESPACE = 'kube-system'
let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: CLUSTER }).click()
    await page.waitForTimeout(800)
    await page.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'namespace', exact: true }).click()
    await page.waitForTimeout(800)
    // the namespace is a multi-select: tick one and close it
    await page.getByRole('combobox').nth(2).click()
    await page.getByRole('option', { name: NAMESPACE, exact: true }).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    const combos = page.getByRole('combobox')
    await combos.nth(await combos.count() - 1).click()
    await page.getByRole('option', { name: CHANNEL, exact: true }).click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
})

test.afterAll(async () => {
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

test('Object info shows the object as JSON coloured by type', async () => {
    // the Ops tab may need starting: Start opens its setup first, accepted with its defaults
    const menuButtons = page.locator('[data-testid="MoreVertIcon"]')
    if (await menuButtons.count() === 0) {
        await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
        await page.getByRole('menuitem', { name: 'Start', exact: true }).click()
        const setup = page.getByRole('dialog').filter({ hasText: 'Configure Ops' })
        await expect(setup).toBeVisible()
        await setup.getByRole('button', { name: 'OK', exact: true }).click()
    }
    await expect(menuButtons.first()).toBeVisible({ timeout: 30000 })
    await menuButtons.first().click()
    await page.getByRole('menuitem', { name: /Object info/ }).click()

    const dialog = page.getByRole('dialog').filter({ hasText: 'Object info' })
    await expect(dialog).toBeVisible({ timeout: 30000 })
    const json = dialog.locator('pre').first()
    // what is described is the container's definition: it always carries its name
    await expect(json).toContainText('"name":', { timeout: 30000 })
    // coloured: keys and values are spans with their own colour
    expect(await json.locator('span[style*="color"]').count()).toBeGreaterThan(0)
    await dialog.getByRole('button', { name: /ok/i }).click()
    await expect(dialog).toHaveCount(0)
})
