import { test } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs, GUIDE_MEDIA } from './helpers'

// Screenshots of the webhooks guide's images (docs/_media/guide). Dark theme.
// Run by hand: playwright test capture-webhooks.spec.ts. It needs the dev environment with the jira dev webhook.

// The screenshots go to the LIVE documentation: see GUIDE_MEDIA in helpers.ts.
const MEDIA = GUIDE_MEDIA
const CFG = 'default'

test('capture manage-webhooks + webhook-config (dark)', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await clickExtensionMenuItem(page, 'Webhooks')

    // 1) The "Manage webhooks" dialog with the webhook installed.
    const manageDialog = page.getByRole('dialog').filter({ hasText: 'Manage webhooks' })
    await manageDialog.waitFor()
    await page.waitForTimeout(600)
    await manageDialog.screenshot({ path: `${MEDIA}/manage-webhooks.png` })

    // 2) The config form with the Webhook URL (token) visible.
    await page.getByRole('button', { name: 'Configure' }).first().click()
    const cfgDialog = page.getByRole('dialog').filter({ hasText: 'Configure: Jira Webhook' })
    await cfgDialog.waitFor()
    await cfgDialog.getByRole('button', { name: 'New', exact: true }).click()
    await cfgDialog.getByRole('textbox', { name: 'Name *', exact: true }).fill(CFG)
    await cfgDialog.getByLabel(/API key/i).fill('s3cr3t')
    await cfgDialog.getByRole('button', { name: 'Add', exact: true }).click()
    await cfgDialog.getByText('Webhook URL').waitFor({ timeout: 10_000 })
    await page.waitForTimeout(400)
    await cfgDialog.screenshot({ path: `${MEDIA}/webhook-config.png` })

    // Cleanup no destructivo.
    const row = cfgDialog.getByText(CFG, { exact: true }).locator('xpath=ancestor::div[.//button][1]')
    await row.locator('button').last().click()
    await page.waitForTimeout(400)
    await dismissOpenDialogs(page)
})
