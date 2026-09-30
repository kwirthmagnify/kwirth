import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo } from './helpers'

/*
    The `nettools` channel: the plugin that consumes the DCE of the same name (plan: plans/completed/nettools/PLAN.md, S2).

    It needs the dev core with both loaded (kwirth-dev.json → dces.nettools, plugins.nettools). What it
    checks is the thing only a running Kwirth can answer: that the browser asks, the BACK END resolves
    with the shared instance, and the answer comes back and is painted — records, PTR names, a port that
    answers and one that does not.

    ⚠️ It needs outbound DNS from the Kwirth process for `example.com` and `8.8.8.8` (the two reserved
    names every test suite uses). The port check does not: it knocks on Kwirth's own port, which is
    listening by definition while this runs.

    NON-destructive: it installs and removes nothing. It opens a tab and types in it; tabs are not
    persisted between browser sessions, so nothing is left behind.
*/

const CHANNEL = 'nettools'

test.describe.configure({ mode: 'serial' })

test.describe('nettools: the channel that consumes the DCE', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        await page?.close()
    })

    /** The newest answer: the list is newest first. */
    const latest = () => page.locator('[aria-label="reading headline"]').first()
    const latestSummary = () => page.locator('[aria-label="reading summary"]').first()

    const ask = async (button: string): Promise<void> => {
        await page.getByRole('button', { name: button, exact: true }).click()
        // The button is disabled while the request is in flight; it coming back is the answer arriving.
        await expect(page.getByRole('button', { name: button, exact: true })).toBeEnabled({ timeout: 30000 })
    }

    const type = async (label: string, value: string): Promise<void> => {
        await page.getByLabel(label, { exact: true }).fill(value)
    }

    test('🔴 the channel opens: the cluster that offers it is found by asking, not by name', async () => {
        /*
            This Kwirth may have several clusters connected and the stub is installed only in the local
            one. Taking the first on the list leaves the channel selector empty with nothing broken, and
            the title bar is no help because it renames itself with whatever cluster is picked. So each
            one is tried and the first that offers the channel wins.
        */
        await page.getByRole('combobox').first().click()
        await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
        const clusters = await page.getByRole('option').allInnerTexts()
        await page.keyboard.press('Escape')
        expect(clusters.length, 'no clusters at all in the selector').toBeGreaterThan(0)

        let chosen: string | undefined
        for (const cluster of clusters.map(name => name.trim()).filter(Boolean)) {
            await pickCombo(page, 0, cluster)
            await page.waitForTimeout(600)
            await pickCombo(page, 1, 'cluster')
            await page.waitForTimeout(600)
            const combos = await page.getByRole('combobox').count()
            await page.getByRole('combobox').nth(combos - 1).click()
            await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
            const option = page.getByRole('option', { name: CHANNEL, exact: true })
            if (await option.count() > 0) { await option.click(); chosen = cluster; break }
            await page.keyboard.press('Escape')
            await page.waitForTimeout(300)
        }
        expect(chosen, `no cluster offers the '${CHANNEL}' channel: the plugin is not loaded`).toBeTruthy()

        await page.waitForTimeout(400)
        await page.getByRole('button', { name: 'ADD' }).click()
        await page.waitForTimeout(2500)

        // Adding the tab does not start the channel: Start has to be pressed, as a user would.
        await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
        await page.waitForTimeout(500)
        const start = page.getByText('Start', { exact: true })
        if (await start.isVisible().catch(() => false)) await start.click()
        else await page.keyboard.press('Escape')
        await page.waitForTimeout(2500)

        await expect(page.getByText('DNS and reachability, as Kwirth sees them')).toBeVisible({ timeout: 30000 })
        await expect(page.getByText('Nothing asked yet.')).toBeVisible()
    })

    test('the buttons stay disabled until there is something to ask about', async () => {
        await expect(page.getByRole('button', { name: 'Resolve', exact: true })).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Reverse', exact: true })).toBeDisabled()
        await expect(page.getByRole('button', { name: 'Check port', exact: true })).toBeDisabled()
    })

    test('🔴 Resolve answers with records read by the BACK end, through the shared instance', async () => {
        await type('Host or IP', 'example.com')
        await ask('Resolve')

        await expect(latest()).toHaveText('resolve A · example.com', { timeout: 30000 })
        // getDce() throws when the DCE is missing; the plugin paints that as its own error. Nothing may.
        await expect(page.locator('[aria-label="reading error"]')).toHaveCount(0)
        await expect(page.locator('[aria-label="reading failure"]')).toHaveCount(0)
        await expect(latestSummary()).toHaveText(/[1-9]\d* record\(s\) in \d+ ms/)
        // An A record and nothing else: what is painted is the DCE's normalised text.
        await expect(page.locator('[aria-label="reading line"]').first()).toHaveText(/^\d{1,3}(\.\d{1,3}){3}$/)
        // The chip names the DCE the reading came from — the id the core installed it under.
        await expect(page.getByText('dce: nettools').first()).toBeVisible()
    })

    test('🔴 Reverse answers the PTR name of an address', async () => {
        await type('Host or IP', '8.8.8.8')
        await ask('Reverse')

        await expect(latest()).toHaveText('reverse · 8.8.8.8', { timeout: 30000 })
        await expect(page.locator('[aria-label="reading failure"]')).toHaveCount(0)
        await expect(page.locator('[aria-label="reading line"]').first()).toHaveText('dns.google')
    })

    test("🔴 Check port knocks on Kwirth's own port, which is listening by definition", async () => {
        await type('Host or IP', '127.0.0.1')
        await type('Port', '3883')
        await ask('Check port')

        await expect(latest()).toHaveText('check · 127.0.0.1:3883', { timeout: 30000 })
        await expect(latestSummary()).toHaveText(/3\/3 answered · 0% loss · min \d+/)
        await expect(page.locator('[aria-label="reading line"]').first()).toHaveText(/^#1 \d+ ms$/)
    })

    test('🔴 a port nobody listens on is a READING and not an error: every attempt says why', async () => {
        await type('Port', '1')
        await ask('Check port')

        await expect(latest()).toHaveText('check · 127.0.0.1:1', { timeout: 30000 })
        await expect(latestSummary()).toHaveText(/0\/3 answered · 100% loss/)
        // The probe did not fail — the port refused. The difference is the whole contract of the DCE.
        await expect(page.locator('[aria-label="reading failure"]')).toHaveCount(0)
        await expect(page.locator('[aria-label="reading line"]').first()).toHaveText(/^#1 .*(ECONNREFUSED|timed out)/)
    })

    test('🔴 what the DCE refuses is painted as the failure of the result, not as a broken plugin', async () => {
        await type('Host or IP', 'https://example.com')
        await ask('Resolve')

        await expect(page.locator('[aria-label="reading failure"]').first())
            .toHaveText("Invalid name 'https://example.com': a host name was expected", { timeout: 30000 })
        // It is the RESULT that carries it. The plugin's own error line is for the DCE being missing.
        await expect(page.locator('[aria-label="reading error"]')).toHaveCount(0)
    })

    /*
        ── The DCE's FRONT end ──────────────────────────────────────────────────────────────────────

        Everything below is drawn by code that came out of `window.__kwirth_dce__['nettools']`: the
        plugin owns neither the icon's path nor a line of chart code. That is the half of the type the
        back-end tests cannot reach, and the reason this DCE grew a front at all.
    */

    const dialog = () => page.getByRole('dialog').filter({ hasText: 'DNS round trips' })

    test("🔴 the Latency button opens a dialog the DCE provides, drawing the DCE's shared history", async () => {
        await page.getByRole('button', { name: 'Latency', exact: true }).click()
        await expect(dialog()).toBeVisible({ timeout: 15000 })

        // recharts, resolved against the core's global rather than bundled by the DCE.
        await expect(dialog().locator('.recharts-surface')).toBeVisible()
        await expect(dialog().locator('.recharts-line')).toHaveCount(1)

        /*
            The history has the lookups made EARLIER IN THIS FILE, which is the whole point: the plugin
            recorded them into the DCE as the answers arrived, and this dialog — which the plugin did
            not write — is reading the same object back.

            Three of them resolved: example.com A, the reverse of 8.8.8.8, and 8.8.8.8 A. The two port
            checks are not DNS, and the invalid name never reached a resolver.
        */
        await expect(dialog().getByText('lookups')).toBeVisible()
        const lookups = Number(await dialog().locator('text=lookups').locator('xpath=following-sibling::*[1]').innerText())
        expect(lookups, 'the plugin did not record its round trips into the DCE').toBeGreaterThan(0)

        for (const headline of ['min', 'avg', 'max']) await expect(dialog().getByText(headline, { exact: true })).toBeVisible()
    })

    test('🔴 a lookup made while the dialog is OPEN reaches the chart: the history is listened to, not copied', async () => {
        const countOf = async (): Promise<number> =>
            Number(await dialog().locator('text=lookups').locator('xpath=following-sibling::*[1]').innerText())
        const before = await countOf()

        // The dialog stays up; the question is asked behind it, from the tab.
        await dialog().getByRole('button', { name: 'CLOSE', exact: true }).click()
        await expect(dialog()).toBeHidden()
        await type('Host or IP', 'example.com')
        await ask('Resolve')
        await page.getByRole('button', { name: 'Latency', exact: true }).click()
        await expect(dialog()).toBeVisible()

        await expect(async () => expect(await countOf()).toBe(before + 1)).toPass({ timeout: 15000 })
    })

    test('CLEAR empties the shared history, and the dialog says so instead of drawing an empty chart', async () => {
        await dialog().getByRole('button', { name: 'CLEAR', exact: true }).click()

        await expect(dialog().getByText('No lookups yet')).toBeVisible({ timeout: 10000 })
        await expect(dialog().locator('.recharts-surface')).toHaveCount(0)
        // Nothing to clear any more, so the button says so rather than staying live.
        await expect(dialog().getByRole('button', { name: 'CLEAR', exact: true })).toBeDisabled()

        await dialog().getByRole('button', { name: 'CLOSE', exact: true }).click()
        await expect(dialog()).toBeHidden()
    })
})
