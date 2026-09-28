import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'
import path from 'path'

/*
    A capture of the GRAPH for the guide. Outside the default run (see testIgnore in the config): it
    writes into the live documentation.

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

    await page.getByRole('tab', { name: 'Graph', exact: true }).click()
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30000 })
    // The layout is asynchronous and does a fitView afterwards: it is left to settle before shooting.
    await page.waitForTimeout(2500)
    // And the mouse is moved away: left over the button, its tooltip shows up in the guide.s image.
    await page.mouse.move(700, 620)
    await page.waitForTimeout(800)

    await page.screenshot({ path: path.join(MEDIA, `${CHANNEL}-graph.png`) })
    console.log(`### captura escrita en ${path.join(MEDIA, `${CHANNEL}-graph.png`)}`)

    await page.goto('about:blank').catch(() => {})
    await page.context().close().catch(() => {})
})
