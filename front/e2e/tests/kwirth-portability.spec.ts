import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

/*
    Kwirth portability: the configuration bundle, from its own dialog.

    It replaces 'kwirth-settings-portability', which tested the export/import that used to hang off the
    settings dialog with a second format of its own. That format is gone — the bundle does the same and
    also carries what the EXTENSIONS store — and the operation now lives in two dialogs of its own, each
    with its menu entry: 'Kwirth export' and 'Kwirth import' (it was a single 'Kwirth portability' dialog
    for a while, which is what these tests went on looking for after it was split).

    NON destructive by construction: it exports (which only downloads) and it opens the import to see the
    PREVIEW, which applies nothing. Import is never pressed: doing so would write configuration over the
    user's Kwirth. The last test checks that nothing was persisted.
*/

const INTERVAL_LABEL = 'Cluster metrics read interval (seconds)'

interface IBundle {
    kind: string
    formatVersion: number
    meta: { includesCredentials: boolean, kwirthVersion: string }
    core: {
        settings?: {
            metricsInterval?: number
            log?: { levels?: Record<string, string>, ansi?: boolean }
            marketplaces?: { id: string, manifestAuth?: { token?: string } }[]
            packageRegistries?: { id: string, auth?: { token?: string, password?: string } }[]
        }
        sharedAi?: unknown
    }
    extensions: { type: string, id: string }[]
}

const openExport = async (page: Page) => {
    await clickMenuItem(page, 'Kwirth export')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth export' })
    await expect(dialog).toBeVisible()
    // wait until it has read what can be exported: otherwise the spinner is what gets clicked. The list comes
    // in collapsed blocks (Kwirth, Plugins, Providers…), and the 'Kwirth' block only shows once it has loaded
    await expect(dialog.getByRole('checkbox', { name: 'Kwirth', exact: true })).toBeVisible({ timeout: 15000 })
    return dialog
}

/*
    The dialog's own Close, in its actions. After exporting, the result Alert brings an X that is ALSO
    named 'Close', so a page-wide lookup finds two and strict mode waits for ever.
*/
const closeExport = async (page: Page) => {
    await page.getByRole('dialog').filter({ hasText: 'Kwirth export' })
        .locator('.MuiDialogActions-root').getByRole('button', { name: 'Close', exact: true }).click()
}

const exportBundle = async (page: Page, withCredentials: boolean): Promise<IBundle> => {
    const dialog = await openExport(page)
    if (withCredentials) await dialog.getByLabel(/Include credentials/).check()
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Export', exact: true }).click()
    const file = await download
    const path = await file.path()
    return JSON.parse(readFileSync(path!, 'utf8')) as IBundle
}

test('el export baja un bundle con la forma del contrato', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    const bundle = await exportBundle(page, false)

    expect(bundle.kind).toBe('kwirth-config-bundle')
    expect(bundle.formatVersion).toBe(1)
    expect(bundle.meta.kwirthVersion.length).toBeGreaterThan(0)
    expect(Array.isArray(bundle.extensions)).toBe(true)

    await closeExport(page)
    await dismissOpenDialogs(page)
})

test('🔴 la configuracion del LOG viaja dentro del bundle', async ({ page }) => {
    /*
        It is what makes the log settings portable, and it comes for free — the core exports IKwirthSettings
        whole — which is exactly why it is worth pinning down: nobody would notice it stopping to travel
        until they imported a file and found their levels back at the defaults.
    */
    await login(page)
    await dismissOpenDialogs(page)

    const bundle = await exportBundle(page, false)

    expect(bundle.core.settings).toBeDefined()
    const levels = bundle.core.settings?.log?.levels ?? {}
    // The six components come out, because the back end answers with what is IN FORCE and not with what
    // is stored: with nothing configured, the stored value would be nothing at all.
    for (const component of ['core', 'chan', 'prov', 'send', 'auth', 'stor']) {
        expect(levels[component], `el componente '${component}' no viaja en el bundle`).toBeDefined()
    }
    expect(typeof bundle.core.settings?.log?.ansi).toBe('boolean')

    await closeExport(page)
    await dismissOpenDialogs(page)
})

test('🔴 sin marcar credenciales no viaja ni un secreto', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    const bundle = await exportBundle(page, false)

    expect(bundle.meta.includesCredentials).toBe(false)
    // Not one token and not one password in the whole file: a bundle ends up in somebody's downloads folder.
    for (const m of bundle.core.settings?.marketplaces ?? []) expect(m.manifestAuth?.token ?? '').toBe('')
    for (const r of bundle.core.settings?.packageRegistries ?? []) {
        expect(r.auth?.token ?? '').toBe('')
        expect(r.auth?.password ?? '').toBe('')
    }

    await closeExport(page)
    await dismissOpenDialogs(page)
})

test('el diálogo de settings ya NO lleva Export ni Import', async ({ page }) => {
    /*
        They were the same two buttons for two different things, and that is what made the bundle
        disappear when the old format was removed. Pinned down so nobody puts them back there.
    */
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'Kwirth settings')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
    await expect(dialog.getByLabel(INTERVAL_LABEL)).toBeEnabled({ timeout: 10000 })

    await expect(dialog.getByRole('button', { name: 'Export' })).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Import' })).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})
