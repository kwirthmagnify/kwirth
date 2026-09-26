import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

// E2E for the WebhookManagerDialog (the `webhook` extension type, stream 3.4).
// It needs the dev core with the `jira` dev webhook loaded (kwirth-dev.json → webhooks.jira).
// Non-destructive: the test config carries its own prefix and is deleted at the end.

const CFG = `e2e-webhook-test`

test('Manage webhooks: lists the jira webhook and a config mints a routable URL', async ({ page }) => {
    await login(page)
    await clickExtensionMenuItem(page, 'Webhooks')

    // The "Manage webhooks" dialog is open and the jira dev webhook shows up as installed.
    await expect(page.getByText('Manage webhooks')).toBeVisible()
    // .first(): jira appears TWICE now that besides being installed it is published in the private
    // marketplace — once under 'Installed webhooks' and once under 'Available webhooks'. Unscoped, strict mode.
    await expect(page.getByText('Jira Webhook').first()).toBeVisible()

    // Open the jira webhook's config (the Configure ⚙ button on its card).
    await page.getByRole('button', { name: 'Configure' }).first().click()
    const cfgDialog = page.getByRole('dialog').filter({ hasText: 'Configure: Jira Webhook' })
    await expect(cfgDialog).toBeVisible()

    // New config: name + apiKey (the artifact's schema). Scoped to the config dialog.
    await cfgDialog.getByRole('button', { name: 'New', exact: true }).click()
    await cfgDialog.getByRole('textbox', { name: 'Name *', exact: true }).fill(CFG)
    await cfgDialog.getByLabel(/API key/i).fill('e2e-secret')
    await cfgDialog.getByRole('button', { name: 'Add', exact: true }).click()

    // After saving the Webhook URL (readonly) must appear with the token (path /webhook/jira/<token>).
    await expect(cfgDialog.getByText('Webhook URL')).toBeVisible({ timeout: 10_000 })
    const urlInput = cfgDialog.locator('input[readonly]')
    await expect(urlInput).toBeVisible()
    // the VALUE is kept, not the locator: the field is the same element and later on it will show the copy's
    const originalUrl = await urlInput.inputValue()
    expect(originalUrl).toMatch(/\/webhook\/jira\/[A-Za-z0-9_-]{10,}/)

    // ── Clonar ────────────────────────────────────────────────────────────────
    // 'Clone' lives at the bottom next to 'New', as in every other manager: always visible, and enabled
    // only when a config is open — which is what there is to copy. Cloning leaves the form with that
    // config's values and the name freed; the copy does not exist until saved, and the back end mints its
    // token then, so it does not inherit the original's.
    const CLONE = `${CFG} (copy)`
    const cloneButton = cfgDialog.getByRole('button', { name: 'Clone', exact: true })
    await expect(cloneButton, 'Clone esta siempre visible, no aparece y desaparece').toBeVisible()
    await cloneButton.click()

    // the form proposes the copy's name, with the original's values
    const nameField = cfgDialog.getByRole('textbox', { name: 'Name *', exact: true })
    await expect(nameField).toHaveValue(CLONE)
    expect(await cfgDialog.getByLabel(/API key/i).inputValue(), 'la copia hereda los valores').toBe('e2e-secret')

    await cfgDialog.getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForTimeout(800)

    // now there are TWO: cloning must neither rename nor overwrite the original
    await expect(cfgDialog.getByText(CFG, { exact: true })).toHaveCount(1)
    await expect(cfgDialog.getByText(CLONE, { exact: true })).toHaveCount(1)

    // and the copy has its OWN token, different from the original's
    const cloneUrl = await cfgDialog.locator('input[readonly]').inputValue()
    expect(cloneUrl).toMatch(/\/webhook\/jira\/[A-Za-z0-9_-]{10,}/)
    expect(cloneUrl, 'la copia no puede compartir el token de la original').not.toBe(originalUrl)

    // Non-destructive cleanup: delete both test configs (the last button on the row is Delete).
    for (const name of [CLONE, CFG]) {
        const row = cfgDialog.getByText(name, { exact: true }).locator('xpath=ancestor::div[.//button][1]')
        await row.locator('button').last().click()
        await page.waitForTimeout(600)
        await expect(cfgDialog.getByText(name, { exact: true })).toHaveCount(0)
    }

    await dismissOpenDialogs(page)
})
