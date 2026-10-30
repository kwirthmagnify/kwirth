import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs, CARGA } from './helpers'

/*
    The Log tab of Kwirth settings.

    What is worth a net here is not that the selects draw: it is that the dialog offers what the BACK END
    publishes and sends back what the back end understands. The list of components is not an enum in the
    front end — it is asked for at GET /core/settings/log/components — so a mismatch between the two sides
    shows up as an empty tab rather than as an error, which is the kind of failure that goes unnoticed.

    NON destructive: every test leaves through Cancel, so nothing is saved. The last one checks precisely
    that — that having touched the levels and cancelled did not change what is stored.

    🔴 ONE LOGIN FOR THE WHOLE FILE, in the beforeAll. There were five, one per test, and each one is a
    full start of the application: 45 s a test, 3,5 min a run, for five checks that take seconds once the
    dialog is open. Nothing here writes —every test cancels— so there is nothing a shared page could
    carry from one to the next; what each one does is open the Log tab and close it again.
*/

const INTERVAL_LABEL = 'Cluster metrics read interval (seconds)'
const COMPONENTS = ['core', 'chan', 'prov', 'send', 'auth', 'stor']

/*
    The level selects of the Log tab. Only the VISIBLE ones: the dialog's tabs are hidden, not unmounted, so
    the first combobox of the whole dialog is the General tab's previous-log sender. These tests took that
    one for the 'core' row for a while — the "cancel" one could not click it (hidden) and the "in force" one
    passed by luck, checking the wrong select.
*/
const logSelects = (dialog: ReturnType<Page['getByRole']>) => dialog.locator('[role="combobox"]').filter({ visible: true })

const openLogTab = async (page: Page) => {
    await clickMenuItem(page, 'Kwirth settings')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
    // El campo se habilita cuando el dialogo ha terminado de traer sus datos: espera de carga, no de UI.
    await expect(dialog.getByLabel(INTERVAL_LABEL)).toBeEnabled({ timeout: CARGA })
    await dialog.getByRole('tab', { name: 'Log' }).click()
    return dialog
}

test.describe.serial('Kwirth settings · Log', () => {
let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    await dismissOpenDialogs(page)
})

test.afterAll(async () => { await page?.close() })

test('la pestaña ofrece los SEIS componentes que publica el back', async () => {
    const dialog = await openLogTab(page)

    // By its tag, which is what the log prints and what travels in the settings. Two of them — auth and
    // stor — could not even be turned on before this existed.
    for (const component of COMPONENTS) {
        await expect(dialog.getByText(`[${component}]`), `falta el componente '${component}'`).toBeVisible()
    }

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})

test('🔴 se abre con lo que RIGE, no en blanco', async () => {
    /*
        With nothing configured, what is stored is undefined: were the dialog to show that, it would open
        blank while the core writes under its defaults — one thing on screen and another in the log.
    */
    const dialog = await openLogTab(page)

    const selects = logSelects(dialog)
    await expect(selects.first()).not.toHaveText('')
    // One per component, plus one per id that has written: never fewer than the six.
    expect(await selects.count()).toBeGreaterThanOrEqual(COMPONENTS.length)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})

test('dice que un error nunca se silencia', async () => {
    // It is the rule that makes the filter safe to use, and it is stated rather than left to be found out.
    const dialog = await openLogTab(page)

    await expect(dialog.getByText(/Errors are always written/)).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})

test('Reset to defaults solo está en la pestaña del log', async () => {
    /*
        On the other tabs 'defaults' would mean emptying the marketplaces and the package registries —
        configuration somebody composed by hand — so the button is not even offered there.
    */
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

test('cambiar un nivel y cancelar NO guarda nada', async () => {
    let dialog = await openLogTab(page)

    // The core's select is the first one of the tab: it is its first row.
    const coreSelect = logSelects(dialog).first()
    const before = await coreSelect.textContent()
    await coreSelect.click()
    await page.getByRole('option', { name: /Errors only/ }).click()
    await expect(coreSelect).not.toHaveText(before ?? '')

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)

    dialog = await openLogTab(page)
    await expect(logSelects(dialog).first()).toHaveText(before ?? '')

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})
})
