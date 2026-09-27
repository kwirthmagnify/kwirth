import { test, expect } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs, GUIDE_MEDIA } from './helpers'

// Screenshot of the guide's image for "After an unexpected restart" (the admin guide). Dark theme.
// Run by hand: playwright test --config playwright.capture.config.ts capture-about-previous-log.spec.ts
// Non-destructive: it opens the About, looks at it and closes it. It restarts nothing.

const MEDIA = GUIDE_MEDIA

test('capture about previous container log (dark)', async ({ page }) => {
    // the same framing as the rest of the admin guide's screenshots
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'About Kwirth...')
    const dialog = page.getByRole('dialog').filter({ hasText: 'About Kwirth' })
    await dialog.waitFor()

    // the button is born disabled and resolves when the core answers: without waiting, the intermediate
    // state is captured, with the tooltip saying "Checking whether this container has restarted..."
    await expect(dialog.getByRole('button', { name: 'Previous container log' })).toHaveCount(1)
    await page.waitForTimeout(2000)

    await page.screenshot({ path: `${MEDIA}/admin-about-previous-log.png` })

    await dialog.getByRole('button', { name: 'OK' }).click()
    await dismissOpenDialogs(page)
})
