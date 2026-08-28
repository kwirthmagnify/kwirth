import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

// E2E del WebhookManagerDialog (tipo de extensión `webhook`, stream 3.4).
// Requiere el core dev con el dev webhook `jira` cargado (kwirth-dev.json → webhooks.jira).
// No destructivo: la config de test lleva prefijo propio y se borra al final.

const CFG = `e2e-webhook-test`

test('Manage webhooks: lists the jira webhook and a config mints a routable URL', async ({ page }) => {
    await login(page)
    await clickExtensionMenuItem(page, 'Webhooks')

    // El diálogo "Manage webhooks" está abierto y el dev webhook jira aparece instalado.
    await expect(page.getByText('Manage webhooks')).toBeVisible()
    await expect(page.getByText('Jira Webhook')).toBeVisible()

    // Abrir la config del webhook jira (botón Configure ⚙ de su card).
    await page.getByRole('button', { name: 'Configure' }).first().click()
    const cfgDialog = page.getByRole('dialog').filter({ hasText: 'Configure: Jira Webhook' })
    await expect(cfgDialog).toBeVisible()

    // Nueva config: name + apiKey (el schema del artefacto). Scope al diálogo de config.
    await cfgDialog.getByRole('button', { name: 'New', exact: true }).click()
    await cfgDialog.getByRole('textbox', { name: 'Name *', exact: true }).fill(CFG)
    await cfgDialog.getByLabel(/API key/i).fill('e2e-secret')
    await cfgDialog.getByRole('button', { name: 'Add', exact: true }).click()

    // Tras guardar debe aparecer la Webhook URL (readonly) con el token (path /webhook/jira/<token>).
    await expect(cfgDialog.getByText('Webhook URL')).toBeVisible({ timeout: 10_000 })
    const urlInput = cfgDialog.locator('input[readonly]')
    await expect(urlInput).toBeVisible()
    expect(await urlInput.inputValue()).toMatch(/\/webhook\/jira\/[A-Za-z0-9_-]{10,}/)

    // Cleanup no destructivo: borrar SOLO la config de test (por su fila; el único botón de la fila es Delete).
    const row = cfgDialog.getByText(CFG, { exact: true }).locator('xpath=ancestor::div[.//button][1]')
    await row.locator('button').last().click()
    await page.waitForTimeout(500)
    await expect(cfgDialog.getByText(CFG, { exact: true })).toHaveCount(0)

    await dismissOpenDialogs(page)
})
