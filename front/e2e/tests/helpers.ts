import { Page } from '@playwright/test'
import { readdirSync } from 'fs'
import path from 'path'

export const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
export const PASS = process.env.KWIRTH_E2E_PASS ?? ''

// CRA's dev server covers the page with an iframe when compilation fails. That iframe means exactly
// that: **the front end does not compile**. It is not a leftover that can be brushed aside — remove it
// and the tests carry on against a bundle that is not the one meant to be tested, and may end up green.
//
// So it aborts, and with the overlay's text, which is exactly the diagnosis needed: without it, the
// symptom is a click that does not land because "something" intercepts it.
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

/** Closes any open dialog (from auto-start or other causes). */
export async function dismissOpenDialogs(page: Page): Promise<void> {
    // Try Cancel, then OK, then Escape — in that order
    for (const name of ['CANCEL', 'OK', 'Close']) {
        const btn = page.getByRole('button', { name })
        if (await btn.count() > 0) {
            await btn.first().click({ timeout: 1000 }).catch(() => {})
            await page.waitForTimeout(400)
        }
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    // Wait until no dialog is visible any more
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
}

/** Opens the hamburger drawer using a CSS locator (it is not blocked by the backdrop's aria-hidden). */
export async function openMenu(page: Page): Promise<void> {
    // First AppBar button (the hamburger) — a CSS locator avoids the aria-hidden problem with MUI Dialog
    await page.locator('header button').first().click({ force: true })
    await page.waitForTimeout(300)
}

/** Opens the drawer and clicks a top-level item. */
export async function clickMenuItem(page: Page, label: string): Promise<void> {
    await dismissOpenDialogs(page)
    await openMenu(page)
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await page.waitForTimeout(400)
}

/** Opens the drawer, expands "Manage extensions" and clicks a sub-item. */
export async function clickExtensionMenuItem(page: Page, label: string): Promise<void> {
    await dismissOpenDialogs(page)
    await openMenu(page)
    await page.getByRole('menuitem', { name: /Manage extensions/i }).click()
    await page.waitForTimeout(200)
    await page.getByRole('menuitem', { name: label, exact: true }).click()
    await page.waitForTimeout(400)
}

// --- Comboboxes of the ADD dialog (Cluster / View / … / Channel) ------------------------------------
// The ADD dialog mounts its selects in order, and the LAST one is always the channel's (its position
// depends on the chosen view), hence pickLastCombo.
export async function pickCombo(page: Page, idx: number, option: string): Promise<void> {
    await page.getByRole('combobox').nth(idx).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByRole('option', { name: option, exact: true }).click()
    await page.waitForTimeout(400)
}

export async function pickLastCombo(page: Page, option: string): Promise<void> {
    const n = await page.getByRole('combobox').count()
    await pickCombo(page, n - 1, option)
}

/*
    ── Where the guide's screenshots go ─────────────────────────────────────────────────────────────

    To the folder of the LIVE version of the documentation, resolved the same way as in
    `back/scripts/build-docs-tgz.js`: the highest `docs/<x.y.z>`. Every capture spec had the path nailed
    to a specific version, and it aged in silence: when a new version of the documentation was published,
    the runs went on writing over the OLD one while the live guide showed old screenshots — green,
    because a capture spec checks nothing, it only writes files.
*/
const DOCS = path.resolve(__dirname, '..', '..', '..', 'docs')

/** The highest `docs/<x.y.z>` there is in the repo. */
export const liveDocsVersion = (): string =>
    readdirSync(DOCS, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d+\.\d+\.\d+$/.test(d.name))
        .map(d => d.name)
        .sort((a, b) => {
            const pa = a.split('.').map(Number)
            const pb = b.split('.').map(Number)
            return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2]
        })
        .pop() ?? ''

/** Image folder of the live guide. Forward slashes: it is interpolated into screenshot paths. */
export const GUIDE_MEDIA = path.join(DOCS, liveDocsVersion(), '_media', 'guide').replace(/\\/g, '/')

/*
    Regenerating ONE screenshot without dragging the rest along: `CAPTURE_ONLY=aitoolsets`. Without the
    variable they are all regenerated, as always. It is needed because a normal closing changes a single
    screen, and redoing a handful of images to update one leaves diffs nobody has looked at.
*/
const ONLY = process.env.CAPTURE_ONLY ?? ''
export const capturePedida = (file: string): boolean => !ONLY || file.includes(ONLY)
