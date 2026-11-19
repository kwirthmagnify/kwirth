import { Page, Locator } from '@playwright/test'
import { readFileSync } from 'fs'
import { test, expect } from './fixtures'
import { clickMenuItem, dismissOpenDialogs, CARGA } from './helpers'

/*
    Kwirth settings → Portability (plans/config-merge): merging configuration files.

    Two in-memory files (made-up values, no real secrets). What is checked: the sources are shown in merge
    order (#1, #2) and the order can be changed; only what DIFFERS is asked, saying which field differs; the
    download unlocks when every difference has a source; the downloaded file carries what was chosen, with
    the list elements in merge order.

    NON destructive: merging writes nothing to this Kwirth. 'Add this Kwirth' only READS its export
    (without credentials), and the dialog is closed with Cancel, never OK.
*/

const bundle = (name: string, metricsInterval: number, url: string, extra: Record<string, unknown>) => ({
    kind: 'kwirth-config-bundle',
    formatVersion: 2,
    meta: { exportedAt: '2026-11-01T00:00:00.000Z', kwirthVersion: '0.6.0', source: name, includesCredentials: false },
    core: {
        settings: {
            metricsInterval,
            marketplaces: [{ id: 'e2e-shared', url: 'https://shared.example', label: 'shared', enabled: true }, { id: 'e2e-acme', url, label: 'acme', enabled: true }],
            ...extra
        }
    },
    extensions: [{ type: 'plugin', id: 'e2e-merge', version: '1.0.0', config: { from: name } }]
})

const FILE_A = bundle('a', 15, 'https://a.example', { packageRegistries: [{ id: 'e2e-only-a', url: 'https://r.example', label: 'r', enabled: true }] })
const FILE_B = bundle('b', 30, 'https://b.example', {})

const file = (name: string, content: unknown) => ({ name, mimeType: 'application/json', buffer: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content)) })

const openPortability = async (page: Page): Promise<Locator> => {
    await clickMenuItem(page, 'Kwirth settings')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
    await expect(dialog.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: CARGA })
    await dialog.getByRole('tab', { name: 'Portability' }).click()
    return dialog
}

const cancel = async (dialog: Locator) => {
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
}

test.describe.serial('Kwirth settings: Portability (merge)', () => {
let page: Page

test.beforeAll(async ({ kwirth }) => {
    page = kwirth
    await dismissOpenDialogs(page)
})

test.afterAll(async () => { await dismissOpenDialogs(page).catch(() => {}) })

test('two files: merge order on screen, only the differences are asked, the file carries the choices', async () => {
    const dialog = await openPortability(page)
    const download = dialog.getByRole('button', { name: 'Download merged file' })
    await expect(download).toBeDisabled()

    await dialog.getByTestId('portability-file-input').setInputFiles([file('a.json', FILE_A), file('b.json', FILE_B)])
    const sources = dialog.getByTestId('portability-sources')
    await expect(sources).toContainText('#1a.json')
    await expect(sources).toContainText('#2b.json')

    // metricsInterval, the acme marketplace and the extension differ; the shared marketplace and the registry do not
    await expect(dialog.getByTestId('portability-status')).toContainText('3 elements differ between sources')
    await expect(dialog.getByTestId('portability-status')).toContainText('3 left to choose')
    await expect(dialog.getByTestId('portability-diff-settings.metricsInterval')).toContainText('different value')
    await expect(dialog.getByTestId('portability-diff-settings.marketplaces[e2e-acme]')).toContainText('differs in: url')
    await expect(dialog.getByTestId('portability-diff-extensions[plugin/e2e-merge]')).toContainText('differs in: config')
    await expect(download).toBeDisabled()

    // b goes first: the order is the user's and it is what the list elements follow
    await dialog.getByRole('button', { name: 'Move b.json up' }).click()
    await expect(sources).toContainText('#1b.json')
    await expect(sources).toContainText('#2a.json')

    await dialog.getByRole('radio', { name: 'Apply b.json for metricsInterval' }).check()
    await dialog.getByRole('radio', { name: 'Apply a.json for e2e-acme' }).check()
    await expect(dialog.getByTestId('portability-status')).toContainText('1 left to choose')
    await expect(download).toBeDisabled()
    await dialog.getByRole('radio', { name: 'Apply a.json for plugin/e2e-merge' }).check()
    await expect(dialog.getByTestId('portability-status')).toContainText('All 3 differences decided')
    await expect(download).toBeEnabled()

    const [dl] = await Promise.all([page.waitForEvent('download'), download.click()])
    expect(dl.suggestedFilename()).toMatch(/^kwirth-config-merged-\d{4}-\d{2}-\d{2}\.json$/)
    const merged = JSON.parse(readFileSync(await dl.path(), 'utf8'))
    expect(merged.kind).toBe('kwirth-config-bundle')
    expect(merged.formatVersion).toBe(2)
    expect(merged.meta.source).toBe('merge of: b.json, a.json')
    expect(merged.meta.includesCredentials).toBe(false)
    expect(merged.core.settings.metricsInterval).toBe(30)
    expect(merged.core.settings.marketplaces).toEqual([
        { id: 'e2e-shared', url: 'https://shared.example', label: 'shared', enabled: true },
        { id: 'e2e-acme', url: 'https://a.example', label: 'acme', enabled: true }
    ])
    expect(merged.core.settings.packageRegistries).toEqual([{ id: 'e2e-only-a', url: 'https://r.example', label: 'r', enabled: true }])
    expect(merged.extensions).toEqual([{ type: 'plugin', id: 'e2e-merge', version: '1.0.0', config: { from: 'a' } }])

    // removing a source re-analyses: with only b there is nothing to decide
    await dialog.getByRole('button', { name: 'Remove a.json' }).click()
    await expect(dialog.getByTestId('portability-status')).toContainText('Nothing to decide')
    await expect(download).toBeEnabled()
    await cancel(dialog)
})

test('a file that is not a Kwirth bundle is rejected with the reason and does not enter the list', async () => {
    const dialog = await openPortability(page)
    await dialog.getByTestId('portability-file-input').setInputFiles([file('other.json', { hello: 1 }), file('broken.json', '{')])
    await expect(dialog.getByTestId('portability-message')).toContainText('other.json: not a Kwirth configuration bundle')
    await expect(dialog.getByTestId('portability-message')).toContainText('broken.json: not valid JSON')
    await expect(dialog.getByTestId('portability-sources')).toContainText('No sources yet')
    await cancel(dialog)
})

/*
    🔴 The case that came up in QA: a file exported WITH credentials against this Kwirth added WITHOUT them. The
    export blanks every secret ('' or the field absent), and compared as it was every element with a secret came
    out as a difference. It is the same configuration: there must be nothing to decide.
*/
test('🔴 the same configuration with and without credentials has nothing to decide', async () => {
    // the file: this Kwirth exported WITH credentials, through Kwirth export (which only downloads)
    await clickMenuItem(page, 'Kwirth export')
    const exportDialog = page.getByRole('dialog').filter({ hasText: 'Kwirth export' })
    await expect(exportDialog.getByRole('checkbox', { name: 'Kwirth', exact: true })).toBeVisible({ timeout: CARGA })
    await exportDialog.getByLabel(/Include credentials/).check()
    const [exported] = await Promise.all([page.waitForEvent('download'), exportDialog.getByRole('button', { name: 'Export', exact: true }).click()])
    const content = readFileSync(await exported.path(), 'utf8')
    await exportDialog.locator('.MuiDialogActions-root').getByRole('button', { name: 'Close', exact: true }).click({ timeout: CARGA })
    await dismissOpenDialogs(page)

    const dialog = await openPortability(page)
    await dialog.getByTestId('portability-file-input').setInputFiles([file('with-credentials.json', content)])
    await expect(dialog.getByRole('checkbox', { name: 'Include credentials' })).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Add this Kwirth' }).click()
    await expect(dialog.getByTestId('portability-sources')).toContainText('#2This Kwirth', { timeout: CARGA })
    await expect(dialog.getByTestId('portability-status')).toContainText('Nothing to decide')
    await cancel(dialog)
})

test("'Add this Kwirth' reads the current configuration as one more source, without credentials by default", async () => {
    const dialog = await openPortability(page)
    await expect(dialog.getByRole('checkbox', { name: 'Include credentials' })).not.toBeChecked()
    await dialog.getByRole('button', { name: 'Add this Kwirth' }).click()
    const sources = dialog.getByTestId('portability-sources')
    await expect(sources).toContainText('#1This Kwirth', { timeout: CARGA })
    await expect(sources).toContainText('no credentials')
    await expect(dialog.getByRole('button', { name: 'Add this Kwirth' })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Download merged file' })).toBeEnabled()
    await cancel(dialog)
})
})
