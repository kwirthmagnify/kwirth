import { Page } from '@playwright/test'

export const USER = process.env.RALLYX_E2E_USER ?? 'admin'
export const PASS = process.env.RALLYX_E2E_PASS ?? ''
export const CLUSTER = process.env.RALLYX_E2E_CLUSTER ?? 'inCluster'

/**
 * Login. Wait for the SPA to paint the login form or, if the session is still alive, the resource
 * selector, and only fill the form if it is present.
 */
export async function login(page: Page, user = USER, pass = PASS): Promise<void> {
    await page.goto('/')
    const userField = page.getByLabel('User')
    const combo = page.getByRole('combobox').first()
    await Promise.race([
        userField.waitFor({ state: 'visible', timeout: 30000 }).catch(() => { }),
        combo.waitFor({ state: 'visible', timeout: 30000 }).catch(() => { })
    ])
    if (await userField.isVisible().catch(() => false)) {
        await userField.fill(user)
        await page.getByLabel('Password').fill(pass)
        await page.getByRole('button', { name: 'OK' }).click()
        await page.waitForTimeout(2500)
    }
}

/**
 * The CRA error overlay is painted in an iframe: if present, the front does NOT compile.
 */
export async function assertFrontCompiles(page: Page): Promise<void> {
    const overlay = page.locator('iframe#webpack-dev-server-client-overlay')
    if (await overlay.count() > 0) {
        throw new Error('The front does NOT compile: CRA overlay is present. Restart the dev server before running e2e.')
    }
}

/**
 * Open a Rally-X channel tab: login → Cluster → View=none → Channel=rallyx → ADD.
 * Rally-X is an AUTONOMOUS channel (cluster:false + resourced:false), so its only view is 'none'.
 */
export async function openRallyx(page: Page): Promise<void> {
    await login(page)
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: CLUSTER }).click()
    await page.waitForTimeout(800)
    await page.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'none', exact: true }).click()
    await page.waitForTimeout(800)
    const combos = page.getByRole('combobox')
    await combos.nth(await combos.count() - 1).click()
    await page.getByRole('option', { name: 'rallyx', exact: true }).click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
}

/**
 * Start the active tab via its menu (gear icon → Start).
 * Rally-X declares `setup: true`, so Start opens the config dialog
 * and it must be confirmed with OK.
 */
export async function startChannel(page: Page): Promise<void> {
    await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
    await page.getByText('Start', { exact: true }).click()
    const dialog = page.getByRole('dialog')
    if (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) {
        await dialog.getByRole('button', { name: 'OK', exact: true }).click()
    }
    await page.waitForTimeout(3000)   // START/RESPONSE → instanceId + Phaser boots
}

/** Stop the active tab via its menu. */
export async function stopChannel(page: Page): Promise<void> {
    await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
    await page.getByText('Stop', { exact: true }).click()
    await page.waitForTimeout(1500)
}

/** Locate the Rally-X game iframe inside the page. */
export function rallyxFrame(page: Page) {
    return page.frameLocator('iframe[title="Rally-X"]')
}
