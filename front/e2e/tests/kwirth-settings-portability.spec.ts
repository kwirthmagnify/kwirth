import { test, expect, Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// Export/import of the Kwirth Settings.
//
// NON-destructive: the export only downloads, and the import loads the FORM without saving — every test
// leaves through Cancel, and the last one checks that what was imported never got persisted. The test
// marketplace carries its own id prefixed 'e2e-' so it cannot collide with one of the user's.

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
 * Whether any field of the form holds that value. It returns a boolean on purpose: dumping the list of
 * values put real tokens and passwords into Playwright's report whenever the assert failed.
 */
async function formHasValue(page: Page, value: string): Promise<boolean> {
    return page.locator('input').evaluateAll((els, v) => els.some(e => (e as HTMLInputElement).value === v), value)
}

async function openSettings(page: Page) {
    await clickMenuItem(page, 'Kwirth Settings')
    await expect(page.getByLabel(INTERVAL_LABEL)).toBeEnabled({ timeout: 10000 })
}

/**
 * Presses Export, works on the selection dialog and returns the downloaded JSON. 'tweak' receives the
 * open dialog, already fully ticked, so items can be unticked before exporting.
 */
async function exportSettings(page: Page, withCredentials: boolean, tweak?: (dialog: ReturnType<Page['getByRole']>) => Promise<void>): Promise<IExportedSettings> {
    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog').filter({ hasText: 'Export Kwirth settings' })
    await expect(dialog).toBeVisible()
    // the list comes out fully ticked: it is what makes the normal case a single click
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
    // without credentials means without credentials: not one token and not one password in the whole file
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

    // the file is built from a real export, so the round trip is exercised too
    const exported = await exportSettings(page, false)
    const marketplacesBefore = (exported.settings.marketplaces ?? []).length
    exported.settings.marketplaces = [
        ...(exported.settings.marketplaces ?? []),
        { id: IMPORTED_ID, label: IMPORTED_LABEL, url: 'https://example.invalid/manifest.json' }
    ]
    const path = join(tmpdir(), `kwirth-settings-e2e-${Date.now()}.json`)
    writeFileSync(path, JSON.stringify(exported, null, 2))

    await page.locator('input[type="file"]').setInputFiles(path)

    // the file does not go in by itself: first you choose what is imported, fully ticked
    const importDialog = page.getByRole('dialog').filter({ hasText: 'Import Kwirth settings' })
    await expect(importDialog).toBeVisible()
    await expect(importDialog.getByLabel('Select all')).toBeChecked()
    await expect(importDialog.getByText(IMPORTED_LABEL)).toBeVisible()
    // what already exists is warned about; the interval is always set, so it always carries its warning
    await expect(importDialog.getByText('overwrites the current value')).toBeVisible()
    await importDialog.getByRole('button', { name: 'Import' }).click()

    await expect(page.getByText('Nothing is saved until you press OK.')).toBeVisible()

    // the imported row is in the form, alongside those that were already there (merge by id, not replacement)
    await page.getByRole('tab', { name: 'Marketplaces' }).click()
    expect(await formHasValue(page, IMPORTED_LABEL)).toBe(true)
    expect(await formHasValue(page, 'https://example.invalid/manifest.json')).toBe(true)

    // Cancel: none of this must have reached the back end
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 })

    await openSettings(page)
    await page.getByRole('tab', { name: 'Marketplaces' }).click()
    expect(await formHasValue(page, IMPORTED_LABEL)).toBe(false)

    // and the user's other marketplaces are still where they were
    const after = await exportSettings(page, false)
    expect((after.settings.marketplaces ?? []).length).toBe(marketplacesBefore)

    await dismissOpenDialogs(page)
})

test('Kwirth settings: el export se lleva SOLO lo marcado', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await openSettings(page)

    // untick everything and keep the interval: the file must carry neither marketplaces nor registries
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

    // precisely the new marketplace is unticked, the rest goes in
    await importDialog.locator('label').filter({ hasText: IMPORTED_LABEL }).getByRole('checkbox').uncheck()
    await importDialog.getByRole('button', { name: 'Import' }).click()
    await expect(page.getByText('Nothing is saved until you press OK.')).toBeVisible()

    await page.getByRole('tab', { name: 'Marketplaces' }).click()
    expect(await formHasValue(page, IMPORTED_LABEL)).toBe(false)

    await dismissOpenDialogs(page)
})
