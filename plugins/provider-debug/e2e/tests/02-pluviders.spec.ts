import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'

/**
 * Debugging PLUVIDERS: plugins that also produce and publish their information in-process. To whoever
 * debugs they are just another producer — they are listed, you subscribe to one and events arrive —
 * and that is exactly what is verified here, against Agora's real pluvider.
 *
 * Serial, and with ONE page for the whole file, for the same reason as 01-channel: the dominant cost
 * is reloading the SPA against the dev server, not Playwright.
 */
test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const PLUVIDER = 'plugin:agora'

let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    const option = await openChannelPicker(page)
    await expect(option).toBeVisible()
    await option.click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
})

test.afterAll(async () => {
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

const openSetup = async (): Promise<void> => {
    const stopped = await page.getByText('Provider Debug not started', { exact: true }).isVisible().catch(() => false)
    if (!stopped) {
        await openTabMenu(page)
        await page.getByText('Stop', { exact: true }).click()
        await page.waitForTimeout(1200)
    }
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await expect(page.getByText('Configure Provider Debug channel')).toBeVisible()
}

const providerSelect = () => page.getByRole('combobox', { name: 'Provider', exact: true })

const selectProvider = async (providerId: string): Promise<void> => {
    await providerSelect().click()
    await page.locator(`li[data-value="${providerId}"]`).click()
}

const closeSetup = async (): Promise<void> => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const cancel = page.getByRole('button', { name: 'CANCEL' })
    if (await cancel.isVisible().catch(() => false)) await cancel.click()
    await page.waitForTimeout(400)
}

test('with no producer chosen the three tabs are disabled', async () => {
    await openSetup()

    // With no producer there is nothing to describe and no payload to write.
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeDisabled()
    await expect(page.getByRole('tab', { name: 'Form' })).toBeDisabled()
    await expect(page.getByRole('tab', { name: 'JSON' })).toBeDisabled()
    await expect(page.getByText(/Pick a provider to see how to subscribe/)).toBeVisible()

    await closeSetup()
})

test('a pluvider is offered in the same list as the providers, marked as coming from a plugin', async () => {
    // GET /core/providers serves pluviders and providers in the SAME list: whoever consumes need not
    // know there are two classes of producer.
    await openSetup()
    await providerSelect().click()

    const option = page.locator(`li[data-value="${PLUVIDER}"]`)
    await expect(option).toBeVisible()
    // the chip says where it comes from, and the description what it produces
    await expect(option.getByText('plugin', { exact: true })).toBeVisible()
    await expect(option.getByText(/Proactive alerts/)).toBeVisible()
    // it is alive: it does not carry the 'not running' mark
    await expect(option.getByText('not running')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await closeSetup()
})

test('choosing a pluvider opens Overview with the help it publishes', async () => {
    await openSetup()
    await selectProvider(PLUVIDER)

    // Overview is the tab that opens on choosing a producer
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    // the box is titled with the id, so it is clear that what is inside belongs to the producer and not to the dialog
    await expect(page.getByText(`Subscription — declared by '${PLUVIDER}'`)).toBeVisible()
    // the help Agora publishes: what it delivers, and the two warnings that mislead the most
    await expect(page.getByText(/artifacts/)).toBeVisible()
    await expect(page.getByText(/ADMINISTRATOR has enabled/)).toBeVisible()

    await closeSetup()
})

test('USE EXAMPLE fills the payload and lands on the form', async () => {
    await openSetup()
    await selectProvider(PLUVIDER)
    await page.getByRole('button', { name: 'USE EXAMPLE' }).click()

    // it jumps to where work continues, and the field declared by the pluvider is filled in
    await expect(page.getByRole('tab', { name: 'Form' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByLabel(/^alerts/)).toHaveValue(/artifacts/)

    // and the same payload is in the JSON: form and JSON edit the SAME state
    await page.getByRole('tab', { name: 'JSON' }).click()
    await expect(page.getByLabel('Subscription payload (JSON)')).toHaveValue(/"alerts"/)

    await closeSetup()
})

test('you can go back to Form after JSON', async () => {
    // Regression: the Form Tab was wrapped in a Tooltip, so it was not a direct child of Tabs and did
    // not receive its onChange — you left for JSON and could not come back.
    await openSetup()
    await selectProvider(PLUVIDER)

    await page.getByRole('tab', { name: 'JSON' }).click()
    await expect(page.getByLabel('Subscription payload (JSON)')).toBeVisible()

    await page.getByRole('tab', { name: 'Form' }).click()
    await expect(page.getByLabel(/^alerts/)).toBeVisible()

    await closeSetup()
})

test('subscribing to a pluvider is confirmed, the same as to a provider', async () => {
    await openSetup()
    await selectProvider(PLUVIDER)
    await page.getByRole('button', { name: 'OK' }).click()
    await page.waitForTimeout(2500)

    /*
        The in-process subscription is confirmed with the SAME green milestone as a provider's: to whoever
        is debugging they are the same thing, which is precisely what is being tested.

        It does not wait for events to arrive, unlike the 'metrics' test: Agora's alerts are not
        deterministic — an incident and some active rules are needed — so waiting for them would be a test
        that fails for reasons unrelated to the pluvider.
    */
    await expect(page.getByText(`Provider: ${PLUVIDER}`)).toBeVisible()
    await expect(page.locator('.MuiChip-root').filter({ hasText: /^subscribed$/ }).first()).toHaveClass(/MuiChip-filledSuccess/)
})
