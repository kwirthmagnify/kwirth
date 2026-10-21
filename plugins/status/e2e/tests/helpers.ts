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
    /*
        After the login the core's front downloads and RUNS the front.js of every DCE and plugin installed —
        a score of scripts, some of them large. Measured: ~17 s of script in the first ~20 s, the page taking
        2.5-4 s to answer each query, then 4-7 ms. While it is busy it takes no clicks, and a test step went
        past the 15 s an action may take. The downloads end long before the running does, so waiting for the
        network is not enough: the login is over when the page answers fast several times in a row.
    */
    await page.waitForLoadState('networkidle', { timeout: 90000 }).catch(() => { })
    await settle(page)
}

/** Waits until the page answers fast three times in a row: its main thread is no longer busy. */
export async function settle(page: Page, timeout = 90000): Promise<void> {
    const until = Date.now() + timeout
    let calm = 0
    while (calm < 3 && Date.now() < until) {
        const t0 = Date.now()
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve(true))))
        calm = Date.now() - t0 < 150 ? calm + 1 : 0
        await page.waitForTimeout(300)
    }
}

/** Cluster → View=cluster → leaves the channel combo open and returns the provider-debug option. */
export async function openChannelPicker(page: Page): Promise<Locator> {
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: CLUSTER }).click()
    await page.waitForTimeout(800)
    await page.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'cluster', exact: true }).click()
    await page.waitForTimeout(800)
    /*
        The channel list is computed for the cluster just picked, and on a loaded machine it can arrive after
        the fixed pause: opened too early, the list stays without the channel. So it is opened until the
        channel is in it — closing and reopening — instead of trusting a timer.
    */
    const combos = page.getByRole('combobox')
    const option = page.getByRole('option', { name: CHANNEL, exact: true })
    await expect(async () => {
        if (await option.isVisible().catch(() => false)) return
        await page.keyboard.press('Escape')
        await combos.nth(await combos.count() - 1).click()
        if (!(await option.isVisible({ timeout: 2000 }).catch(() => false))) {
            // Said, so a failure shows what the picker DID offer instead of only what it did not.
            const values = await combos.evaluateAll(cs => cs.map(c => (c.textContent ?? '').trim()))
            const offered = await page.getByRole('option').allInnerTexts()
            console.log(`[e2e] '${CHANNEL}' not offered yet. Selectors: ${JSON.stringify(values)} · options: ${JSON.stringify(offered)}`)
        }
        await expect(option).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 30000 })
    return option
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
