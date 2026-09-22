import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    El formulario de configuracion de un provider, con las dos cosas que el core le puso:

      · el boton TEST, que sale cuando el provider expone '/test' en su configRouter. Antes no habia
        forma de saber si unas credenciales valian hasta que el provider fallaba en silencio; Excubitor
        lo resolvio a mano para sus conectores cloud y esto lo hace una vez para todos.
      · el campo 'multiselect', que se pinta como desplegable de VARIOS valores CON CHECKBOX. Sin el
        check, un desplegable de seleccion multiple parece de seleccion unica.

    ⚠️ No se PULSA el boton: probar de verdad sale a la red del proveedor (Azure, en el caso de hoy).
    Lo que se comprueba aqui es el contrato de la UI; que la prueba funcione es del QA manual.

    Si el entorno no tiene ningun provider con '/test', el caso se salta en vez de fallar: la suite no
    puede depender de que este instalada una extension concreta.
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
    // y el que lo anuncia tiene que poder configurarse por el formulario del core, o el boton no tendria donde salir
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

    // la rueda dentada de ESA tarjeta
    // La tarjeta no tiene clase ni testid propios: se sube al ancestro MAS CERCANO que contenga la rueda
    // dentada, que es la tarjeta y no el dialogo entero (subir de mas abria la config de otro provider).
    const rueda = page.getByText(nombre, { exact: false }).first()
        .locator('xpath=ancestor::div[.//*[@data-testid="SettingsIcon"]][1]')
        .locator('[data-testid="SettingsIcon"]').first()
    await rueda.click({ force: true })

    const dialogo = page.locator('[role="dialog"]').filter({ hasText: /Configure/i })
    await expect(dialogo).toBeVisible({ timeout: 15000 })

    // 1) el boton de prueba
    await expect(dialogo.getByTestId('config-test')).toHaveCount(1)

    // 2) el multiselect, si el provider declara alguno
    const campos = await (await esquema).json() as IField[]
    const multi = campos.find(c => c.type === 'multiselect' && (c.options ?? []).length > 0)
    if (multi) {
        const combo = dialogo.getByRole('combobox').first()
        await expect(combo).toBeVisible()
        await combo.click()
        // el desplegable abierto tiene que enseñar CHECKBOX en sus opciones: es lo que dice que se pueden marcar varias
        const opciones = page.getByRole('option')
        await expect(opciones.first()).toBeVisible({ timeout: 10000 })
        expect(await page.locator('[role="option"] input[type="checkbox"]').count()).toBeGreaterThan(0)
        /*
            El listbox de MUI se cierra por su BACKDROP, no con Escape: mientras siga abierto pone
            aria-hidden en todo lo de debajo y el CANCEL del dialogo deja de ser clicable.
        */
        await page.locator('.MuiBackdrop-root').last().click({ force: true })
        await page.waitForTimeout(400)
    }
    else console.log('el provider no declara ningun multiselect con opciones (¿sin credenciales guardadas?)')

    // cerrar con el helper tolerante: el CANCEL concreto puede quedar tapado por restos del popover
    await dismissOpenDialogs(page)
})
