// Narrowing a scope from the security editor: the admin ticks a permission, says what it is limited to,
// and what gets stored is `channel#scope#<base64>` — which they never see or type.
//
// Why it matters: a permission you cannot read is a permission nobody audits. The editor has to show the
// limit in words, and reopening it has to bring back the form filled in, six months later.
//
// NON-DESTRUCTIVE: it opens User security, composes a scope in the editor and closes WITHOUT saving the
// user. No user, key or permission is written.
import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, openMenu, assertFrontCompiles } from './helpers'

const LIMIT = '/tmp'

const openSecurityEditor = async (page: Page) => {
    await login(page)
    // A click that does not land is the symptom of CRA's overlay, not of a bad locator. Said here so the
    // failure reads as 'the front does not compile' instead of as a flaky test.
    await assertFrontCompiles(page)
    await dismissOpenDialogs(page)
    await openMenu(page)
    /*
        FORCED, like openMenu itself. Without it the click reaches 'performing click action' and hangs
        until the timeout even though the item is visible, enabled and stable — the same signature that
        makes other manager specs flaky in this environment. Forcing skips the hit-target re-check, which
        is what never settles.
    */
    await page.getByRole('menuitem', { name: 'User security', exact: true }).click({ force: true })
    await page.waitForTimeout(600)
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20000 })
}

/*
    The scopes dropdown. It is reached from its LABEL and not with getByLabel: a MUI Select renders a div
    with role=combobox, and the label is only wired to it when the Select is given an explicit labelId —
    this one is not, so getByLabel finds nothing and the failure looks like the dialog never opened.
*/
const scopesCombo = (page: Page) =>
    page.getByRole('dialog').locator('.MuiFormControl-root')
        .filter({ has: page.getByText('Scopes', { exact: true }) })
        .getByRole('combobox')

/*
    Opens it, and waits for the list itself — drawn in a portal, outside the dialog. Idempotent on
    purpose: the narrowing dialog opens ON TOP of the open list and leaves it open, so a second click
    here would CLOSE it instead of opening it.
*/
const openScopes = async (page: Page) => {
    if (await page.getByRole('listbox').isVisible().catch(() => false)) return
    await scopesCombo(page).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 10000 })
}

/*
    🔴 Closing it is not tidiness, it is required before reading anything behind it. MUI's popover is a
    Modal, and a Modal marks the rest of the page `aria-hidden` — so while the list is open the dialog
    underneath does not exist for getByRole, and every locator into it finds nothing.
*/
const closeScopes = async (page: Page) => {
    if (!await page.getByRole('listbox').isVisible().catch(() => false)) return
    await page.keyboard.press('Escape')
    await page.getByRole('listbox').waitFor({ state: 'hidden', timeout: 10000 })
}

test('un scope se acota desde el editor, se lee en palabras y vuelve relleno', async ({ page }) => {
    await openSecurityEditor(page)
    await openScopes(page)

    /*
        Any scope belonging to a channel can be narrowed — the gear is on every `channel$scope`. The test
        takes the FIRST one rather than naming one, so it does not depend on which plugins this
        environment happens to have installed.
    */
    const gears = page.getByRole('button', { name: /^Narrow / })
    const count = await gears.count()
    test.skip(count === 0, 'este entorno no tiene ningun canal con scopes propios')

    const label = (await gears.first().getAttribute('aria-label'))!.replace(/^Narrow /, '')
    await gears.first().click()

    // 1) The form opens, named after the scope being narrowed
    const narrowDialog = page.getByRole('dialog').filter({ hasText: /^Narrow:/ })
    await expect(narrowDialog).toBeVisible({ timeout: 10000 })

    // 2) With nothing filled in it SAYS it grants the whole scope — the opposite of what somebody who
    //    opened this dialog intended, so it cannot be silent.
    await expect(narrowDialog.getByText(/grants .* over everything/i)).toBeVisible()

    await narrowDialog.getByLabel('Limit to').fill(LIMIT)
    await expect(narrowDialog.getByText(/grants .* over everything/i)).toHaveCount(0)
    await narrowDialog.getByRole('button', { name: /^save$/i }).click()
    await page.waitForTimeout(400)

    // 3) 🔴 Read in WORDS, never as base64: the scope's label and what it is limited to
    await closeScopes(page)
    const scopes = scopesCombo(page)
    await expect(scopes, 'el editor esta enseñando el token en crudo').not.toContainText('#')
    await expect(scopes).toContainText(label)
    await expect(scopes).toContainText(LIMIT)

    // 4) Reopening brings the form back FILLED IN — what makes the permission auditable later
    await openScopes(page)
    await page.getByRole('button', { name: `Narrow ${label}` }).click()
    await expect(narrowDialog).toBeVisible({ timeout: 10000 })
    await expect(narrowDialog.getByLabel('Limit to'), 'se reabrio vacio: el config guardado no se lee')
        .toHaveValue(LIMIT)

    // Nothing is saved: the user is left exactly as it was
    await narrowDialog.getByRole('button', { name: /^cancel$/i }).click()
    await dismissOpenDialogs(page)
})

/*
    The two forms of one permission are EXCLUSIVE in the editor, and that is the point: `fileman$write`
    beside `fileman#write#/tmp` grants everything (resources are OR'd and the wide form wins), so an
    editor that let both be ticked would silently widen what the admin was narrowing.
*/
test('acotar un scope sustituye su forma ancha, no la acompaña', async ({ page }) => {
    await openSecurityEditor(page)
    await openScopes(page)

    const gears = page.getByRole('button', { name: /^Narrow / })
    test.skip(await gears.count() === 0, 'este entorno no tiene ningun canal con scopes propios')
    const label = (await gears.first().getAttribute('aria-label'))!.replace(/^Narrow /, '')

    // tick it wide first
    await page.getByRole('option', { name: new RegExp(label) }).first().click()
    await page.waitForTimeout(300)

    // then narrow it
    await page.getByRole('button', { name: `Narrow ${label}` }).click()
    const narrowDialog = page.getByRole('dialog').filter({ hasText: /^Narrow:/ })
    await narrowDialog.getByLabel('Limit to').fill(LIMIT)
    await narrowDialog.getByRole('button', { name: /^save$/i }).click()
    await page.waitForTimeout(400)

    // ONE entry, the narrowed one — and no warning, because the wide form is gone
    await closeScopes(page)
    const scopes = scopesCombo(page)
    await expect(scopes).toContainText(LIMIT)
    await expect(page.getByText(/is granted in full as well/i), 'la guarda salta sin motivo').toHaveCount(0)

    await dismissOpenDialogs(page)
})
