import { test } from '@playwright/test'
import { openCensor, openConfigDialog } from './helpers'

// Guide screenshots (dark theme). NOT part of the regression suite — run explicitly:
//   CENSOR_CAPTURE=1 npx playwright test tests/zz-capture.spec.ts
// Censor's guide lives in the CORE docs tree, so the PNGs go to docs/0.5.287/_media/guide.
// Only the shots this plugin's UI changes invalidate; data-heavy tabs (Regex/Logstream/Performance
// with real numbers) need a live run with an LLM and noisy logs.
const MEDIA = '../../../docs/0.5.287/_media/guide'

test.skip(!process.env.CENSOR_CAPTURE, 'capture-only (set CENSOR_CAPTURE=1)')

// El trace/video de Playwright con la SPA y su WebSocket abierto cuelga el teardown; se desactivan
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

test('capture: config dialog (with the autostart switch)', async ({ page }) => {
    // Tema oscuro y encuadre a pantalla completa, como el resto de capturas de la guía
    await page.addInitScript(() => localStorage.setItem('kwirth.mode', 'dark'))
    await page.setViewportSize({ width: 1600, height: 900 })
    await openCensor(page)
    const dialog = await openConfigDialog(page)
    await page.waitForTimeout(800)   // margen para la animación del diálogo
    await page.screenshot({ path: `${MEDIA}/channel-censor-config.png` })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await page.goto('about:blank')   // cierra el WebSocket antes del teardown
})
