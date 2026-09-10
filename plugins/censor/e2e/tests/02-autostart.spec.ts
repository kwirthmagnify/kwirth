import { test, expect } from '@playwright/test'
import { openCensor, openConfigDialog } from './helpers'

// Autostart del ANALISIS: un unico switch para todo el canal, bajo la lista de configs.
//
// NO DESTRUCTIVO y sin gasto de LLM: el spec comprueba el contrato de UI (que el switch existe, que
// es unico, que esta fuera del editor de la config seleccionada y que se puede conmutar) y SIEMPRE
// cierra con Cancel, asi que no persiste nada ni arranca un analisis contra el LLM real del usuario.
// El comportamiento (que el flag arranca el analisis al arrancar el channel) esta cubierto de forma
// determinista por el harness: tests/back/CensorAutostart.test.ts.
test.describe('Censor — autostart del analisis', () => {

    test('el switch de autostart existe, es unico y vive fuera del editor de config', async ({ page }) => {
        await openCensor(page)
        const dialog = await openConfigDialog(page)

        const autoStart = dialog.getByText("Auto start what's ON")
        await expect(autoStart).toHaveCount(1)
        await expect(autoStart).toBeVisible()

        // Esta en el panel de la lista (aplica a todas las configs), no en la pestana General del editor
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

        // Reabrir: al no haber pulsado OK, el valor sigue siendo el original
        const reopened = await openConfigDialog(page)
        expect(await reopened.locator('input[type="checkbox"]').last().isChecked()).toBe(before)
        await reopened.getByRole('button', { name: 'Cancel' }).click()
    })
})
