import { test, expect } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs, GUIDE_MEDIA, CARGA } from './helpers'

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
    await expect(dialog.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: CARGA })

    /*
        A snackbar from a cluster that is down —'Cluster security-nopro not enabled'— slides in over the
        dialog and ends up in the guide as if it were part of it. Closing them one by one does not work:
        the front keeps retrying the dead clusters and a new one arrives while the shot is being taken.
        Hidden by CSS for the whole capture, which does not depend on timing.
    */
    await page.addStyleTag({ content: '.MuiSnackbar-root { display: none !important; }' })
    await page.waitForTimeout(1500)

    // the full page, with the dialog in context over the app: it is the framing of the image it replaces
    await page.screenshot({ path: `${MEDIA}/admin-kwirth-settings.png` })

    /*
        And the Log tab, which is a screen of its own: the components with their levels and, under each,
        whoever writes beneath it. The general shot does not show it — it opens on General — and this is
        the part of the dialog the guide explains at length.
    */
    /*
        The Notifications tab (signup S4): the senders that tell somebody — the previous container log's,
        moved here from General, and the access requests'. Only the chosen values show, with the lists
        closed, so nothing of what else this machine has installed is in the picture.
    */
    await dialog.getByRole('tab', { name: 'Notifications' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${MEDIA}/admin-kwirth-settings-notifications.png` })

    await dialog.getByRole('tab', { name: 'Log' }).click()
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${MEDIA}/admin-kwirth-settings-log.png` })

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})

/*
    🔴 It captures 'Kwirth export', NOT a 'Kwirth portability' dialog: that single dialog was split in
    two —export and import, one menu entry each— and this spec went on looking for the old one, so it
    had been failing silently and the guide was still showing a September screenshot of a window that no
    longer exists.
*/
test('capture kwirth-portability (dark)', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'Kwirth export')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth export' })
    await dialog.waitFor()
    // wait until it has read what can be exported: otherwise the spinner is what gets captured. The list
    // arrives in collapsed blocks and the 'Kwirth' one —which holds the AI entry— only shows once loaded
    await expect(dialog.getByRole('checkbox', { name: 'Kwirth', exact: true })).toBeVisible({ timeout: 15000 })

    /*
        The 'Kwirth' block is expanded for the shot: collapsed, the guide tells the reader to tick 'AI
        providers and models' under it and the picture shows neither that entry nor 'Kwirth settings'.

        🔴 The chevron, never the label: the label belongs to the FormControlLabel of the block's own
        checkbox, so clicking it UNTICKS the whole block — and the screenshot then documents, in a guide
        that says it travels by default, a Kwirth block switched off.
    */
    const kwirthBlock = dialog.locator('.MuiBox-root').filter({ has: page.getByRole('checkbox', { name: 'Kwirth', exact: true }) }).last()
    await kwirthBlock.getByRole('button').first().click()
    await expect(dialog.getByText('AI providers and models')).toBeVisible({ timeout: 5000 })
    await expect(dialog.getByRole('checkbox', { name: 'Kwirth', exact: true })).toBeChecked()

    /*
        A snackbar from a cluster that is down slides in over the dialog and lands in the guide as if it
        were part of it. Closing them one by one does not work: the front keeps retrying and a new one
        arrives while the shot is being taken.
    */
    await page.addStyleTag({ content: '.MuiSnackbar-root { display: none !important; }' })
    await page.waitForTimeout(800)

    await page.screenshot({ path: `${MEDIA}/admin-kwirth-portability.png` })

    // Non-destructive: it only looks. Nothing is exported and nothing is imported. Closing is left to
    // the helper, which tries Cancel/OK/Close and then Escape: naming the button here is what used to
    // make this capture end in red AFTER having written the screenshot correctly.
    await dismissOpenDialogs(page)
})
