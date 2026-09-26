import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'
import path from 'path'

/*
    Captura para la guía. NO corre en la suite normal: se pide a mano cuando la pantalla cambia.

        ./node_modules/.bin/playwright test zz-capture.spec.ts

    Escribe en la documentación VIVA (docs/<version>/_media/ch-images), así que una corrida involuntaria
    modificaría imágenes publicadas. Por eso está fuera del testMatch por defecto.
*/

const MEDIA = path.resolve(__dirname, '../../../../docs/0.6.31/_media/ch-images')

test('captura del inventario', async ({ browser }) => {
    test.setTimeout(240000)
    // Deliberately generous height: the ACTIVE rows go last — what works is looked at last — and at
    // 900px they fell outside the image, which is exactly what the guide is explaining.
    const page: Page = await browser.newPage({ viewport: { width: 1400, height: 1180 } })
    // The guide is in dark mode, like the rest of its images.
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)

    const option = await openChannelPicker(page)
    await option.click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(2000)

    // Adding the tab does not start the channel: Start has to be pressed, just as a user would.
    await openTabMenu(page)
    const start = page.getByText('Start', { exact: true })
    if (await start.isVisible().catch(() => false)) await start.click()
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(3000)

    await expect(page.getByText('What this Kwirth has inside')).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(1500)

    await page.screenshot({ path: path.join(MEDIA, `${CHANNEL}-inventory.png`) })
    console.log(`### captura escrita en ${path.join(MEDIA, `${CHANNEL}-inventory.png`)}`)

    await page.goto('about:blank').catch(() => {})
    await page.context().close().catch(() => {})
})
