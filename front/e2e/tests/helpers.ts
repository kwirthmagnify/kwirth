import { Page } from '@playwright/test'

export const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
export const PASS = process.env.KWIRTH_E2E_PASS ?? ''

// El dev server de CRA tapa la página con un iframe cuando la compilación falla. Ese iframe significa
// exactamente eso: **el front no compila**. No es un residuo que se pueda apartar — si se retira, los
// tests siguen sobre un bundle que no es el que se quiere probar, y pueden acabar en verde.
//
// Asi que se aborta, y con el texto del overlay, que es justo el diagnostico que hace falta: sin él, el
// sintoma es un click que no llega porque "algo" lo intercepta.
export async function assertFrontCompiles(page: Page): Promise<void> {
    const overlay = page.locator('iframe#webpack-dev-server-client-overlay')
    if (await overlay.count() === 0) return
    const message = await page.frameLocator('iframe#webpack-dev-server-client-overlay').locator('body')
        .innerText().catch(() => '(no se pudo leer el overlay)')
    throw new Error(`El front NO COMPILA — el dev server de CRA muestra:\n\n${message.slice(0, 1200)}`)
}

export async function login(page: Page, user = USER, pass = PASS): Promise<void> {
    await page.goto('/')
    await assertFrontCompiles(page)
    await page.getByLabel('User').fill(user)
    await page.getByLabel('Password').fill(pass)
    await page.getByRole('button', { name: 'OK' }).click()
    await page.waitForTimeout(1500)
}

/** Cierra cualquier dialog abierto (por auto-start u otras causas). */
export async function dismissOpenDialogs(page: Page): Promise<void> {
    // Intentar Cancel, luego OK, luego Escape — en ese orden
    for (const name of ['CANCEL', 'OK', 'Close']) {
        const btn = page.getByRole('button', { name })
        if (await btn.count() > 0) {
            await btn.first().click({ timeout: 1000 }).catch(() => {})
            await page.waitForTimeout(400)
        }
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    // Esperar a que no quede ningún dialog visible
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
}

/** Abre el drawer hamburguesa usando locator CSS (no se bloquea por aria-hidden del backdrop). */
export async function openMenu(page: Page): Promise<void> {
    // Primer botón del AppBar (hamburguesa) — locator CSS evita el problema de aria-hidden con MUI Dialog
    await page.locator('header button').first().click({ force: true })
    await page.waitForTimeout(300)
}

/** Abre el drawer y clica un item de primer nivel. */
export async function clickMenuItem(page: Page, label: string): Promise<void> {
    await dismissOpenDialogs(page)
    await openMenu(page)
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await page.waitForTimeout(400)
}

/** Abre el drawer, expande "Manage extensions" y clica un sub-item. */
export async function clickExtensionMenuItem(page: Page, label: string): Promise<void> {
    await dismissOpenDialogs(page)
    await openMenu(page)
    await page.getByRole('menuitem', { name: /Manage extensions/i }).click()
    await page.waitForTimeout(200)
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await page.waitForTimeout(400)
}
