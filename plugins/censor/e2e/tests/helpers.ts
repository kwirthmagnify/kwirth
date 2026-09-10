import { Page, Locator, expect } from '@playwright/test'

export const USER = process.env.CENSOR_E2E_USER ?? 'admin'
export const PASS = process.env.CENSOR_E2E_PASS ?? ''
export const CLUSTER = process.env.CENSOR_E2E_CLUSTER ?? 'inCluster'

/** Login with the given credentials. Waits until the SPA actually renders — either the login form or,
 *  if the session persisted, the resource selector — then logs in only if the form is present. */
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
 * Drives the resource selector up to the channel combobox: Cluster → View=cluster.
 * Leaves the channel combobox OPEN so the caller can assert/select the 'censor' option.
 */
export async function openChannelPicker(page: Page): Promise<Locator> {
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: CLUSTER }).click()
    await page.waitForTimeout(800)
    await page.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'cluster', exact: true }).click()
    await page.waitForTimeout(800)
    const combos = page.getByRole('combobox')
    await combos.nth(await combos.count() - 1).click()
    return page.getByRole('option', { name: 'censor', exact: true })
}

/** Starts the currently selected channel tab via its menu (gear icon → Start). */
export async function startChannel(page: Page): Promise<void> {
    await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
    await page.getByText('Start', { exact: true }).click()
    await page.waitForTimeout(1500)
}

/**
 * Full open + start: login → Cluster → View=cluster → Channel=censor → ADD → Start.
 * Starting the channel opens the Censor setup dialog (line limits); confirming it with its own
 * "Start" button mounts the panel. Leaves the Censor panel running WITHOUT analyzing: opening the
 * channel only inventories objects, so no log stream and no LLM call happens here.
 */
export async function openCensor(page: Page, user = USER, pass = PASS): Promise<void> {
    await login(page, user, pass)
    const censorOption = await openChannelPicker(page)
    await censorOption.click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
    // The setup dialog may open on ADD or need the channel menu → Start to appear.
    const setupDialog = page.getByRole('dialog', { name: 'Censor' })
    if (!(await setupDialog.isVisible().catch(() => false))) {
        await startChannel(page)
    }
    await setupDialog.getByRole('button', { name: 'Start', exact: true }).click()
    await expect(page.getByTestId('censor-panel')).toBeVisible({ timeout: 20_000 })
}

/** Opens ⋮ → Config and returns the config dialog locator. */
export async function openConfigDialog(page: Page): Promise<Locator> {
    await page.getByTestId('censor-menu').click()
    await page.getByTestId('censor-menu-config').click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Censor config' })
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    return dialog
}
