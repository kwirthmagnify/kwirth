import { test } from '@playwright/test'
import { readdirSync } from 'fs'
import path from 'path'
import { openCensor, openConfigDialog } from './helpers'

// Guide screenshots (dark theme). NOT part of the regression suite — run explicitly:
//   CENSOR_CAPTURE=1 npx playwright test tests/zz-capture.spec.ts
// Censor's guide lives in the CORE docs tree, so the PNGs go to docs/0.5.287/_media/guide.
// Only the shots this plugin's UI changes invalidate; data-heavy tabs (Regex/Logstream/Performance
// with real numbers) need a live run with an LLM and noisy logs.
/*
    La guia de este plugin vive en el arbol de documentacion del CORE, y las capturas van a la
    version VIVA: la `docs/<x.y.z>` mas alta, resuelta igual que en `back/scripts/build-docs-tgz.js`.
    Estuvo clavada a una version concreta y envejecio en silencio — se escribia sobre la documentacion
    antigua mientras la guia viva enseñaba capturas viejas, y el spec pasaba en verde porque una
    captura no comprueba nada: solo escribe ficheros.
*/
const DOCS = path.resolve(__dirname, '..', '..', '..', '..', 'docs')
const liveDocsVersion = (): string =>
    readdirSync(DOCS, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d+\.\d+\.\d+$/.test(d.name))
        .map(d => d.name)
        .sort((a, b) => {
            const pa = a.split('.').map(Number)
            const pb = b.split('.').map(Number)
            return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2]
        })
        .pop() ?? ''

const MEDIA = path.join(DOCS, liveDocsVersion(), '_media', 'guide').replace(/\\/g, '/')

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
