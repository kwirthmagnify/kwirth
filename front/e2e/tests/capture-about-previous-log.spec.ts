import { test, expect } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs, GUIDE_MEDIA } from './helpers'

// Captura de la imagen de la guia para "After an unexpected restart" (guia de admin). Tema oscuro.
// Ejecutar a mano: playwright test --config playwright.capture.config.ts capture-about-previous-log.spec.ts
// No destructivo: abre el About, lo mira y lo cierra. No reinicia nada.

const MEDIA = GUIDE_MEDIA

test('capture about previous container log (dark)', async ({ page }) => {
    // mismo encuadre que el resto de capturas de la guia de admin
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'About Kwirth...')
    const dialog = page.getByRole('dialog').filter({ hasText: 'About Kwirth' })
    await dialog.waitFor()

    // el boton nace deshabilitado y se resuelve cuando el core contesta: sin esperar se captura el estado
    // intermedio, con el tooltip diciendo "Checking whether this container has restarted..."
    await expect(dialog.getByRole('button', { name: 'Previous container log' })).toHaveCount(1)
    await page.waitForTimeout(2000)

    await page.screenshot({ path: `${MEDIA}/admin-about-previous-log.png` })

    await dialog.getByRole('button', { name: 'OK' }).click()
    await dismissOpenDialogs(page)
})
