import { test, expect } from '@playwright/test'
import { openCensor, openConfigDialog } from './helpers'

// Autostart of the ANALYSIS: a single switch for the whole channel, below the config list.
//
// NON-DESTRUCTIVE and with no LLM spend: the spec checks the UI contract (that the switch exists, that
// there is only one, that it sits outside the selected config's editor and that it can be toggled) and
// ALWAYS closes with Cancel, so nothing is persisted and no analysis is started against the user's real
// LLM. The behaviour (that the flag starts the analysis when the channel starts) is covered
// deterministically by the harness: tests/back/CensorAutostart.test.ts.
test.describe('Censor — autostart del analisis', () => {

    test('el switch de autostart existe, es unico y vive fuera del editor de config', async ({ page }) => {
        await openCensor(page)
        const dialog = await openConfigDialog(page)

        const autoStart = dialog.getByText("Auto start what's ON")
        await expect(autoStart).toHaveCount(1)
        await expect(autoStart).toBeVisible()

        // It lives in the list panel (it applies to every config), not in the editor's General tab
        await expect(dialog.getByRole('tab', { name: 'General' })).toBeVisible()
        await dialog.getByRole('tab', { name: 'General' }).click()
        await expect(dialog.getByText('Active')).toBeVisible()
        await expect(autoStart).toBeVisible()

        await dialog.getByRole('button', { name: 'Cancel' }).click()
        await expect(dialog).toBeHidden()
    })

    test('el switch se conmuta y Cancel no persiste nada', async ({ page }) => {
        await openCensor(page)
        const dialog = await openConfigDialog(page)

        const toggle = dialog.locator('input[type="checkbox"]').last()
        const before = await toggle.isChecked()
        await toggle.click({ force: true })
        expect(await toggle.isChecked()).toBe(!before)

        await dialog.getByRole('button', { name: 'Cancel' }).click()
        await expect(dialog).toBeHidden()

        // Reopen: as OK was never pressed, the value is still the original one
        const reopened = await openConfigDialog(page)
        expect(await reopened.locator('input[type="checkbox"]').last().isChecked()).toBe(before)
        await reopened.getByRole('button', { name: 'Cancel' }).click()
    })
})
