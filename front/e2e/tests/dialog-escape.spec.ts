import { test, expect } from '@playwright/test'
import { login, clickMenuItem, clickExtensionMenuItem, dismissOpenDialogs, configureCogOf } from './helpers'

/*
    Escape closes a core dialog, and ONLY the thing on top (tools/useKeyboard.ts → useEscapeToClose).

    It listens on window, so it works wherever the focus is. Its first version did that and also closed
    the whole dialog on an Escape meant for an open dropdown, took the dialog underneath along, and stopped
    every keydown. Going through MUI's onClose instead fixed those three and broke the first: a dialog
    opened from the menu does not hold the focus, and MUI only hears Escape from inside. All four are here.

    NON-destructive: it opens dialogs and closes them with Escape. Nothing is saved.
*/

test.describe.configure({ mode: 'serial' })

test('🔴 a dialog just opened from the menu closes with Escape, without clicking inside it first', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'Kwirth settings')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
    await expect(dialog.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: 10000 })

    // nothing clicked: the focus is wherever the menu left it
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
})

test('Escape on an open dropdown closes the list, not the dialog; a second Escape closes the dialog', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'Kwirth settings')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
    await expect(dialog.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: 10000 })

    await dialog.getByRole('combobox', { name: 'Sender for the previous container log' }).click()
    const listbox = page.locator('[role="listbox"]')
    await expect(listbox).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(listbox, 'the dropdown should close').toBeHidden()
    await expect(dialog, 'the dialog must survive closing its dropdown').toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog, 'with nothing open on top, Escape closes the dialog').toBeHidden()
})

/*
    The upper dialog here is a sender's 'Configure:' (ConfigListDialog), which has no Escape of its own: an
    Escape on it does nothing. What is pinned is the bug that is gone — the window listener used to hand
    that Escape to the MANAGER underneath, which closed while the user was looking at the dialog on top.
*/
test('an Escape on the upper of two stacked dialogs never closes the one underneath', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    await clickExtensionMenuItem(page, 'Senders')
    const manager = page.getByRole('dialog').filter({ hasText: 'Manage senders' })
    await manager.waitFor()
    const cog = configureCogOf(manager, /^Console Sender/)
    test.skip(await cog.count() === 0, 'console sender is not installed')
    await cog.click()

    // ⚠️ counted as .MuiDialog-root: with two stacked, MUI aria-hides the lower one and the role stops seeing it
    await expect(page.locator('.MuiDialog-root')).toHaveCount(2, { timeout: 10000 })

    await page.keyboard.press('Escape')
    await page.waitForTimeout(800)
    await expect(page.locator('.MuiDialog-root'), 'the Escape went to the dialog underneath').toHaveCount(2)

    // closed by its own button, and then the manager — now on top — does take Escape
    await page.getByRole('dialog').filter({ hasText: /^Configure:/ }).getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.locator('.MuiDialog-root')).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(manager, 'on top, the manager closes with Escape').toBeHidden()
})
