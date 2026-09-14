import { test, expect, Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// Export/import de los Kwirth Settings.
//
// NO destructivo: el export solo descarga, y el import carga el FORMULARIO sin guardar — todos los tests
// salen por Cancel, y el ultimo comprueba que lo importado no llego a persistirse. El marketplace de prueba
// lleva un id propio con prefijo 'e2e-' para no poder colisionar con uno del usuario.

const INTERVAL_LABEL = 'Cluster metrics read interval (seconds)'
const IMPORTED_ID = 'e2e-import-marketplace'
const IMPORTED_LABEL = 'e2e imported marketplace'

interface IExportedSettings {
    kwirth: string
    version: number
    credentialsIncluded: boolean
    settings: {
        metricsInterval?: number
        marketplaces?: { id: string, label: string, url: string, manifestAuth?: { token?: string } }[]
        packageRegistries?: { id: string, auth?: { token?: string, password?: string } }[]
    }
}

/**
 * Si algun campo del formulario tiene ese valor. Devuelve un booleano a proposito: volcar la lista de
 * valores metia tokens y contraseñas reales en el informe de Playwright cuando el assert fallaba.
 */
async function formHasValue(page: Page, value: string): Promise<boolean> {
    return page.locator('input').evaluateAll((els, v) => els.some(e => (e as HTMLInputElement).value === v), value)
}

async function openSettings(page: Page) {
    await clickMenuItem(page, 'Kwirth Settings')
    await expect(page.getByLabel(INTERVAL_LABEL)).toBeEnabled({ timeout: 10000 })
}

/**
 * Pulsa Export, opera sobre el dialogo de seleccion y devuelve el JSON descargado. 'tweak' recibe el
 * dialogo abierto, ya con todo premarcado, para poder desmarcar items antes de exportar.
 */
async function exportSettings(page: Page, withCredentials: boolean, tweak?: (dialog: ReturnType<Page['getByRole']>) => Promise<void>): Promise<IExportedSettings> {
    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Export Kwirth settings' })
    await expect(dialog).toBeVisible()
    // la lista sale con todo marcado: es lo que hace que el caso normal sea un solo clic
    await expect(dialog.getByLabel('Select all')).toBeChecked()
    if (withCredentials) await dialog.getByLabel('Include credentials').check()
    if (tweak) await tweak(dialog)

    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Export' }).click()
    const file = await download
    const path = await file.path()
    return JSON.parse(readFileSync(path!, 'utf8')) as IExportedSettings
}

test('Kwirth settings: el export baja un fichero con la forma esperada y SIN credenciales por defecto', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await openSettings(page)

    const exported = await exportSettings(page, false)

    expect(exported.kwirth).toBe('kwirth-settings')
    expect(exported.version).toBe(1)
    expect(exported.credentialsIncluded).toBe(false)
    expect(Number(exported.settings.metricsInterval)).toBeGreaterThan(0)
    // sin credenciales significa sin credenciales: ni un token ni una contraseña en todo el fichero
    for (const m of exported.settings.marketplaces ?? []) expect(m.manifestAuth?.token).toBeUndefined()
    for (const r of exported.settings.packageRegistries ?? []) {
        expect(r.auth?.token).toBeUndefined()
        expect(r.auth?.password).toBeUndefined()
    }

    await dismissOpenDialogs(page)
})

test('Kwirth settings: marcar "Include credentials" lo deja anotado en el fichero', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await openSettings(page)

    const exported = await exportSettings(page, true)
    expect(exported.credentialsIncluded).toBe(true)

    await dismissOpenDialogs(page)
})

test('Kwirth settings: el import carga el formulario pero NO guarda hasta aceptar', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await openSettings(page)

    // el fichero se construye a partir de un export real, para probar tambien el viaje de ida y vuelta
    const exported = await exportSettings(page, false)
    const marketplacesBefore = (exported.settings.marketplaces ?? []).length
    exported.settings.marketplaces = [
        ...(exported.settings.marketplaces ?? []),
        { id: IMPORTED_ID, label: IMPORTED_LABEL, url: 'https://example.invalid/manifest.json' }
    ]
    const path = join(tmpdir(), `kwirth-settings-e2e-${Date.now()}.json`)
    writeFileSync(path, JSON.stringify(exported, null, 2))

    await page.locator('input[type="file"]').setInputFiles(path)

    // el fichero no entra solo: primero se elige que se importa, con todo premarcado
    const importDialog = page.getByRole('dialog').filter({ hasText: 'Import Kwirth settings' })
    await expect(importDialog).toBeVisible()
    await expect(importDialog.getByLabel('Select all')).toBeChecked()
    await expect(importDialog.getByText(IMPORTED_LABEL)).toBeVisible()
    // lo que ya existe se avisa; el intervalo siempre esta puesto, asi que siempre lleva su aviso
    await expect(importDialog.getByText('overwrites the current value')).toBeVisible()
    await importDialog.getByRole('button', { name: 'Import' }).click()

    await expect(page.getByText('Nothing is saved until you press OK.')).toBeVisible()

    // la fila importada esta en el formulario, junto a las que ya habia (fusion por id, no reemplazo)
    await page.getByRole('tab', { name: 'Marketplaces' }).click()
    expect(await formHasValue(page, IMPORTED_LABEL)).toBe(true)
    expect(await formHasValue(page, 'https://example.invalid/manifest.json')).toBe(true)

    // Cancel: nada de esto debe haber llegado al back
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 })

    await openSettings(page)
    await page.getByRole('tab', { name: 'Marketplaces' }).click()
    expect(await formHasValue(page, IMPORTED_LABEL)).toBe(false)

    // y el resto de marketplaces del usuario sigue donde estaba
    const after = await exportSettings(page, false)
    expect((after.settings.marketplaces ?? []).length).toBe(marketplacesBefore)

    await dismissOpenDialogs(page)
})

test('Kwirth settings: el export se lleva SOLO lo marcado', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await openSettings(page)

    // desmarcar todo y quedarse con el intervalo: el fichero no debe traer ni marketplaces ni registries
    const onlyGeneral = await exportSettings(page, false, async dialog => {
        await dialog.getByLabel('Select all').uncheck()
        await dialog.getByRole('checkbox').nth(1).check()   // el primero de la lista es el intervalo
    })

    expect(Number(onlyGeneral.settings.metricsInterval)).toBeGreaterThan(0)
    expect(onlyGeneral.settings.marketplaces ?? []).toHaveLength(0)
    expect(onlyGeneral.settings.packageRegistries ?? []).toHaveLength(0)

    await dismissOpenDialogs(page)
})

test('Kwirth settings: lo desmarcado en el import no entra en el formulario', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await openSettings(page)

    const exported = await exportSettings(page, false)
    exported.settings.marketplaces = [
        ...(exported.settings.marketplaces ?? []),
        { id: IMPORTED_ID, label: IMPORTED_LABEL, url: 'https://example.invalid/manifest.json' }
    ]
    const path = join(tmpdir(), `kwirth-settings-e2e-${Date.now()}.json`)
    writeFileSync(path, JSON.stringify(exported, null, 2))

    await page.locator('input[type="file"]').setInputFiles(path)
    const importDialog = page.getByRole('dialog').filter({ hasText: 'Import Kwirth settings' })
    await expect(importDialog).toBeVisible()

    // se desmarca justo el marketplace nuevo, el resto entra
    await importDialog.locator('label').filter({ hasText: IMPORTED_LABEL }).getByRole('checkbox').uncheck()
    await importDialog.getByRole('button', { name: 'Import' }).click()
    await expect(page.getByText('Nothing is saved until you press OK.')).toBeVisible()

    await page.getByRole('tab', { name: 'Marketplaces' }).click()
    expect(await formHasValue(page, IMPORTED_LABEL)).toBe(false)

    await dismissOpenDialogs(page)
})
