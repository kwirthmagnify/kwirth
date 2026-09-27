import { test, expect } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs, GUIDE_MEDIA } from './helpers'

// Screenshot of the guide's image for "Kwirth settings" (docs/_media/guide). Dark theme.
// Ejecutar a mano: playwright test capture-kwirth-settings.spec.ts
// Non-destructive: it only opens the dialog and closes it with Cancel, saving nothing.

// The screenshots go to the LIVE documentation: see GUIDE_MEDIA in helpers.ts.
const MEDIA = GUIDE_MEDIA

test('capture kwirth-settings (dark)', async ({ page }) => {
    // the same framing as the image it replaces, so the guide's visual rhythm is not broken
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'Kwirth settings')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
    await dialog.waitFor()

    // wait until the dialog has finished reading the settings: otherwise the spinner is captured
    await expect(dialog.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: 10000 })
    await page.waitForTimeout(1500)

    // the full page, with the dialog in context over the app: it is the framing of the image it replaces
    await page.screenshot({ path: `${MEDIA}/admin-kwirth-settings.png` })

    /*
        And the Log tab, which is a screen of its own: the components with their levels and, under each,
        whoever writes beneath it. The general shot does not show it — it opens on General — and this is
        the part of the dialog the guide explains at length.
    */
    await dialog.getByRole('tab', { name: 'Log' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${MEDIA}/admin-kwirth-settings-log.png` })

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})

test('capture kwirth-portability (dark)', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'Kwirth portability')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth portability' })
    await dialog.waitFor()
    // wait until it has read what can be exported: otherwise the spinner is what gets captured
    await expect(dialog.getByText('Kwirth settings')).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1000)

    await page.screenshot({ path: `${MEDIA}/admin-kwirth-portability.png` })

    // Non-destructive: it only looks. Nothing is exported and nothing is imported.
    await dialog.getByRole('button', { name: 'Close' }).click()
    await dismissOpenDialogs(page)
})
