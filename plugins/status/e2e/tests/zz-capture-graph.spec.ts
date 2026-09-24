import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'
import path from 'path'

/*
    Captura del GRAFO para la guía. Fuera de la corrida por defecto (ver testIgnore en la config):
    escribe en la documentación viva.

        STATUS_E2E_CAPTURE=1 ./node_modules/.bin/playwright test zz-capture-graph.spec.ts
*/

const MEDIA = path.resolve(__dirname, '../../../../docs/0.6.31/_media/ch-images')

test('captura del grafo', async ({ browser }) => {
    test.setTimeout(240000)
    const page: Page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)

    const option = await openChannelPicker(page)
    await option.click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(2000)
    await openTabMenu(page)
    const start = page.getByText('Start', { exact: true })
    if (await start.isVisible().catch(() => false)) await start.click()
    else await page.keyboard.press('Escape')
    await expect(page.getByText('What this Kwirth has inside')).toBeVisible({ timeout: 30000 })

    await page.locator('button[aria-label="Graph view"]').click()
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30000 })
    // El layout es asincrono y hace un fitView despues: se le deja acomodarse antes de disparar.
    await page.waitForTimeout(2500)
    // Y se aparta el raton: si se queda sobre el boton, su tooltip sale en la imagen de la guia.
    await page.mouse.move(700, 620)
    await page.waitForTimeout(800)

    await page.screenshot({ path: path.join(MEDIA, `${CHANNEL}-graph.png`) })
    console.log(`### captura escrita en ${path.join(MEDIA, `${CHANNEL}-graph.png`)}`)

    await page.goto('about:blank').catch(() => {})
    await page.context().close().catch(() => {})
})
