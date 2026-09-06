import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// Captura de la imagen de la guía para la pestaña "Marketplaces" (docs/_media/guide). Tema oscuro.
// Ejecutar a mano: playwright test capture-marketplaces.spec.ts
//
// ─── REDACCIÓN ───────────────────────────────────────────────────────────────────────────────────
// La guía es PÚBLICA y el entorno de desarrollo tiene marketplaces privados reales: la URL del repo de
// la organización y las credenciales que lo abren. Antes de capturar se sustituye lo que se ve por
// valores de ejemplo, escribiendo en el formulario como lo haría una persona (setter nativo + evento
// input, para que React se entere) — así la captura muestra la pantalla de verdad, no un montaje.
//
// NO destructivo: se cierra con **Cancel**, así que nada de esto se guarda. Lo redactado vive solo en el
// estado del formulario mientras dura la captura.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const MEDIA = 'C:/github/aisdkvercel/kwirth/docs/0.5.287/_media/guide'

const dlg = (page: Page) => page.locator('[role="dialog"]').last()

/** Valores de ejemplo con los que se sustituye lo real, fila a fila. */
const SAMPLE = {
    label: 'acme-extensions',
    url: 'https://gitlab.acme.com/api/v4/projects/acme%2Fmarketplace/repository/files/manifest.json/raw?ref=main',
    manifestUser: '',
    token: 'glpat-ExampleTokenValue',
    user: 'acme-ci',
    password: 'example-password'
}

/** Escribe en un input de React de forma que el componente registre el cambio. */
async function redact(page: Page, label: string, value: string) {
    const fields = dlg(page).getByLabel(label, { exact: true })
    for (let i = 0; i < await fields.count(); i++) {
        await fields.nth(i).evaluate((el, v) => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
            setter.call(el, v)
            el.dispatchEvent(new Event('input', { bubbles: true }))
        }, value)
    }
}

test('capture marketplaces (dark, redactado)', async ({ page }) => {
    // mismo encuadre que el resto de capturas de la guía, para no romper el ritmo visual
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'Kwirth Settings')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
    await dialog.waitFor()

    // esperar a que termine de leer los settings: si no, se captura el spinner
    await expect(dlg(page).getByLabel('Cluster metrics read interval (seconds)', { exact: true })).toBeEnabled({ timeout: 10000 })
    await page.getByRole('tab', { name: 'Marketplaces' }).click()
    await page.waitForTimeout(800)

    const rows = await dlg(page).getByLabel('Manifest URL', { exact: true }).count()
    test.skip(rows === 0, 'no hay ningún marketplace registrado que capturar')

    // Para que la imagen enseñe el caso completo — manifest con token Y registro con credenciales —
    // se marcan las dos casillas. Es una ilustración, no la configuración real: nada de esto se guarda.
    const registryCreds = dlg(page).getByLabel('Package registry needs credentials', { exact: true }).first()
    if (!await registryCreds.isChecked()) await registryCreds.check()
    const manifestToken = dlg(page).getByLabel('Manifest needs a token', { exact: true }).first()
    if (!await manifestToken.isChecked()) await manifestToken.check()
    await page.waitForTimeout(300)

    // redactar TODO lo identificable antes de que la imagen exista
    await redact(page, 'Name', SAMPLE.label)
    await redact(page, 'Manifest URL', SAMPLE.url)
    await redact(page, 'Manifest user', SAMPLE.manifestUser)
    await redact(page, 'Token', SAMPLE.token)
    await redact(page, 'User', SAMPLE.user)
    await redact(page, 'Password', SAMPLE.password)
    await page.waitForTimeout(400)

    // comprobar la redacción ANTES de capturar: si algo real sobrevive, mejor fallar que publicarlo
    const leaked = await dlg(page).evaluate(el =>
        Array.from(el.querySelectorAll('input')).map(i => (i as HTMLInputElement).value).join(' | '))
    expect(leaked, 'ha quedado una URL real en la captura').not.toContain('plexus')
    expect(leaked, 'ha quedado un token real en la captura').not.toMatch(/glpat-(?!Example)/)

    await page.screenshot({ path: `${MEDIA}/admin-marketplaces.png` })

    // Cancel: lo redactado NO se guarda
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})
