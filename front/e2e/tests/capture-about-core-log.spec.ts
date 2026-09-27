import { test, expect } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs, GUIDE_MEDIA } from './helpers'

// Screenshot of the guide's image for "Reading the core's own log" (the admin guide). Dark theme.
// Run by hand: playwright test --config playwright.capture.config.ts capture-about-core-log.spec.ts
// Non-destructive: it opens the About, reads the log and closes. It writes nothing.

const MEDIA = GUIDE_MEDIA

test('capture the core log viewer (dark)', async ({ page }) => {
    // the same framing as the rest of the admin guide's screenshots
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'About Kwirth...')
    const about = page.getByRole('dialog').filter({ hasText: 'About Kwirth' })
    await about.waitFor()

    // The request goes out on the click, so the viewer is born saying 'Reading the log...': waiting for
    // the line count is what tells the lines have arrived and there is something coloured to photograph.
    await about.getByRole('button', { name: 'Core log' }).click()
    const viewer = page.getByRole('dialog').filter({ hasText: 'Log of the core' })
    await viewer.waitFor()
    await expect(viewer.getByText(/^Last \d+ lines$/)).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(1000)

    await page.screenshot({ path: `${MEDIA}/admin-about-core-log.png` })

    await viewer.getByRole('button', { name: 'Close' }).click()
    await about.getByRole('button', { name: 'OK' }).click()
    await dismissOpenDialogs(page)
})
