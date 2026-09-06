import { Page } from '@playwright/test'

export const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
export const PASS = process.env.KWIRTH_E2E_PASS ?? ''

// El dev server de CRA tapa la página entera con un iframe cuando hay un error de compilación, y NO lo
// retira al recuperarse: se queda ahí interceptando todos los clicks, así que los tests fallan con un
// "element is visible, enabled and stable" que no dice nada del motivo real. Aparece con cualquier
// tropiezo transitorio del watch — un `npm install` mientras compila, por ejemplo.
//
// Se retira, pero NUNCA en silencio: si tapaba un error de compilación de verdad, ese mensaje es
// justo lo que hace falta para entender el fallo que venga después.
export async function dismissDevOverlay(page: Page): Promise<void> {
    const overlay = page.locator('iframe#webpack-dev-server-client-overlay')
    if (await overlay.count() === 0) return
    const message = await page.frameLocator('iframe#webpack-dev-server-client-overlay').locator('body')
        .innerText().catch(() => '(no se pudo leer)')
    console.log(`[e2e] retirado el overlay del dev server, que decia:\n${message.slice(0, 500)}`)
    await overlay.evaluate(el => el.remove()).catch(() => {})
}

export async function login(page: Page, user = USER, pass = PASS): Promise<void> {
    await page.goto('/')
    await dismissDevOverlay(page)
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
