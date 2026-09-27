import { test, expect } from '@playwright/test'
import { readdirSync } from 'fs'
import path from 'path'
import { login, openChannelPicker, openTabMenu } from './helpers'

// Screenshots for the guide (docs/<live version>/_media/guide/). DARK theme and 1600x900, like the
// rest. It is not part of the normal suite (a zz- file, launched by hand). Traces and video off: the
// SPA leaves the websocket open and Playwright's teardown hangs with them enabled.
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

/*
    This plugin's guide lives in the CORE's documentation tree, and the captures go to the LIVE version:
    the highest `docs/<x.y.z>`, resolved the same way as in `back/scripts/build-docs-tgz.js`. It was once
    pinned to a particular version and aged in silence — it wrote over the old documentation while the
    live guide showed stale captures, and the spec passed green because a capture checks nothing: it only
    writes files.
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

    // 1) setup with the help of 'events' and the generated form
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await page.getByRole('combobox', { name: 'Provider', exact: true }).click()
    await page.locator('li[data-value="events"]').click()
    await page.getByRole('button', { name: 'USE EXAMPLE' }).click()
    // filling in the example focuses a field and MUI scrolls the content: go back to the top so the
    // screenshot does not come out with the 'Provider' label cut off
    await page.locator('.MuiDialogContent-root').first().evaluate(el => { el.scrollTop = 0 })
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${MEDIA}/channel-provider-debug-setup.png` })

    // 2) the tab with real events. 'metrics' is used, which pushes every 15 s no matter what.
    await page.getByRole('button', { name: 'CANCEL' }).click()
    await page.waitForTimeout(600)
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await page.getByRole('combobox', { name: 'Provider', exact: true }).click()
    await page.locator('li[data-value="metrics"]').click()
    await page.getByRole('button', { name: 'USE EXAMPLE' }).click()
    await page.getByRole('button', { name: 'OK' }).click()
    await expect(page.getByText(/Events: [1-9]\d* \/ 200/)).toBeVisible({ timeout: 90000 })
    // a term is searched for and jumped to: the screenshot shows the search box, the counter and the
    // reverse-video highlight inside the expanded card
    await page.getByLabel('Search events').fill('maxPods')
    await page.getByRole('button', { name: 'Next match' }).click()
    // the mouse is moved away: otherwise the button's tooltip shows up in the guide's screenshot
    await page.mouse.move(800, 700)
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${MEDIA}/channel-provider-debug-view.png` })

    /*
        3) The trimming notice at the end of a long event, in its most informative variant: with a search
        whose matches fall outside the cut. It is ASSERTED before capturing, because a capture on its own
        checks nothing and this one illustrates precisely that sentence in the guide.
    */
    await page.getByLabel('Search events').fill('usageNanoCores')
    const notice = page.getByText(/^Trimmed to the first \d+ of \d+ lines/)
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(/\d+ match(es)? falls? past the cut/)
    await notice.scrollIntoViewIfNeeded()
    await page.mouse.move(800, 700)
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${MEDIA}/channel-provider-debug-trimmed.png` })

    // the SPA keeps the websocket alive; without this the teardown hangs
    await page.goto('about:blank')
})
