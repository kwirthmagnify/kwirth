import { test, expect } from '@playwright/test'
import { readdirSync } from 'fs'
import path from 'path'
import { login, openChannelPicker, openTabMenu } from './helpers'

// Capturas para la guía (docs/<versión viva>/_media/guide/). Tema OSCURO y 1600x900, como el resto.
// No entra en el suite normal (fichero zz-, se lanza a mano). Trazas y vídeo apagados: la SPA deja
// el websocket abierto y el teardown de Playwright se queda colgado con ellos activos.
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

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

test('capture', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await login(page)

    // tema oscuro
    if (await page.getByText('light', { exact: true }).isVisible().catch(() => false)) {
        await page.locator('.MuiSwitch-input').first().click()
        await expect(page.getByText('dark', { exact: true })).toBeVisible()
        await page.waitForTimeout(800)
    }

    const option = await openChannelPicker(page)
    await option.click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)

    // 1) setup con la ayuda de 'events' y el formulario generado
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await page.getByRole('combobox', { name: 'Provider', exact: true }).click()
    await page.locator('li[data-value="events"]').click()
    await page.getByRole('button', { name: 'USE EXAMPLE' }).click()
    // rellenar el ejemplo enfoca un campo y MUI desplaza el contenido: vuelve arriba para que la
    // captura no salga con la etiqueta 'Provider' cortada
    await page.locator('.MuiDialogContent-root').first().evaluate(el => { el.scrollTop = 0 })
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${MEDIA}/channel-provider-debug-setup.png` })

    // 2) la pestaña con eventos reales. Se usa 'metrics', que empuja cada 15 s pase lo que pase.
    await page.getByRole('button', { name: 'CANCEL' }).click()
    await page.waitForTimeout(600)
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await page.getByRole('combobox', { name: 'Provider', exact: true }).click()
    await page.locator('li[data-value="metrics"]').click()
    await page.getByRole('button', { name: 'USE EXAMPLE' }).click()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.getByText(/Events: [1-9]\d* \/ 200/)).toBeVisible({ timeout: 90000 })
    // se busca un termino y se salta a el: la captura ensena el buscador, el contador y el
    // resaltado en video inverso dentro de la tarjeta desplegada
    await page.getByLabel('Search events').fill('maxPods')
    await page.getByRole('button', { name: 'Next match' }).click()
    // se aparta el raton: si no, el tooltip del boton sale en la captura de la guia
    await page.mouse.move(800, 700)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${MEDIA}/channel-provider-debug-view.png` })

    /*
        3) El aviso de recorte al final de un evento largo, en su variante mas informativa: con una
        busqueda cuyas coincidencias caen fuera del corte. Se ASERTA antes de capturar, porque una
        captura por si sola no comprueba nada y esta ilustra justo esa frase en la guia.
    */
    await page.getByLabel('Search events').fill('usageNanoCores')
    const notice = page.getByText(/^Trimmed to the first \d+ of \d+ lines/)
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(/\d+ match(es)? falls? past the cut/)
    await notice.scrollIntoViewIfNeeded()
    await page.mouse.move(800, 700)
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${MEDIA}/channel-provider-debug-trimmed.png` })

    // la SPA mantiene el websocket vivo; sin esto el teardown se cuelga
    await page.goto('about:blank')
})
