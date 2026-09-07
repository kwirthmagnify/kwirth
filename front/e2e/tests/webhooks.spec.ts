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
    // se guarda el VALOR, no el locator: el campo es el mismo elemento y mas abajo mostrara el de la copia
    const originalUrl = await urlInput.inputValue()
    expect(originalUrl).toMatch(/\/webhook\/jira\/[A-Za-z0-9_-]{10,}/)

    // ── Clonar ────────────────────────────────────────────────────────────────
    // 'Clone' vive abajo junto a 'New', como en el resto de managers: siempre visible, y habilitado solo
    // cuando hay una config abierta — que es lo que hay que copiar. Clonar deja el formulario con los
    // valores de esa config y el nombre liberado; la copia no existe hasta guardar, y su token lo acuña
    // el back entonces, asi que no hereda el de la original.
    const CLONE = `${CFG} (copy)`
    const cloneButton = cfgDialog.getByRole('button', { name: 'Clone', exact: true })
    await expect(cloneButton, 'Clone esta siempre visible, no aparece y desaparece').toBeVisible()
    await cloneButton.click()

    // el formulario propone el nombre de la copia, con los valores de la original
    const nameField = cfgDialog.getByRole('textbox', { name: 'Name *', exact: true })
    await expect(nameField).toHaveValue(CLONE)
    expect(await cfgDialog.getByLabel(/API key/i).inputValue(), 'la copia hereda los valores').toBe('e2e-secret')

    await cfgDialog.getByRole('button', { name: 'Add', exact: true }).click()
    await page.waitForTimeout(800)

    // ahora hay DOS: clonar no puede renombrar ni pisar la original
    await expect(cfgDialog.getByText(CFG, { exact: true })).toHaveCount(1)
    await expect(cfgDialog.getByText(CLONE, { exact: true })).toHaveCount(1)

    // y la copia tiene su PROPIO token, distinto del de la original
    const cloneUrl = await cfgDialog.locator('input[readonly]').inputValue()
    expect(cloneUrl).toMatch(/\/webhook\/jira\/[A-Za-z0-9_-]{10,}/)
    expect(cloneUrl, 'la copia no puede compartir el token de la original').not.toBe(originalUrl)

    // Cleanup no destructivo: borrar las dos configs de test (el ultimo boton de la fila es Delete).
    for (const name of [CLONE, CFG]) {
        const row = cfgDialog.getByText(name, { exact: true }).locator('xpath=ancestor::div[.//button][1]')
        await row.locator('button').last().click()
        await page.waitForTimeout(600)
        await expect(cfgDialog.getByText(name, { exact: true })).toHaveCount(0)
    }

    await dismissOpenDialogs(page)
})
