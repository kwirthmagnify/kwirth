import { test, expect } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// Verifies that "Kwirth Settings" really persists: what is saved is still there on reopening the dialog,
// which is exactly what did NOT happen before (the value lived only in the provider's memory).
//
// NON-destructive: the current value is read, another one is tried, and it is restored at the end.

const INTERVAL_LABEL = 'Cluster metrics read interval (seconds)'

/** Opens the dialog and waits until it has finished loading its data (the field enables when it is done). */
async function openSettings(page: import('@playwright/test').Page) {
    await clickMenuItem(page, 'Kwirth settings')
    const field = page.getByLabel(INTERVAL_LABEL)
    await expect(field).toBeEnabled({ timeout: 10000 })
    return field
}

async function saveSettings(page: import('@playwright/test').Page) {
    const ok = page.getByRole('button', { name: 'OK' })
    await expect(ok).toBeEnabled()
    await ok.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 })
}

test('Kwirth settings: el intervalo de metricas se persiste y sobrevive a reabrir el dialogo', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    // snapshot of the current value, to restore it at the end
    let field = await openSettings(page)
    const original = await field.inputValue()
    expect(Number(original)).toBeGreaterThan(0)

    // a value different from the current one, so the assert does not pass by chance
    const testValue = String(Number(original) === 37 ? 41 : 37)

    try {
        await field.fill(testValue)
        await saveSettings(page)

        // reopen: the dialog re-reads from the back end, so this checks real persistence, not local state
        field = await openSettings(page)
        expect(await field.inputValue()).toBe(testValue)
        await dismissOpenDialogs(page)
    }
    finally {
        // restore the value the environment had
        const restore = await openSettings(page)
        await restore.fill(original)
        await saveSettings(page)
    }

    // and confirm that it was restored
    const after = await openSettings(page)
    expect(await after.inputValue()).toBe(original)
    await dismissOpenDialogs(page)
})

test('Kwirth settings: no deja guardar un intervalo no positivo', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    const field = await openSettings(page)
    const original = await field.inputValue()

    await field.fill('0')
    await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled()

    // it exits without saving; the environment's value is left intact
    await dismissOpenDialogs(page)
    const reopened = await openSettings(page)
    expect(await reopened.inputValue()).toBe(original)
    await dismissOpenDialogs(page)
})
