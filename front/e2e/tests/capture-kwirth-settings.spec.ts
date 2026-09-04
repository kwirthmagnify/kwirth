import { test, expect } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// Captura de la imagen de la guía para "Kwirth settings" (docs/_media/guide). Tema oscuro.
// Ejecutar a mano: playwright test capture-kwirth-settings.spec.ts
// No destructivo: solo abre el diálogo y lo cierra con Cancel, no guarda nada.

const MEDIA = 'C:/github/aisdkvercel/kwirth/docs/0.5.287/_media/guide'

test('capture kwirth-settings (dark)', async ({ page }) => {
    // mismo encuadre que la imagen que sustituye, para no romper el ritmo visual de la guía
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'Kwirth Settings')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
    await dialog.waitFor()

    // esperar a que el diálogo termine de leer los settings: si no, se captura el spinner
    await expect(dialog.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: 10000 })
    await page.waitForTimeout(1500)

    // página completa, con el diálogo en contexto sobre la app: es el encuadre de la imagen que sustituye
    await page.screenshot({ path: `${MEDIA}/admin-kwirth-settings.png` })

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})
