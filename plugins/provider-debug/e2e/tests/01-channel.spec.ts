import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'

/**
 * Serial, and with ONE single page for the whole file. The dominant cost of this e2e is not
 * Playwright but reloading the SPA against react-scripts' dev server (tens of seconds per load), so
 * opening one page per test multiplied that cost by the number of tests. Here it is paid once. The
 * price is that the tests share state and order matters: they go from "not started" towards
 * "started", and the one that clears the buffer goes last.
 */
test.describe.configure({ mode: 'serial' })

// Trace and video off: the SPA keeps the websocket alive (metrics pushes every 15 s) and closing the
// page hangs finalising the trace. Failure screenshots are not lost: the afterEach attaches them by
// hand, because the page is created outside the fixture.
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
    // The SPA leaves the websocket alive (metrics pushes every 15 s) and page.close() hangs
    // finalising the trace. We navigate away to release the socket and close the CONTEXT, which does
    // not wait for an orderly page close.
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

// The page is created by hand, so Playwright does not attach screenshots on its own: it is done here.
test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

// The channel declares requirements.setup = true, so "Start" opens the setup dialog first
// (front/src/App.tsx:1337, onClickChannelStart) and the channel starts on accepting it.
/**
 * Opens the setup. If the channel is already started it has to be stopped first: the menu disables
 * Start while it runs, so reconfiguring is always Stop -> Start (it is the plugin's real flow, with
 * modifiable: false).
 */
const openSetup = async (): Promise<void> => {
    const stopped = await page.getByText(/Provider Debug not started/).isVisible().catch(() => false)
    if (!stopped) {
        await openTabMenu(page)
        await page.getByText('Stop', { exact: true }).click()
        await page.waitForTimeout(1200)
    }
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await expect(page.getByText('Configure Provider Debug channel')).toBeVisible()
}

// By role and not by label: the dialog's title ("Configure Provider Debug channel") also matches
// getByLabel('Provider') and breaks strict mode.
const providerSelect = () => page.getByRole('combobox', { name: 'Provider', exact: true })

/** Closes the open dropdown and, if the dialog is still alive, cancels it. */
const closeSetup = async (): Promise<void> => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const cancel = page.getByRole('button', { name: 'CANCEL' })
    if (await cancel.isVisible().catch(() => false)) await cancel.click()
    await page.waitForTimeout(400)
}

/** Selects a provider from the Select (MUI draws each option with a data-value). */
const selectProvider = async (providerId: string): Promise<void> => {
    await providerSelect().click()
    await page.locator(`li[data-value="${providerId}"]`).click()
}

/** The JSON editor lives in its own tab: choosing a producer opens Overview, so we have to go to it. */
const openJsonTab = async (): Promise<void> => {
    await page.getByRole('tab', { name: 'JSON' }).click()
    await expect(page.getByLabel('Subscription payload (JSON)')).toBeVisible()
}

const startWith = async (providerId: string, payload = ''): Promise<void> => {
    await openSetup()
    if (providerId) await selectProvider(providerId)
    if (payload) {
        await openJsonTab()
        await page.getByLabel('Subscription payload (JSON)').fill(payload)
    }
    await page.getByRole('button', { name: 'OK' }).click()
    await page.waitForTimeout(2500)
}

/** Startup milestone chip ('config' / 'subscribed'), by the exact text of its label. */
const statusChip = (label: string) => page.locator('.MuiChip-root').filter({ hasText: new RegExp('^' + label + '$') }).first()

const METRICS_PAYLOAD = '{"pod":true,"container":true,"machine":true}'
const eventsArrived = () => expect(page.getByText(/Events: [1-9]\d* \/ 200/)).toBeVisible({ timeout: 90000 })

// The empty state moved to the same pattern as Agora and Iter: headline and instruction in TWO
// elements (it used to be a single sentence), centred in the content area.
test('the tab explains that the channel must be started', async () => {
    await expect(page.getByText('Provider Debug not started', { exact: true })).toBeVisible()
    await expect(page.getByText(/Start the channel .* to subscribe to a provider/)).toBeVisible()
})


// GET /core/providers is the core's complete view, so everything in the Select (ids, state and help)
// is available WITHOUT the channel ever having been started. These tests go before the first Start on
// purpose: if anybody ties the Select back to the websocket catalogue, they turn red.
/*
    No INSTALLED provider is named, on purpose. The previous version demanded 'kafka' and 'otel' by id,
    and went red the day kafka stopped being installed in the environment — a failure that said nothing
    about the channel, only about the inventory of whoever was running the test. What matters here is that
    the list arrives populated and with the state resolved, not WHAT is installed.

    The core ones are named: 'events' and 'metrics' are registered by the core in code, so they are always
    there whatever happens with the extensions.
*/
test('before any start the select offers core providers and resolves their state', async () => {
    await openSetup()
    await providerSelect().click()

    // core ones: they are not extensions, the same endpoint serves them flagged as core
    await expect(page.locator('li[data-value="events"]')).toBeVisible()
    await expect(page.locator('li[data-value="metrics"]')).toBeVisible()
    // and besides the two core ones there are installed producers: were the Select to hang off the
    // websocket catalogue again, without starting the channel only the empty option would be there
    expect(await page.locator('li[data-value]:not([data-value=""])').count()).toBeGreaterThan(2)

    // the state comes already resolved without starting anything: 'metrics' runs — the metrics channel
    // requires it — so it does not carry the mark
    await expect(page.locator('li[data-value="metrics"]')).not.toContainText('not running')
    await expect(page.getByText(/Only the ones not marked as "not running" can be subscribed to/)).toBeVisible()

    await closeSetup()
})

test('a provider that publishes help explains itself and enables the form', async () => {
    await openSetup()
    await selectProvider('events')

    // EventsProvider.getSubscriptionHelp(): usage + example + fields
    await expect(page.getByText(/Strict opt-in/)).toBeVisible()
    await expect(page.getByText(/Subscribing/)).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Form' })).toBeEnabled()

    await closeSetup()
})

test('the example button fills the payload', async () => {
    await openSetup()
    await selectProvider('metrics')

    // MetricsProvider publishes usage + example, with no fields: the form does not apply
    await expect(page.getByText(/Pushes on its own clock/)).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Form' })).toBeDisabled()

    await page.getByRole('button', { name: 'USE EXAMPLE' }).click()

    await expect(page.getByLabel('Subscription payload (JSON)')).toHaveValue(/"pod": true/)
    await closeSetup()
})

test('the generated form writes into the payload', async () => {
    await openSetup()
    await selectProvider('events')
    // Choosing a producer opens Overview: the form is in its own tab.
    await page.getByRole('tab', { name: 'Form' }).click()
    await page.getByLabel(/^kinds/).fill('Pod, Event')

    await page.getByRole('tab', { name: 'JSON' }).click()

    await expect(page.getByLabel('Subscription payload (JSON)')).toHaveValue(/"kinds"/)
    await expect(page.getByLabel('Subscription payload (JSON)')).toHaveValue(/"Event"/)
    await closeSetup()
})

test('a provider without help says so instead of leaving the user guessing', async () => {
    await openSetup()
    // 'business' is today the only live provider that does NOT publish getSubscriptionHelp ('otel'
    // used to be used, and is no longer installed). If it ever publishes it, another one without help
    // has to be chosen.
    await selectProvider('business')

    await expect(page.getByText(/does not publish subscription help/)).toBeVisible()
    await closeSetup()
})

test('starting without a provider lists the providers currently running', async () => {
    await startWith('')

    await expect(page.getByText('Running providers')).toBeVisible()
    await expect(page.getByText('events', { exact: true })).toBeVisible()
    await expect(page.getByText('metrics', { exact: true })).toBeVisible()
    await expect(page.getByText('Provider: (none)')).toBeVisible()
    await expect(page.getByText('Events: 0 / 200')).toBeVisible()
})

/*
    WHICH one is stopped is looked up in the list instead of naming one: which one it is depends on what
    is installed and on which channels are running, and tying it to a particular id is what turned this
    file red when kafka stopped being installed.
*/
test('a provider that is not running is reported instead of failing silently', async () => {
    await openSetup()
    await providerSelect().click()
    const stopped = page.locator('li[data-value]').filter({ hasText: 'not running' }).first()

    /*
        There may be NONE stopped: a provider runs when some channel requires it or when it publishes a
        router, so in a Kwirth where everything installed is in use this case does not exist and there is
        no way of provoking it from the UI (the Select only offers what there is).

        It is skipped rather than failed, and the dialog is closed first: the tests share a page, and
        leaving it open would break the next one. The warning's logic is covered by the back end's harness
        (tests/back/pluvider.test.ts and ProviderDebugChannel.test.ts), this was only the real journey.
    */
    if (await stopped.count() === 0) {
        await closeSetup()
        test.skip(true, 'no hay ningún provider instalado que no esté corriendo en este Kwirth')
    }

    const stoppedId = await stopped.getAttribute('data-value')
    await stopped.click()
    await page.getByRole('button', { name: 'OK' }).click()
    await page.waitForTimeout(2500)

    await expect(page.getByText(`Provider '${stoppedId}' is not running`)).toBeVisible()
    await expect(page.getByText('Events: 0 / 200')).toBeVisible()
})

test('a malformed subscription payload blocks the dialog instead of reaching the back', async () => {
    await openSetup()
    await selectProvider('business')
    await openJsonTab()
    await page.getByLabel('Subscription payload (JSON)').fill('{ not json')

    await expect(page.getByText('Not valid JSON')).toBeVisible()
    await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled()

    await page.getByRole('button', { name: 'CANCEL' }).click()
})

test('subscribing to a running provider is confirmed and streams its raw events', async () => {
    // 'metrics' is the core's deterministic provider: its tick pushes to ALL its subscribers every
    // metricsInterval (15 s by default), with no filter, so the traffic does not depend on the
    // cluster's activity (back/src/providers/metrics/MetricsProvider.ts, tick()).
    await startWith('metrics', METRICS_PAYLOAD)

    await expect(statusChip('subscribed')).toHaveClass(/MuiChip-filledSuccess/)
    await expect(page.getByText('Provider: metrics')).toBeVisible()
    await eventsArrived()
})

test('the start milestones are chips, not text lines', async () => {
    // both milestones light up green...
    await expect(statusChip('config')).toHaveClass(/MuiChip-filledSuccess/)
    await expect(statusChip('subscribed')).toHaveClass(/MuiChip-filledSuccess/)

    // ...and their old *** ... *** lines are no longer drawn
    await expect(page.getByText(/^\*\*\* .* \*\*\*$/)).toHaveCount(0)
})

test('each event is collapsed behind a summary and expands to its raw JSON', async () => {
    // the summary shows the top-level keys without expanding
    await expect(page.getByText(/metricsInterval, cluster/).first()).toBeVisible()

    await page.locator('button[aria-label="Expand event"]').first().click()

    await expect(page.getByText('"metricsInterval"').first()).toBeVisible()
})

test('a rendered event never goes past the line cap', async () => {
    // Invariant: however big the event is, more than 1000 lines are never drawn. The test does NOT
    // require this particular event to be trimmed (that depends on the cluster); if it is trimmed, it
    // also checks that the notice is consistent with what was drawn.
    const painted = await page.locator('pre').first().evaluate(el => (el.textContent ?? '').split('\n').length)
    console.log('DIAG lineas pintadas en la tarjeta:', painted)
    expect(painted).toBeLessThanOrEqual(1000)

    const notice = page.getByText(/^Trimmed to the first \d+ of \d+ lines/)
    if (!await notice.isVisible().catch(() => false)) return

    const parts = (await notice.textContent() ?? '').match(/first (\d+) of (\d+)/)
    expect(parts).not.toBeNull()
    expect(Number(parts![1])).toBe(1000)
    expect(Number(parts![2])).toBeGreaterThan(1000)
    expect(painted).toBe(1000)
    await expect(notice).toContainText('Use the copy button to get the whole object')
})

test('each event can be copied without collapsing its card', async () => {
    // writeText() demands a focused document; without bringToFront the promise is silently rejected.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.bringToFront()
    // CAREFUL: by role does NOT work. The AccordionSummary is role="button" and its accessible name
    // includes this button's aria-label, so getByRole matched the header and merely collapsed the card.
    const copyButton = page.locator('button[aria-label="Copy event JSON"]').first()
    await expect(copyButton).toBeVisible()

    await copyButton.click()

    // the clipboard's real content is asserted, not the visual "copied" tick: that one lasts only
    // 1.5 s and competes with the repaints of the event stream.
    await expect.poll(async () => {
        const text = await page.evaluate(() => navigator.clipboard.readText())
        try { return Object.keys(JSON.parse(text)) }
        catch { return [] }
    }, { timeout: 10000 }).toContain('metricsInterval')
    // the button lives inside the summary, so the click must not collapse the expanded card
    await expect(page.getByText('"metricsInterval"').first()).toBeVisible()
})

test('the notice warns about matches that fall past the cut', async () => {
    /*
        A term that exists ONLY past line 1000 is looked for, computed from the whole object the copy
        button gives: that way the case is real and does not depend on which keys the cluster has. Were
        there none (every key at the end already appears earlier), there is no case to test.
    */
    const full = await page.evaluate(() => navigator.clipboard.readText())
    const lines = full.split('\n')
    const keyOf = (line: string): string | undefined => (line.match(/^\s*"([^"]+)"\s*:/) ?? [])[1]
    const early = new Set(lines.slice(0, 1000).map(keyOf).filter(Boolean))
    const term = lines.slice(1000).map(keyOf).find(k => k !== undefined && !early.has(k))
    test.skip(term === undefined, 'este evento no tiene ninguna clave exclusiva de mas alla de la linea 1000')

    await page.getByLabel('Search events').fill(term!)

    const notice = page.getByText(/^Trimmed to the first \d+ of \d+ lines/)
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(/\d+ match(es)? falls? past the cut and cannot be highlighted here/)
    await expect(notice).toContainText('Use the copy button to get the whole object')

    // and with no search the notice goes back to the short one, saying nothing about matches
    await page.getByRole('button', { name: 'Clear search' }).click()
    await expect(notice).not.toContainText('past the cut')
})

test('expanding a card is not animated', async () => {
    // An event may carry thousands of lines: animating the expansion leaves it unreadable while it
    // grows. MUI dumps the Collapse's timeout into transition-duration, so it really is assertable.
    // The detail is rendered directly, with no Collapse in between: if the expanded JSON hangs off no
    // Collapse, there is no transition that could animate it. It is checked against the real element
    // rather than against CSS durations, which MUI writes in inline style.
    const expand = page.locator('button[aria-label="Expand event"]').first()
    if (await expand.isVisible().catch(() => false)) await expand.click()

    const json = page.getByText('"metricsInterval"').first()
    await expect(json).toBeVisible()

    const insideCollapse = await json.evaluate(el => Boolean(el.closest('.MuiCollapse-root')))
    expect(insideCollapse).toBe(false)
})

test('the match counter sits left of the search box and starts at 0/0', async () => {
    await expect(page.getByText('0/0')).toBeVisible()

    // the REAL order in the DOM is checked, not just that both exist
    const order = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Search events"]')
        const counter = [...document.querySelectorAll('span,p')].find(el => el.textContent?.trim() === '0/0')
        if (!input || !counter) return 'falta ' + (!input ? 'input' : 'contador')
        return (counter.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'contador-antes' : 'contador-despues'
    })
    expect(order).toBe('contador-antes')
})

test('the search box reports how many events match', async () => {
    await page.getByLabel('Search events').fill('metricsInterval')

    // none has been jumped to yet, so the position is 0 and the total is the number of events
    await expect(page.getByText(/^0\/[1-9]\d*$/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next match' })).toBeEnabled()
})

test('a search with no hits disables the navigation', async () => {
    await page.getByLabel('Search events').fill('no-existe-este-texto-en-ningun-evento')

    await expect(page.getByText('0/0')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next match' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Previous match' })).toBeDisabled()
})

test('next and previous walk the matches and open the card', async () => {
    await page.getByLabel('Search events').fill('metricsInterval')
    // whatever earlier tests left expanded is collapsed, to prove that navigating expands
    const openCard = page.locator('button[aria-label="Collapse event"]').first()
    if (await openCard.isVisible().catch(() => false)) await openCard.click()

    await page.getByRole('button', { name: 'Next match' }).click()

    await expect(page.getByText(/^1\/[1-9]\d*$/)).toBeVisible()
    // the match expands on its own: its JSON is left in view
    await expect(page.getByText('"metricsInterval"').first()).toBeVisible()

    // previous from the first wraps around to the last
    await page.getByRole('button', { name: 'Previous match' }).click()
    await expect(page.getByText(/^\d+\/\d+$/)).toBeVisible()
})

test('the searched text is highlighted inside the expanded card', async () => {
    await page.getByLabel('Search events').fill('maxPods')
    await page.getByRole('button', { name: 'Next match' }).click()

    // the term is drawn in reverse video: its span carries its own background, not the inherited transparent one
    const marked = page.locator('pre span').filter({ hasText: /^maxPods$/ }).first()
    await expect(marked).toBeVisible()

    const style = await marked.evaluate(el => {
        const s = getComputedStyle(el)
        return { bg: s.backgroundColor, color: s.color }
    })
    expect(style.bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(style.bg).not.toBe(style.color)
})

test('clearing the search empties the box and resets the counter', async () => {
    await page.getByLabel('Search events').fill('metricsInterval')

    await page.getByRole('button', { name: 'Clear search' }).click()

    await expect(page.getByLabel('Search events')).toHaveValue('')
    // the counter does not hide: it stays at 0/0 so the gap does not shift
    await expect(page.getByText('0/0')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next match' })).toBeDisabled()
    // the clear button does not disappear either, it is merely disabled
    await expect(page.getByRole('button', { name: 'Clear search' })).toBeDisabled()
})

test('the clear button empties the captured events', async () => {
    await expect(page.getByRole('button', { name: 'Clear captured events' })).toBeEnabled()

    await page.getByRole('button', { name: 'Clear captured events' }).click()

    await expect(page.getByText('Events: 0 / 200')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Clear captured events' })).toBeDisabled()
})
