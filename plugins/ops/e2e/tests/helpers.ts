import { Page, expect } from '@playwright/test'

export const USER = process.env.OPS_E2E_USER ?? 'admin'
export const PASS = process.env.OPS_E2E_PASS ?? ''
export const CLUSTER = process.env.OPS_E2E_CLUSTER ?? 'inCluster'
export const CHANNEL = 'ops'

/**
 * Login. The front end's dev server recompiles and can take a while to draw, so it waits generously for either the
 * form or the resource selector to appear, and after submitting it waits for the selector.
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
