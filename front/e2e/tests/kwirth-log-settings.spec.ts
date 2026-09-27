import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

/*
    The Log tab of Kwirth settings.

    What is worth a net here is not that the selects draw: it is that the dialog offers what the BACK END
    publishes and sends back what the back end understands. The list of components is not an enum in the
    front end — it is asked for at GET /core/settings/log/components — so a mismatch between the two sides
    shows up as an empty tab rather than as an error, which is the kind of failure that goes unnoticed.

    NON destructive: every test leaves through Cancel, so nothing is saved. The last one checks precisely
    that — that having touched the levels and cancelled did not change what is stored.
*/

const INTERVAL_LABEL = 'Cluster metrics read interval (seconds)'
const COMPONENTS = ['core', 'chan', 'prov', 'send', 'auth', 'stor']

const openLogTab = async (page: Page) => {
    await clickMenuItem(page, 'Kwirth settings')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
    await expect(dialog.getByLabel(INTERVAL_LABEL)).toBeEnabled({ timeout: 10000 })
    await dialog.getByRole('tab', { name: 'Log' }).click()
    return dialog
}

test('la pestaña ofrece los SEIS componentes que publica el back', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    const dialog = await openLogTab(page)

    // By its tag, which is what the log prints and what travels in the settings. Two of them — auth and
    // stor — could not even be turned on before this existed.
    for (const component of COMPONENTS) {
        await expect(dialog.getByText(`[${component}]`), `falta el componente '${component}'`).toBeVisible()
    }

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})

test('🔴 se abre con lo que RIGE, no en blanco', async ({ page }) => {
    /*
        With nothing configured, what is stored is undefined: were the dialog to show that, it would open
        blank while the core writes under its defaults — one thing on screen and another in the log.
    */
    await login(page)
    await dismissOpenDialogs(page)
    const dialog = await openLogTab(page)

    const selects = dialog.locator('[role="combobox"]')
    await expect(selects.first()).not.toHaveText('')
    // One per component, plus one per id that has written: never fewer than the six.
    expect(await selects.count()).toBeGreaterThanOrEqual(COMPONENTS.length)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})

test('dice que un error nunca se silencia', async ({ page }) => {
    // It is the rule that makes the filter safe to use, and it is stated rather than left to be found out.
    await login(page)
    await dismissOpenDialogs(page)
    const dialog = await openLogTab(page)

    await expect(dialog.getByText(/Errors are always written/)).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})

test('Reset to defaults solo está en la pestaña del log', async ({ page }) => {
    /*
        On the other tabs 'defaults' would mean emptying the marketplaces and the package registries —
        configuration somebody composed by hand — so the button is not even offered there.
    */
    await login(page)
    await dismissOpenDialogs(page)
    const dialog = await openLogTab(page)

    await expect(dialog.getByRole('button', { name: 'Reset to defaults' })).toBeVisible()

    await dialog.getByRole('tab', { name: 'Marketplaces' }).click()
    await expect(dialog.getByRole('button', { name: 'Reset to defaults' })).toHaveCount(0)
    await dialog.getByRole('tab', { name: 'Package registries' }).click()
    await expect(dialog.getByRole('button', { name: 'Reset to defaults' })).toHaveCount(0)
    await dialog.getByRole('tab', { name: 'General' }).click()
    await expect(dialog.getByRole('button', { name: 'Reset to defaults' })).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})

test('cambiar un nivel y cancelar NO guarda nada', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    let dialog = await openLogTab(page)

    // The core's select is the first one: it is the first row of the tab.
    const coreSelect = dialog.locator('[role="combobox"]').first()
    const before = await coreSelect.textContent()
    await coreSelect.click()
    await page.getByRole('option', { name: /Errors only/ }).click()
    await expect(coreSelect).not.toHaveText(before ?? '')

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)

    dialog = await openLogTab(page)
    await expect(dialog.locator('[role="combobox"]').first()).toHaveText(before ?? '')

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})
