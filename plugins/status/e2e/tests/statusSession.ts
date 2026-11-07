import { test as base, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'

/*
    ONE Status session for the whole run, shared by every spec file that imports `test` from here (the same
    worker-scoped fixture as Excubitor's excubitorSession.ts).

    Opening the application — login, the ~17 s the core's front spends running the extensions' front.js,
    the cluster and channel pickers, ADD and the first snapshot — is the expensive part of every spec, and a
    `beforeAll` pays it once per FILE. A worker fixture pays it once per worker, and the suite runs with one.
    It is also where the cold runs fell: paying it once is paying that risk once.

    The price is shared state: a spec must navigate to the tab it needs instead of assuming where the previous
    one left it, and must not close the page.
*/

interface IStatusWorkerFixtures {
    statusPage: Page
}

export const test = base.extend<object, IStatusWorkerFixtures>({
    statusPage: [async ({ browser }, use) => {
        const page = await browser.newPage()
        await login(page)
        const option = await openChannelPicker(page)
        await expect(option).toHaveText(CHANNEL)
        await option.click()
        await page.getByRole('button', { name: 'ADD' }).click()
        await page.waitForTimeout(1500)
        /*
            The channel declares setup:false, so the core starts it when the tab is added and there is no
            'Start' in the menu. It is checked all the same, should starting become manual again some day.
        */
        await openTabMenu(page)
        const start = page.getByText('Start', { exact: true })
        if (await start.isVisible().catch(() => false)) await start.click()
        else await page.keyboard.press('Escape')
        // The session is ready when the first snapshot has drawn the tab strip — not after a clock.
        await expect(page.getByRole('tab', { name: 'Home', exact: true })).toBeVisible({ timeout: 60_000 })

        await use(page)

        // A slow close is not a failure of anything: try briefly, then let Playwright close the browser.
        await page.goto('about:blank').catch(() => undefined)
        await Promise.race([
            page.context().close().catch(() => undefined),
            new Promise(resolve => setTimeout(resolve, 10_000))
        ])
    }, { scope: 'worker', timeout: 300_000 }]
})

export { expect } from '@playwright/test'
