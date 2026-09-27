import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    A provider's configuration form, with the two things the core added to it:

      · the TEST button, which shows up when the provider exposes '/test' in its configRouter. There used
        to be no way of knowing whether some credentials were any good until the provider failed
        silently. Every extension that wanted it built its own; this does it once for all of them.
      · the 'multiselect' field, painted as a MULTI-value dropdown WITH CHECKBOXES. Without the check, a
        multiple-selection dropdown looks like a single-selection one.

    ⚠️ The button is NOT PRESSED: really testing goes out to the network of whatever cloud provider is
    behind it. What is checked here is the UI's contract; that the test works belongs to the manual QA.

    If the environment has no provider with '/test', the case is skipped instead of failing: the suite
    cannot depend on a particular extension being installed.
*/

interface IProviderEntry {
    id: string
    displayName?: string
    name?: string
    hasTest?: boolean
    hasSchema?: boolean
    hasFront?: boolean
}

interface IField {
    name: string
    type?: string
    options?: string[]
}

test.describe.configure({ mode: 'serial' })

test('el provider que sabe probarse se anuncia con hasTest', async ({ page }) => {
    const respuesta = page.waitForResponse(r => r.url().includes('/core/providers') && r.request().method() === 'GET', { timeout: 20000 })
    await login(page)
    await dismissOpenDialogs(page)
    await clickExtensionMenuItem(page, 'Providers')

    const lista = await (await respuesta).json() as IProviderEntry[]
    const conTest = lista.filter(p => p.hasTest)
    console.log(`providers con /test: ${conTest.map(p => p.id).join(', ') || '(ninguno)'}`)

    test.skip(conTest.length === 0, 'este entorno no tiene ningun provider que exponga /test')
    // and whoever announces it has to be configurable through the core's form, or the button would have nowhere to appear
    expect(conTest.some(p => p.hasSchema || p.hasFront)).toBeTruthy()
})

test('su formulario saca el boton TEST, y un multiselect con checkbox', async ({ page }) => {
    const listado = page.waitForResponse(r => r.url().includes('/core/providers') && r.request().method() === 'GET', { timeout: 20000 })
    await login(page)
    await dismissOpenDialogs(page)
    await clickExtensionMenuItem(page, 'Providers')

    const lista = await (await listado).json() as IProviderEntry[]
    const objetivo = lista.find(p => p.hasTest && p.hasSchema && !p.hasFront)
    test.skip(!objetivo, 'ningun provider con /test se configura con el formulario del core')

    const nombre = objetivo!.displayName ?? objetivo!.id
    const esquema = page.waitForResponse(r => r.url().includes(`/core/providers/${objetivo!.id}/schema`), { timeout: 20000 })

    // THAT card's gear
    // The card has neither a class nor a testid of its own: we climb to the NEAREST ancestor containing
    // the gear, which is the card and not the whole dialog (climbing too far opened another provider's config).
    const rueda = page.getByText(nombre, { exact: false }).first()
        .locator('xpath=ancestor::div[.//*[@data-testid="SettingsIcon"]][1]')
        .locator('[data-testid="SettingsIcon"]').first()
    await rueda.click({ force: true })

    const dialogo = page.locator('[role="dialog"]').filter({ hasText: /Configure/i })
    await expect(dialogo).toBeVisible({ timeout: 15000 })

    // 1) the test button
    await expect(dialogo.getByTestId('config-test')).toHaveCount(1)

    // 2) the multiselect, if the provider declares one
    const campos = await (await esquema).json() as IField[]
    const multi = campos.find(c => c.type === 'multiselect' && (c.options ?? []).length > 0)
    if (multi) {
        const combo = dialogo.getByRole('combobox').first()
        await expect(combo).toBeVisible()
        await combo.click()
        // the open dropdown has to show CHECKBOXES on its options: that is what says several can be ticked
        const opciones = page.getByRole('option')
        await expect(opciones.first()).toBeVisible({ timeout: 10000 })
        expect(await page.locator('[role="option"] input[type="checkbox"]').count()).toBeGreaterThan(0)
        /*
            MUI's listbox is closed through its BACKDROP, not with Escape: for as long as it stays open
            it puts aria-hidden on everything underneath and the dialog's CANCEL stops being clickable.
        */
        await page.locator('.MuiBackdrop-root').last().click({ force: true })
        await page.waitForTimeout(400)
    }
    else console.log('el provider no declara ningun multiselect con opciones (¿sin credenciales guardadas?)')

    // close with the tolerant helper: that particular CANCEL may be covered by leftovers of the popover
    await dismissOpenDialogs(page)
})
