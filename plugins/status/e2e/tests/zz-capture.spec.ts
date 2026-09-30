import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'
import path from 'path'

/*
    A capture for the guide. It does NOT run in the normal suite: it is requested by hand when the screen
    changes.

        ./node_modules/.bin/playwright test zz-capture.spec.ts

    It writes into the LIVE documentation (docs/<version>/_media/ch-images), so an unintended run would
    modify published images. That is why it is outside the default testMatch.
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

    const shot = async (name: string) => {
        // The mouse off the refresh button, or its tooltip ends up in the guide's image.
        await page.mouse.move(700, 1150)
        await page.waitForTimeout(600)
        await page.screenshot({ path: path.join(MEDIA, `${CHANNEL}-${name}.png`) })
        console.log(`### capture written: ${path.join(MEDIA, `${CHANNEL}-${name}.png`)}`)
    }
    const snapshot = async () => {
        await page.locator('button[aria-label="Take a new snapshot"]').click()
        await page.waitForTimeout(2500)
    }

    // A couple of snapshots first, so the Home's CPU and the Performance charts have something to show.
    await snapshot()
    await snapshot()

    // Home: where the channel opens.
    await shot('home')

    // The Providers table: the guide's long-standing image.
    await page.getByRole('tab', { name: 'Providers', exact: true }).click()
    await page.waitForTimeout(800)
    await shot('inventory')

    // Performance, with enough snapshots for every chart to draw a line.
    await page.getByRole('tab', { name: 'Performance', exact: true }).click()
    for (let i = 0; i < 6; i++) await snapshot()
    await shot('performance')

    // Routes: every published HTTP route, one line per path with its methods.
    await page.getByRole('tab', { name: 'Routes', exact: true }).click()
    await page.waitForTimeout(800)
    await shot('routes')

    // DCE: every installed DCE, the state of each half and who consumes it.
    await page.getByRole('tab', { name: 'DCE', exact: true }).click()
    await page.waitForTimeout(800)
    await shot('dce')

    await page.goto('about:blank').catch(() => {})
    await page.context().close().catch(() => {})
})
