import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

/*
    The `dce` type in the FRONT END (plan: plans/dce/PLAN.md, S2). It needs the dev core with the sample
    DCE and its consumer stub loaded (kwirth-dev.json → dces.sample, plugins.dce-consumer).

    What it checks is the two things the front end adds to the type:

      · the manager: the DCE is listed as a family of its own, saying which sides it brings and whether
        its back end is alive — a DCE whose factory failed has to be readable from the card
      · the ONE instance: the consumer stub reads the DCE on both ends and its counters GROW between
        readings. A copy of the code would say 1 → 2 for ever, which is what the type exists to prevent

    NON-destructive: it installs and removes nothing. It opens the manager, reads, opens the stub's
    channel and presses its button. Tabs are not persisted between browser sessions, so nothing is left
    behind.
*/

const DIALOG = /Manage DCEs/i
const CHANNEL = 'dce-consumer'

test.describe.configure({ mode: 'serial' })

test.describe('dce: the manager and the single instance', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        await page?.close()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    test('🔴 DCEs are a family of their own in the extensions menu', async () => {
        await clickExtensionMenuItem(page, 'DCEs')
        await expect(dialog()).toBeVisible({ timeout: 40000 })
        // The generic manager's two sections, with the type's noun interpolated from the descriptor.
        await expect(dialog().getByText(/Installed DCEs/i)).toBeVisible()
        await expect(dialog().getByText(/Available DCEs/i)).toBeVisible()
    })

    test('🔴 the sample DCE says which sides it brings and that its back end is LOADED', async () => {
        const card = dialog().getByText('Sample DCE').first()
        await expect(card).toBeVisible()
        // The chips of the type: what the package brought, and how its factory went. A DCE whose factory
        // threw is installed and useless, and that must be readable here and not only in the server log.
        await expect(dialog().getByText('back + front').first()).toBeVisible()
        await expect(dialog().getByText('Loaded', { exact: true }).first()).toBeVisible()
    })

    test('a DCE has no configuration in this version, so it shows no gear', async () => {
        // The type declares no renderConfigDialog: the generic manager must not paint one.
        await expect(dialog().getByRole('button', { name: 'Configure' })).toHaveCount(0)
        await dismissOpenDialogs(page)
    })

    // ── The single instance, through the consumer stub ────────────────────────────────────────────

    test('🔴 the consumer reads the DCE on BOTH ends, and neither says it is missing', async () => {
        /*
            The cluster that OFFERS the channel, found by asking rather than by name.

            This Kwirth may have other clusters connected, and the stub is installed only in the local
            one. Taking the first on the list left the channel selector empty with nothing broken; and
            the title bar is no help either, because it renames itself with whatever cluster is picked.
            So each one is tried and the first that offers the channel wins — which is exactly the
            question being asked, and it does not depend on what this environment's clusters are called.
        */
        await page.getByRole('combobox').first().click()
        await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
        const clusters = await page.getByRole('option').allInnerTexts()
        await page.keyboard.press('Escape')
        expect(clusters.length, 'no clusters at all in the selector').toBeGreaterThan(0)

        let chosen: string | undefined
        for (const cluster of clusters.map(c => c.trim()).filter(Boolean)) {
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
        expect(chosen, `no cluster offers the '${CHANNEL}' channel: the stub is not loaded`).toBeTruthy()

        await page.waitForTimeout(400)
        await page.getByRole('button', { name: 'ADD' }).click()
        await page.waitForTimeout(2500)

        // Adding the tab does not start the channel: Start has to be pressed, as a user would. It is
        // checked all the same, so this still holds should starting ever become automatic.
        await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
        await page.waitForTimeout(500)
        const start = page.getByText('Start', { exact: true })
        if (await start.isVisible().catch(() => false)) await start.click()
        else await page.keyboard.press('Escape')
        await page.waitForTimeout(2500)

        await expect(page.getByText('What the sample DCE says, on each end')).toBeVisible({ timeout: 30000 })
        // getDce() throws when the DCE is not there, and the stub paints the cause. Nothing here may.
        await expect(page.locator('[aria-label="Back end error"]')).toHaveCount(0)
        await expect(page.locator('[aria-label="Front end error"]')).toHaveCount(0)
    })

    test('🔴 the counters GROW between readings: it is ONE instance, not a copy per reading', async () => {
        const ticks = async (side: string): Promise<number[]> =>
            (await page.locator(`[aria-label="${side} ticks"]`).innerText()).split('→').map(t => Number(t.trim()))

        const backBefore = await ticks('Back end')
        const frontBefore = await ticks('Front end')
        // Two consecutive calls to the shared counter: within one reading they already have to differ.
        expect(backBefore[1], 'the back end counter does not move within a reading').toBe(backBefore[0] + 1)
        expect(frontBefore[1], 'the front end counter does not move within a reading').toBe(frontBefore[0] + 1)

        await page.getByRole('button', { name: 'Read again' }).click()
        await expect(async () => {
            const backAfter = await ticks('Back end')
            expect(backAfter[0], 'the back end built a NEW object instead of sharing one').toBeGreaterThan(backBefore[1])
        }).toPass({ timeout: 15000 })

        const frontAfter = await ticks('Front end')
        expect(frontAfter[0], 'the front end built a NEW object instead of sharing one').toBeGreaterThan(frontBefore[1])
    })

    test('the back end says how many times its factory has run on this Kwirth', async () => {
        // It is the host's configMaps at work: the count survives restarts, the counter does not.
        await expect(page.getByText(/factory runs on this Kwirth: \d+/)).toBeVisible()
    })
})
