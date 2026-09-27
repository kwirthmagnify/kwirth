import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL, SAFE_SENDER } from './helpers'

/**
 * Serial, and with ONE single page for the whole file. The dominant cost is not Playwright but
 * reloading the SPA against react-scripts.. dev server, so it is paid once. The price is that the
 * tests share state and order matters: they go from "not started" to "started", and the one that
 * clears the history goes last.
 *
 * ⛔ Only 'console' is sent through here (see helpers.ts): a send from this channel is REAL.
 */
test.describe.configure({ mode: 'serial' })

// Trace and video off: the SPA keeps the websocket alive and closing the page hangs finalising the
// trace. Failure screenshots are attached by hand in the afterEach.
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    const option = await openChannelPicker(page)
    await expect(option).toBeVisible()
    await expect(option).toHaveText(CHANNEL)
    await option.click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
})

test.afterAll(async () => {
    // navigating away releases the websocket; closing the CONTEXT does not wait for an orderly page close
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

const senderSelect = () => page.getByRole('combobox', { name: 'Sender', exact: true })
const configSelect = () => page.getByRole('combobox', { name: 'Configuration', exact: true })
// exact: true ALWAYS — getByRole matches the accessible name by SUBSTRING, and 'SEND' also matches
// the 'Reload senders' button. Without exact, this resolves to two elements and blows up in strict mode.
const sendButton = () => page.getByRole('button', { name: 'SEND', exact: true })
const historyRows = () => page.locator('.MuiPaper-root').filter({ hasText: new RegExp(`${SAFE_SENDER} /`) })

/** The channel declares a setup, so Start opens the dialog first and the channel starts on accepting it. */
const start = async (): Promise<void> => {
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await expect(page.getByText('Configure Sender Debug channel')).toBeVisible()
    await page.getByRole('button', { name: 'OK' }).click()
    await page.waitForTimeout(2500)
}

/** Picks an option from a MUI Select (each option carries its data-value). */
const pick = async (combo: () => ReturnType<typeof page.getByRole>, value: string): Promise<void> => {
    await combo().click()
    await page.locator(`li[data-value="${value}"]`).click()
    await page.waitForTimeout(300)
}

/*
    It picks the FIRST configuration there is, without naming it. How many configurations 'console' has on
    the machine of whoever runs this is not decided by the plugin: it is the environment's data. Naming
    one (or assuming there is only one, and that it therefore auto-selects) turns the test red the day
    somebody adds another — a failure that would say nothing about the channel.
*/
const pickFirstConfig = async (): Promise<string> => {
    await configSelect().click()
    const option = page.locator('li[data-value]:not([data-value=""])').first()
    const value = (await option.getAttribute('data-value')) ?? ''
    await option.click()
    await page.waitForTimeout(300)
    return value
}

test('the tab explains that the channel must be started', async () => {
    await expect(page.getByText('Sender Debug not started', { exact: true })).toBeVisible()
    await expect(page.getByText(/Start the channel .* to pick a sender/)).toBeVisible()
})

test('the setup only configures the channel, and warns that sending is real', async () => {
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await expect(page.getByText('Configure Sender Debug channel')).toBeVisible()
    await expect(page.getByLabel('Max history')).toHaveValue('100')
    await expect(page.getByText(/Sending from this channel is a REAL send/)).toBeVisible()
    // the sender is NOT chosen here: that belongs to the tab
    await expect(page.getByRole('combobox', { name: 'Sender', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'CANCEL' }).click()
    await page.waitForTimeout(500)
})

test('once started the catalogue arrives and offers the installed senders', async () => {
    await start()
    await expect(page.getByText(/Senders: [1-9]/)).toBeVisible({ timeout: 30000 })
    await senderSelect().click()
    await expect(page.locator(`li[data-value="${SAFE_SENDER}"]`)).toBeVisible()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
})

test('SEND stays disabled until a sender AND a configuration are picked', async () => {
    // with nothing chosen there is no sending, and the configuration cannot even be expanded
    await expect(sendButton()).toBeDisabled()
    await expect(configSelect()).toHaveAttribute('aria-disabled', 'true')

    await pick(senderSelect, SAFE_SENDER)
    await expect(configSelect()).not.toHaveAttribute('aria-disabled', 'true')
    const configName = await pickFirstConfig()
    expect(configName).not.toEqual('')
    await expect(sendButton()).toBeEnabled()
})

test('invalid metadata blocks the send and says why', async () => {
    await page.getByLabel('Metadata (JSON)').fill('{ not json')
    await expect(page.getByText('Not a valid JSON object')).toBeVisible()
    await expect(sendButton()).toBeDisabled()

    // an array is not valid either: metadata is an object
    await page.getByLabel('Metadata (JSON)').fill('[1,2,3]')
    await expect(sendButton()).toBeDisabled()

    await page.getByLabel('Metadata (JSON)').fill('')
    await expect(sendButton()).toBeEnabled()
})

test('an empty body blocks the send', async () => {
    const body = page.getByLabel('Body')
    const original = await body.inputValue()
    await body.fill('   ')
    await expect(sendButton()).toBeDisabled()
    await body.fill(original)
    await expect(sendButton()).toBeEnabled()
})

test('the batch count only applies in batch mode, and is bounded', async () => {
    const count = page.getByLabel('Messages')
    await expect(count).toBeDisabled()

    await page.getByRole('checkbox', { name: 'Batch' }).check()
    await expect(count).toBeEnabled()

    await count.fill('0')
    await expect(page.getByText('1 to 100')).toBeVisible()
    await expect(sendButton()).toBeDisabled()

    await count.fill('200')
    await expect(sendButton()).toBeDisabled()

    await count.fill('3')
    await expect(sendButton()).toBeEnabled()
    await page.getByRole('checkbox', { name: 'Batch' }).uncheck()
    await expect(count).toBeDisabled()
})

// From here on things are SENT, and only through 'console': it writes to the core.s log and goes
// nowhere else. No other sender is touched in this file.
test('a real send through console lands in the history as delivered', async () => {
    await page.getByLabel('Subject').fill('e2e sender-debug')
    await page.getByLabel('Body').fill('message from the e2e suite')
    await sendButton().click()

    await expect(historyRows().first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('delivered', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/Sends: 1/)).toBeVisible()
})

test('a batch through a sender without sendBatch is delivered and marked as emulated', async () => {
    await page.getByRole('checkbox', { name: 'Batch' }).check()
    await page.getByLabel('Messages').fill('3')
    await sendButton().click()

    // console does not implement sendBatch: the channel delivers one by one and says so, which is the useful fact
    await expect(page.getByText('batch 3 (emulated)')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(/Sends: 2/)).toBeVisible()
    await page.getByRole('checkbox', { name: 'Batch' }).uncheck()
})

/*
    The row ALWAYS opens, including that of a sender that returns nothing — 'console' is pure
    notification, which is the normal case. The first thing it shows is the message that was sent: without
    that, knowing what the destination answered forces one to reconstruct from memory what it was sent.
*/
test('a row opens and shows what was sent and what came back', async () => {
    await page.locator('button[aria-label="Expand send"]').first().click()
    await page.waitForTimeout(300)

    await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Answered', { exact: true }).first()).toBeVisible()
    // the body that was typed, inside the JSON of the sent message
    await expect(page.getByText(/"body":/).first()).toBeVisible()
    // and the origin this channel stamps on everything that leaves
    await expect(page.getByText(/"source": "sender-debug"/).first()).toBeVisible()
    // console delivers and returns void: the reply says so in plain words
    await expect(page.getByText(/The sender returned void/).first()).toBeVisible()

    await page.locator('button[aria-label="Collapse send"]').first().click()
    await page.waitForTimeout(300)
    await expect(page.getByText('Answered', { exact: true })).toHaveCount(0)
})

test('reloading the catalogue keeps the history', async () => {
    await page.locator('button[aria-label="Reload senders"]').click()
    await page.waitForTimeout(1500)
    await expect(page.getByText(/Sends: 2/)).toBeVisible()
    await expect(page.getByText(/Senders: [1-9]/)).toBeVisible()
})

// The last one: it leaves the tab clean.
test('clearing empties the history and disables its own button', async () => {
    const clear = page.locator('button[aria-label="Clear history"]')
    await clear.click()
    await expect(page.getByText(/Sends: 0/)).toBeVisible()
    await expect(historyRows()).toHaveCount(0)
    await expect(clear).toBeDisabled()
})
