import { Page, Locator, expect } from '@playwright/test'

export const USER = process.env.PROVIDER_DEBUG_E2E_USER ?? 'admin'
export const PASS = process.env.PROVIDER_DEBUG_E2E_PASS ?? ''
export const CLUSTER = process.env.PROVIDER_DEBUG_E2E_CLUSTER ?? 'inCluster'
export const CHANNEL = 'provider-debug'

/**
 * Login. El dev server del front recompila y puede tardar en pintar, así que se espera a que
 * aparezca el formulario o el selector de recursos con margen amplio, y tras enviar se espera al
 * selector en vez de a un timeout fijo (era la causa de fallos intermitentes por página en blanco).
 */
export async function login(page: Page, user = USER, pass = PASS): Promise<void> {
    await page.goto('/')
    const userField = page.getByLabel('User')
    const combo = page.getByRole('combobox').first()
    await Promise.race([
        userField.waitFor({ state: 'visible', timeout: 90000 }).catch(() => { }),
        combo.waitFor({ state: 'visible', timeout: 90000 }).catch(() => { })
    ])
    if (await userField.isVisible().catch(() => false)) {
        await userField.fill(user)
        await page.getByLabel('Password').fill(pass)
        await page.getByRole('button', { name: 'OK' }).click()
    }
    await expect(combo).toBeVisible({ timeout: 60000 })
}

/** Cluster → View=cluster → deja abierto el combo de canales y devuelve la opción provider-debug. */
export async function openChannelPicker(page: Page): Promise<Locator> {
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: CLUSTER }).click()
    await page.waitForTimeout(800)
    await page.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'cluster', exact: true }).click()
    await page.waitForTimeout(800)
    const combos = page.getByRole('combobox')
    await combos.nth(await combos.count() - 1).click()
    return page.getByRole('option', { name: CHANNEL, exact: true })
}

/**
 * Abre el menú de la pestaña activa (icono de engranaje).
 * No hace falta limpiar pestañas al terminar: no se persisten entre sesiones de navegador, así
 * que cada test arranca con el workspace del usuario intacto.
 */
export async function openTabMenu(page: Page): Promise<void> {
    await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
    await page.waitForTimeout(500)
}
