import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs, GUIDE_MEDIA } from './helpers'

// Screenshot of the guide's image for the "Marketplaces" tab (docs/_media/guide). Dark theme.
// Ejecutar a mano: playwright test capture-marketplaces.spec.ts
//
// ─── REDACCIÓN ───────────────────────────────────────────────────────────────────────────────────
// The guide is PUBLIC and the development environment has real private marketplaces: the URL of the
// organisation's repo and the credentials that open it. Before capturing, what is on screen is replaced
// with example values, typing into the form as a person would (native setter + input event, so that
// React notices) — that way the screenshot shows the real screen, not a mock-up.
//
// NON-destructive: it closes with **Cancel**, so none of this is saved. What is redacted lives only in
// the form's state for as long as the capture lasts.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// The screenshots go to the LIVE documentation: see GUIDE_MEDIA in helpers.ts.
const MEDIA = GUIDE_MEDIA

const dlg = (page: Page) => page.locator('[role="dialog"]').last()

/** Example values the real ones are replaced with, row by row. */
const SAMPLE = {
    label: 'acme-extensions',
    url: 'https://gitlab.acme.com/api/v4/projects/acme%2Fmarketplace/repository/files/manifest.json/raw?ref=main',
    manifestUser: '',
    token: 'glpat-ExampleTokenValue',
    user: 'acme-ci',
    password: 'example-password',
    // The package registry is a DIFFERENT server from the manifest: hence the screenshot showing another host.
    registryLabel: 'acme-nexus',
    registryUrl: 'https://nexus.acme.com/repository/acme-private',
    registryToken: 'example-registry-token'
}

/** Types into a React input in a way that makes the component register the change. */
async function redact(page: Page, label: string, value: string) {
    const fields = dlg(page).getByLabel(label, { exact: true })
    for (let i = 0; i < await fields.count(); i++) {
        await fields.nth(i).evaluate((el, v) => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
            setter.call(el, v)
            el.dispatchEvent(new Event('input', { bubbles: true }))
        }, value)
    }
}

test('capture marketplaces (dark, redactado)', async ({ page }) => {
    // the same framing as the rest of the guide's screenshots, so the visual rhythm is not broken
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await dismissOpenDialogs(page)

    await clickMenuItem(page, 'Kwirth Settings')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
    await dialog.waitFor()

    // wait until it has finished reading the settings: otherwise the spinner is captured
    await expect(dlg(page).getByLabel('Cluster metrics read interval (seconds)', { exact: true })).toBeEnabled({ timeout: 10000 })
    await page.getByRole('tab', { name: 'Marketplaces' }).click()
    await page.waitForTimeout(800)

    const rows = await dlg(page).getByLabel('Manifest URL', { exact: true }).count()
    test.skip(rows === 0, 'no hay ningún marketplace registrado que capturar')

    // So the image shows the complete case, the manifest token is ticked. It is an illustration, not the
    // real configuration: none of this is saved.
    const manifestToken = dlg(page).getByLabel('Manifest needs a token', { exact: true }).first()
    if (!await manifestToken.isChecked()) await manifestToken.check()
    await page.waitForTimeout(300)

    // BOTH tabs are prepared and redacted before any of them is captured. The dialog keeps the hidden
    // tab's fields in the DOM, so the real registry would still be there while the other one is
    // photographed: the leak check looks at every input, and rightly so.
    await page.getByRole('tab', { name: 'Package registries' }).click()
    await page.waitForTimeout(600)
    if (await dlg(page).getByLabel('Base URL', { exact: true }).count() === 0) {
        await dlg(page).getByRole('button', { name: 'Add registry' }).click()
        await page.waitForTimeout(300)
    }
    const needsCreds = dlg(page).getByLabel('Needs credentials', { exact: true }).first()
    if (!await needsCreds.isChecked()) await needsCreds.check()
    await page.waitForTimeout(300)
    await redact(page, 'Base URL', SAMPLE.registryUrl)

    await page.getByRole('tab', { name: 'Marketplaces' }).click()
    await page.waitForTimeout(400)

    // redact EVERYTHING identifiable before any image exists. 'Name', 'User', 'Password' and 'Token'
    // repeat across both tabs, and redact() writes into every one of their occurrences.
    await redact(page, 'Manifest URL', SAMPLE.url)
    await redact(page, 'Manifest user', SAMPLE.manifestUser)
    await redact(page, 'Name', SAMPLE.label)
    await redact(page, 'Token', SAMPLE.token)
    await redact(page, 'User', SAMPLE.user)
    await redact(page, 'Password', SAMPLE.password)
    await page.waitForTimeout(400)

    // check the redaction BEFORE capturing: if anything real survives, better to fail than to publish it
    const leaked = await dlg(page).evaluate(el =>
        Array.from(el.querySelectorAll('input')).map(i => (i as HTMLInputElement).value).join(' | '))
    expect(leaked, 'ha quedado una URL real en la captura').not.toContain('plexus')
    expect(leaked, 'ha quedado el nombre del repo privado en la captura').not.toContain('IriaOperae')
    expect(leaked, 'ha quedado un token real en la captura').not.toMatch(/glpat-(?!Example)/)

    await page.screenshot({ path: `${MEDIA}/admin-marketplaces.png` })

    // and the package registries tab, which is where the DOWNLOAD credential now lives
    await page.getByRole('tab', { name: 'Package registries' }).click()
    await page.waitForTimeout(600)
    await redact(page, 'Name', SAMPLE.registryLabel)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${MEDIA}/admin-package-registries.png` })

    // Cancel: what was redacted is NOT saved
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dismissOpenDialogs(page)
})
