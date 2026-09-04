import { test, expect } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// Verifica que "Kwirth Settings" persiste de verdad: lo que se guarda sigue ahi al reabrir el dialogo,
// que es justo lo que NO ocurria antes (el valor vivia solo en memoria del provider).
//
// NO destructivo: se lee el valor actual, se prueba con otro, y se restaura al final.

const INTERVAL_LABEL = 'Cluster metrics read interval (seconds)'

/** Abre el dialogo y espera a que termine de cargar sus datos (el campo se habilita al acabar). */
async function openSettings(page: import('@playwright/test').Page) {
    await clickMenuItem(page, 'Kwirth Settings')
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

    // snapshot del valor actual, para restaurarlo al final
    let field = await openSettings(page)
    const original = await field.inputValue()
    expect(Number(original)).toBeGreaterThan(0)

    // un valor distinto del actual, para que el assert no pase por casualidad
    const testValue = String(Number(original) === 37 ? 41 : 37)

    try {
        await field.fill(testValue)
        await saveSettings(page)

        // reabrir: el dialogo relee del back, asi que esto comprueba persistencia real, no estado local
        field = await openSettings(page)
        expect(await field.inputValue()).toBe(testValue)
        await dismissOpenDialogs(page)
    }
    finally {
        // restaurar el valor que tenia el entorno
        const restore = await openSettings(page)
        await restore.fill(original)
        await saveSettings(page)
    }

    // y confirmar que quedo restaurado
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

    // se sale sin guardar; el valor del entorno queda intacto
    await dismissOpenDialogs(page)
    const reopened = await openSettings(page)
    expect(await reopened.inputValue()).toBe(original)
    await dismissOpenDialogs(page)
})
