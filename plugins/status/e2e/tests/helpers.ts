import { Page, Locator, expect } from '@playwright/test'

export const USER = process.env.STATUS_E2E_USER ?? 'admin'
export const PASS = process.env.STATUS_E2E_PASS ?? ''
export const CLUSTER = process.env.STATUS_E2E_CLUSTER ?? 'inCluster'
export const CHANNEL = 'status'

/**
 * Login. The front end's dev server recompiles and can take a while to draw, so it waits generously for
 * either the form or the resource selector to appear, and after submitting it waits for the selector
 * rather than a fixed timeout (that was the cause of intermittent blank-page failures).
 */
export async function login(page: Page, user = USER, pass = PASS): Promise<void> {
    await page.goto('/')
    const userField = page.getByLabel('User')
    const combo = page.getByRole('combobox').first()
    await Promise.race([
        userField.waitFor({ state: 'visible', timeout: 90000 }).catch(() => { }),
        combo.waitFor({ state: 'visible', timeout: 90000 }).catch(() => { })
    ])
    if (await userField.isVisible().catch(() => false)) {
        await userField.fill(user)
        await page.getByLabel('Password').fill(pass)
        await page.getByRole('button', { name: 'OK' }).click()
    }
    await expect(combo).toBeVisible({ timeout: 60000 })
}

/** Cluster → View=cluster → leaves the channel combo open and returns the provider-debug option. */
export async function openChannelPicker(page: Page): Promise<Locator> {
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: CLUSTER }).click()
    await page.waitForTimeout(800)
    await page.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'cluster', exact: true }).click()
    await page.waitForTimeout(800)
    const combos = page.getByRole('combobox')
    await combos.nth(await combos.count() - 1).click()
    return page.getByRole('option', { name: CHANNEL, exact: true })
}

/**
 * Opens the active tab's menu (the gear icon).
 * There is no need to clean up tabs afterwards: they are not persisted between browser sessions, so
 * every test starts with the user's workspace intact.
 */
export async function openTabMenu(page: Page): Promise<void> {
    await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
    await page.waitForTimeout(500)
}
