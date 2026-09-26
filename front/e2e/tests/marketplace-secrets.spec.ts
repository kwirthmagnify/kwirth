import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// Verifies the agreed UX for a marketplace's secret field: the stored value COMES BACK to the form
// already filled in and masked, and the eye reveals it. Before, the back end only said whether it
// existed (hasPassword/hasToken), the field came out empty labelled 'already set' and the eye showed
// nothing.
//
// ─── WHY THIS TEST IS SO SUSPICIOUS ──────────────────────────────────────────────────────────────
// An earlier version wrote its test token OVER the user's real marketplace and left their private
// catalogue unauthenticated for a while.
//
// The cause: getByLabel matches by SUBSTRING, not by equality. 'Token' also matches the 'Manifest needs
// a token' checkbox, which comes BEFORE the field in the DOM, so with N rows there are 2N matches and
// the per-row .nth(i) points at something else: with one saved row and one new one, .nth(1) is the
// FIRST row's Token field. Hence the test token ending up in the user's marketplace.
//
// That is why now, and it has to stay this way:
//   1. ALL getByLabel calls carry { exact: true } — without that the per-row indices mean nothing;
//   2. a COMPLETE snapshot of the settings through the API before touching anything, and a literal
//      restoration at the end;
//   3. nothing is written into a row until it is checked to be EMPTY (a row with data is not the new one);
//   4. it is explicitly asserted that the pre-existing rows come out intact, right after saving.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const TEST_LABEL = 'e2e-secret-check'
const TEST_URL = 'https://e2e-secret-check.invalid/manifest.json'
// A marketplace now stores ONLY the manifest's token. The credential for downloading the package moved
// to the package registries, because manifest and packages are different servers: it is covered by
// package-registries.spec.ts.
const TEST_TOKEN = 'glpat-e2e-t0ken'

/** Kwirth's DOM is shared: unscoped to the dialog, getByLabel reaches workspaces and tabs. */
const dlg = (page: Page) => page.locator('[role="dialog"]').last()

interface ISession { auth: string; backend: string }

async function captureSession(page: Page): Promise<ISession> {
    const found: ISession = { auth: '', backend: '' }
    page.on('request', req => {
        const h = req.headers()['authorization']
        if (h && !found.auth && req.url().includes('/config/')) {
            found.auth = h
            found.backend = new URL(req.url()).origin
        }
    })
    await login(page)
    await dismissOpenDialogs(page)
    await expect.poll(() => found.auth, { timeout: 15000 }).not.toBe('')
    return found
}

/** The settings exactly as the back end serves them, secrets included. Used for snapshot and restoration. */
async function readSettings(page: Page, s: ISession): Promise<Record<string, unknown>> {
    return await page.evaluate(async ([backend, a]) =>
        await (await fetch(`${backend}/core/settings`, { headers: { Authorization: a } })).json(),
    [s.backend, s.auth])
}

async function writeMarketplaces(page: Page, s: ISession, marketplaces: unknown): Promise<void> {
    await page.evaluate(async ([backend, a, mkps]) => {
        await fetch(`${backend}/core/settings`, {
            method: 'PUT',
            headers: { Authorization: a as string, 'Content-Type': 'application/json' },
            body: JSON.stringify({ marketplaces: mkps })
        })
    }, [s.backend, s.auth, marketplaces] as [string, string, unknown])
}

/** A comparable fingerprint of a marketplace, to detect whether the test touched anything of it. */
const fingerprint = (m: Record<string, any>) =>
    JSON.stringify({ id: m.id, label: m.label, url: m.url, enabled: m.enabled, auth: m.auth, manifestAuth: m.manifestAuth })

async function openMarketplaces(page: Page) {
    await clickMenuItem(page, 'Kwirth Settings')
    await expect(dlg(page).getByLabel('Cluster metrics read interval (seconds)', { exact: true })).toBeEnabled({ timeout: 10000 })
    await page.getByRole('tab', { name: 'Marketplaces' }).click()
}

async function saveSettings(page: Page) {
    const ok = page.getByRole('button', { name: 'OK' })
    await expect(ok).toBeEnabled()
    await ok.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 10000 })
}

// Each row contributes exactly one field per label, so the index of 'Name' identifies the row.
async function rowIndexOf(page: Page, label: string): Promise<number> {
    const names = dlg(page).getByLabel('Name', { exact: true })
    for (let i = 0; i < await names.count(); i++) {
        if (await names.nth(i).inputValue() === label) return i
    }
    return -1
}

test('el secreto de un marketplace vuelve relleno y enmascarado, y el ojo lo revela', async ({ page }) => {
    const s = await captureSession(page)

    // SNAPSHOT: what was there before touching anything. It is restored literally in the finally.
    const original = await readSettings(page, s)
    const originalMkps = (original.marketplaces ?? []) as Record<string, any>[]
    const originalPrints = originalMkps.map(fingerprint)

    try {
        // --- create the test row with its two secrets ---
        await openMarketplaces(page)

        // wait until the dialog has drawn the ALREADY saved rows before counting: counting too early
        // lands the new row's index on an existing one and overwrites it
        await expect(dlg(page).getByLabel('Manifest URL', { exact: true })).toHaveCount(originalMkps.length)

        await page.getByRole('button', { name: 'Add marketplace' }).click()
        await expect(dlg(page).getByLabel('Manifest URL', { exact: true })).toHaveCount(originalMkps.length + 1)

        const i = originalMkps.length   // la fila recien anadida es la ultima

        // GUARD: the target row has to be empty. If it carries data it is not the new one, and writing
        // there would destroy a marketplace of the user's.
        expect(await dlg(page).getByLabel('Name', { exact: true }).nth(i).inputValue(), 'la fila destino no esta vacia').toBe('')
        expect(await dlg(page).getByLabel('Manifest URL', { exact: true }).nth(i).inputValue(), 'la fila destino no esta vacia').toBe('')

        await dlg(page).getByLabel('Name', { exact: true }).nth(i).fill(TEST_LABEL)
        await dlg(page).getByLabel('Manifest URL', { exact: true }).nth(i).fill(TEST_URL)
        await dlg(page).getByLabel('Manifest needs a token', { exact: true }).nth(i).check()
        await dlg(page).getByLabel('Token', { exact: true }).nth(i).fill(TEST_TOKEN)

        await saveSettings(page)

        // --- first thing after saving: check that nothing of anybody else's was touched ---
        const afterSave = (await readSettings(page, s)).marketplaces as Record<string, any>[]
        for (const before of originalMkps) {
            const now = afterSave.find(m => m.id === before.id)
            expect(now, `el marketplace '${before.label}' ha desaparecido`).toBeTruthy()
            expect(fingerprint(now!), `el test ha modificado el marketplace '${before.label}'`).toBe(fingerprint(before))
        }

        // --- reopen: the dialog re-reads from the back end, so this is real persistence ---
        await openMarketplaces(page)
        const j = await rowIndexOf(page, TEST_LABEL)
        expect(j, 'la fila de prueba deberia haberse guardado').toBeGreaterThanOrEqual(0)

        const token = dlg(page).getByLabel('Token', { exact: true }).nth(j)

        // 1. the secret COMES BACK, filled in (the field used to come out empty)
        await expect(token).toHaveValue(TEST_TOKEN)

        // 2. y enmascarado
        await expect(token).toHaveAttribute('type', 'password')

        // 3. the eye reveals it — and without going to the back end, since there is no reveal endpoint
        // any more. The eye lives in the field's own adornment, so it is looked up from the input and
        // not by a global index: counting eyes across every row is fragile.
        const eyeOf = (field: typeof token) => field.locator('xpath=..').getByRole('button')
        const requests: string[] = []
        page.on('request', r => requests.push(r.url()))

        await eyeOf(token).click()
        await expect(token).toHaveAttribute('type', 'text')
        await expect(token).toHaveValue(TEST_TOKEN)
        expect(requests.some(u => u.includes('/secrets')), 'el ojo no debe llamar al back').toBe(false)


        // 4. y vuelve a ocultarse
        await eyeOf(token).click()
        await expect(token).toHaveAttribute('type', 'password')

        // 5. the label no longer lies with 'already set'
        await expect(dlg(page).getByLabel('Token (already set)', { exact: true })).toHaveCount(0)

        await dismissOpenDialogs(page)
    }
    finally {
        // RESTORATION: the literal snapshot is rewritten, rather than "removing my own". That way the
        // environment goes back to how it was even if the test failed halfway or touched what it should not.
        await writeMarketplaces(page, s, originalMkps)
    }

    // --- and it is checked that it was restored, fingerprint by fingerprint ---
    const restored = (await readSettings(page, s)).marketplaces as Record<string, any>[]
    expect(restored.map(fingerprint), 'los marketplaces no han quedado como estaban').toEqual(originalPrints)
})
