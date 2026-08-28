import { test } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

// Captura de las imágenes de la guía de webhooks (docs/_media/guide). Tema oscuro.
// Ejecutar a mano: playwright test capture-webhooks.spec.ts. Requiere el dev con el dev webhook jira.

const MEDIA = 'C:/github/aisdkvercel/kwirth/docs/0.5.287/_media/guide'
const CFG = 'default'

test('capture manage-webhooks + webhook-config (dark)', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await clickExtensionMenuItem(page, 'Webhooks')

    // 1) Diálogo "Manage webhooks" con el webhook instalado.
    const manageDialog = page.getByRole('dialog').filter({ hasText: 'Manage webhooks' })
    await manageDialog.waitFor()
    await page.waitForTimeout(600)
    await manageDialog.screenshot({ path: `${MEDIA}/manage-webhooks.png` })

    // 2) Form de config con la Webhook URL (token) visible.
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
