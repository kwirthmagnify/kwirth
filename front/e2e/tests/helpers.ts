import { Page } from '@playwright/test'

export const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
export const PASS = process.env.KWIRTH_E2E_PASS ?? ''

export async function login(page: Page, user = USER, pass = PASS): Promise<void> {
    await page.goto('/')
    await page.getByLabel('User').fill(user)
    await page.getByLabel('Password').fill(pass)
    await page.getByRole('button', { name: 'OK' }).click()
    await page.waitForTimeout(1500)
}

/** Abre el drawer hamburguesa. */
export async function openMenu(page: Page): Promise<void> {
    await page.getByRole('button', { name: /menu/i }).first().click()
    await page.waitForTimeout(300)
}

/** Abre el drawer y clica un item de primer nivel. */
export async function clickMenuItem(page: Page, label: string): Promise<void> {
    await openMenu(page)
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await page.waitForTimeout(400)
}

/** Abre el drawer, expande "Manage extensions" y clica un sub-item. */
export async function clickExtensionMenuItem(page: Page, label: string): Promise<void> {
    await openMenu(page)
    await page.getByRole('menuitem', { name: /Manage extensions/i }).click()
    await page.waitForTimeout(200)
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await page.waitForTimeout(400)
}
