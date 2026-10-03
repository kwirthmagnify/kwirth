import { test, expect, Page } from '@playwright/test'
import { openRallyx } from './helpers'

/*
    Image captures for the guide (docs/guide/images/*.png). Runs against the live dev server.
    This is NOT an assertion test: it navigates the app and takes screenshots.

    trace/screenshot/video set to 'off' and a goto('about:blank') at the end: the SPA leaves a
    WebSocket open and, with trace enabled, the teardown hangs.
*/
test.use({ trace: 'off', screenshot: 'off', video: 'off', viewport: { width: 1400, height: 900 } })

const IMG = '../docs/guide/images'

const settle = (page: Page): Promise<void> => page.waitForTimeout(900)

test('capture: rallyx guide images', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* noop */ } })

    await openRallyx(page)

    // 1. Channel stopped.
    await expect(page.getByText('Rally-X not started')).toBeVisible({ timeout: 20000 })
    await settle(page)
    await page.screenshot({ path: `${IMG}/channel-stopped.png` })

    // 2. Config dialog.
    await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
    await page.getByText('Start', { exact: true }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 10000 })
    await settle(page)
    await dialog.screenshot({ path: `${IMG}/setup-dialog.png` })

    // Confirm to start.
    await dialog.getByRole('button', { name: 'OK', exact: true }).click()
    await page.waitForTimeout(3000)
    await expect(page.locator('iframe[title="Rally-X"]')).toBeVisible({ timeout: 20000 })

    // 3. Game running.
    await settle(page)
    await page.screenshot({ path: `${IMG}/game-running.png` })

    await page.goto('about:blank')
})
