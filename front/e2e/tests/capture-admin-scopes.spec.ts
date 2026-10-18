import { test, expect } from '@playwright/test'
import { login, dismissOpenDialogs, openMenu, GUIDE_MEDIA } from './helpers'

// Screenshot of the Scopes selector for the admin guide (04-security-and-permissions).
// Ejecutar a mano: playwright test capture-admin-scopes.spec.ts
//
// It is retaken because the selector changed: every scope belonging to a channel now carries a gear that
// limits it. The old image showed only the checkboxes, so it no longer documents what is on screen.
//
// Non-destructive: it opens User security, opens the dropdown and closes everything. Nothing is saved.

const MEDIA = GUIDE_MEDIA

test('capture admin-scopes (dark)', async ({ page }) => {
    // the same framing as the image it replaces, so the guide's visual rhythm is not broken
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await dismissOpenDialogs(page)

    await openMenu(page)
    // Forced, like openMenu itself: otherwise the click reaches 'performing click action' and never
    // settles, which is the shape MUI's menus fail in here.
    await page.getByRole('menuitem', { name: 'User security', exact: true }).click({ force: true })
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(1000)

    // the dropdown open, which is where the gears are
    await dialog.locator('.MuiFormControl-root').filter({ has: page.getByText('Scopes', { exact: true }) })
        .getByRole('combobox').click()
    const listbox = page.getByRole('listbox')
    await listbox.waitFor({ state: 'visible', timeout: 10000 })

    /*
        Filtered to File Manager's scopes. Two reasons, both deliberate:
          · The gear is only on CHANNEL scopes, so an unfiltered list opens on the core's (cluster, admin,
            api…) and documents none of what this section is about.
          · It has to be a scope of a PUBLIC plugin. Filtering by what all channels share ('·') pulls in
            whatever this machine happens to have installed, paid products included, and those do not
            belong in the core's public guide.
        It is also the example the section's text uses.
    */
    await listbox.getByPlaceholder('Filter scopes…').fill('File Manager')
    await page.waitForTimeout(800)

    /*
        🔴 The popover, NOT the page. The dialog behind it is User management, whose left column lists
        real accounts by e-mail — and these images go to the published documentation.
    */
    await page.locator('.MuiMenu-paper').screenshot({ path: `${MEDIA}/admin-scopes.png` })

    await page.keyboard.press('Escape')
    await dismissOpenDialogs(page)
})
