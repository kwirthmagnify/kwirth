import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migration of the `webhook` manager to the generic dialog (plan: plans/extension-managers-ui/PLAN.md).

    What webhooks.spec.ts already covers —creating a config, its URL with a token, cloning and deleting—
    is not repeated here: that spec passes UNTOUCHED after the migration, which is the best proof that
    the behaviour is preserved. What goes here is what the migration adds and nobody was looking at:

      · the 'N configs' chip, premiered by webhooks: the generic one knew how to paint it (`configCount`)
        but until now no migrated type had named configurations. That it COUNTS is checked, not that it
        exists.
      · that the URL panel only shows up on configurations ALREADY SAVED: before saving there is no token
        to show, and showing an empty gap invites copying a URL that does not exist.

    NON-destructive: the configurations carry a prefix of their own and are deleted at the end.
    ⚠️ Creating a webhook configuration fires NOTHING outwards: a webhook is INBOUND ingest.
*/

const CFG1 = 'e2e-chip-uno'
const CFG2 = 'e2e-chip-dos'

test('webhooks: el chip de configs cuenta las que hay, y la URL solo sale en las guardadas', async ({ page }) => {
    test.setTimeout(180000)

    await login(page)
    await clickExtensionMenuItem(page, 'Webhooks')
    const dialog = page.getByRole('dialog').filter({ hasText: /Manage webhooks/i })
    await dialog.waitFor({ timeout: 40000 })

    // To begin with, whatever is there: the chip counts configurations, so we start from what exists and
    // check the INCREMENT. That way the test does not depend on a clean environment.
    const chip = dialog.getByText(/^\d+ configs?$/)
    const inicial = await chip.count() === 0 ? 0 : Number((await chip.first().textContent())!.replace(/\D/g, ''))

    await dialog.getByRole('button', { name: 'Configure' }).first().click()
    const cfg = page.getByRole('dialog').filter({ hasText: /^Configure:/ })
    await expect(cfg).toBeVisible()

    // ── a new configuration, unsaved, has no URL ─────────────────────────────────────────────────────
    await cfg.getByRole('button', { name: 'New', exact: true }).click()
    await expect(cfg.getByText('Webhook URL'), 'una config sin guardar no puede tener token').toHaveCount(0)

    await cfg.getByRole('textbox', { name: 'Name *', exact: true }).fill(CFG1)
    await cfg.getByLabel(/API key/i).fill('e2e-secret')
    await cfg.getByRole('button', { name: 'Add', exact: true }).click()

    // ── guardada: ahora si ─────────────────────────────────────────────────────────────────────────
    await expect(cfg.getByText('Webhook URL')).toBeVisible({ timeout: 15000 })

    // ── and a second one, so the chip has to COUNT ───────────────────────────────────────────────────
    await cfg.getByRole('button', { name: 'New', exact: true }).click()
    await cfg.getByRole('textbox', { name: 'Name *', exact: true }).fill(CFG2)
    await cfg.getByLabel(/API key/i).fill('e2e-secret-2')
    await cfg.getByRole('button', { name: 'Add', exact: true }).click()
    await expect(cfg.getByText(CFG2, { exact: true })).toHaveCount(1, { timeout: 15000 })

    await cfg.getByRole('button', { name: 'Close', exact: true }).click()

    // The chip is re-read on closing the configuration: otherwise it would keep saying the old thing and lie.
    await expect(chip.first()).toHaveText(`${inicial + 2} configs`, { timeout: 15000 })

    // ── cleanup: both are deleted and the chip has to go back to what was there ─────────────────────
    await dialog.getByRole('button', { name: 'Configure' }).first().click()
    await expect(cfg).toBeVisible()
    for (const name of [CFG2, CFG1]) {
        const fila = cfg.getByText(name, { exact: true }).locator('xpath=ancestor::div[.//button][1]')
        await fila.locator('button').last().click()
        await expect(cfg.getByText(name, { exact: true })).toHaveCount(0, { timeout: 10000 })
    }
    await cfg.getByRole('button', { name: 'Close', exact: true }).click()

    if (inicial === 0) await expect(chip).toHaveCount(0, { timeout: 15000 })
    else await expect(chip.first()).toHaveText(`${inicial} config${inicial > 1 ? 's' : ''}`, { timeout: 15000 })

    await dismissOpenDialogs(page)
})
