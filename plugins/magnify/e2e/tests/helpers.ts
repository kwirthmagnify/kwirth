import { Page, expect } from '@playwright/test'

export const USER = process.env.METRICS_E2E_USER ?? 'admin'
export const PASS = process.env.METRICS_E2E_PASS ?? ''
export const CLUSTER = process.env.METRICS_E2E_CLUSTER ?? 'inCluster'
export const CHANNEL = 'magnify'

// Order of the resource selector's dropdowns. They stay mounted (disabled, not unmounted), so the
// indices are stable whichever view is chosen. The channel dropdown is always the LAST one.
export const COMBO_CLUSTER = 0
export const COMBO_VIEW = 1

/**
 * Login. The front end's dev server recompiles and can take a while to draw, so it waits generously
 * for either the form or the resource selector to appear, and after submitting it waits for the
 * selector rather than a fixed timeout.
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
    /*
        The plugins' front bundles load AFTER the login, asynchronously. Picking the cluster before
        Magnify's is in leaves it out of the channel list, and the test fails saying the plugin is not
        there when it simply had not arrived yet.
    */
    await page.waitForFunction((id) => Boolean((window as unknown as { __kwirth_plugins__?: Record<string, unknown> }).__kwirth_plugins__?.[id]), CHANNEL, { timeout: 60000 })
    await page.waitForTimeout(1000)
}

export async function pickCombo(page: Page, index: number, option: string): Promise<void> {
    await page.getByRole('combobox').nth(index).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByRole('option', { name: option, exact: true }).click()
    await page.waitForTimeout(600)
}

/** Opens the channel dropdown (the last combo) and leaves it open. */
export async function openChannelCombo(page: Page): Promise<void> {
    const count = await page.getByRole('combobox').count()
    await page.getByRole('combobox').nth(count - 1).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
}

/** The channel's option in the open channel dropdown. */
export const channelOption = (page: Page) => page.getByRole('option').filter({ hasText: new RegExp(`^${CHANNEL}$`) }).first()

/** Cluster → View=cluster → channel magnify → ADD → Start: Magnify open on the whole cluster. */
export async function openMagnify(page: Page): Promise<void> {
    await pickCombo(page, COMBO_CLUSTER, CLUSTER)
    await pickCombo(page, COMBO_VIEW, 'cluster')
    await openChannelCombo(page)
    await channelOption(page).click()
    await page.waitForTimeout(400)
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
    await openTabMenu(page)
    await page.getByRole('menuitem', { name: 'Start' }).click()
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
