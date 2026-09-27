import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs, GUIDE_MEDIA, capturePedida } from './helpers'

// Regenerates the screenshots of the extension management dialogs for the guide (docs/_media/guide).
// Ejecutar a mano: playwright test capture-managers.spec.ts
//
// ─── WHY IT DISABLES THE PRIVATE MARKETPLACES ────────────────────────────────────────────────────
// The guide is PUBLIC and the development environment's catalogue carries the paid extensions served by
// the organisation's private marketplace. Publishing them in open documentation would be leaking the
// commercial catalogue. They are disabled for as long as the capture lasts — not deleted — and the
// literal snapshot is restored at the end, whatever happens.
//
// Besides, that way the images show what a freshly installed Kwirth sees, which is what the guide talks about.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// The screenshots go to the LIVE documentation, and CAPTURE_ONLY allows asking for just one: see helpers.ts.
const MEDIA = GUIDE_MEDIA
const pedida = capturePedida

interface ISession { auth: string; backend: string }

/** Each manager, with its menu entry's name, its dialog's title and the destination file. */
const MANAGERS: { menu: string, title: RegExp, file: string }[] = [
    { menu: 'Plugins',        title: /Manage channel plugins/i, file: 'admin-plugins-manage.png' },
    { menu: 'Providers',      title: /Manage providers/i,   file: 'manage-providers.png' },
    { menu: 'Senders',        title: /Manage senders/i,     file: 'manage-senders.png' },
    { menu: 'Themes',         title: /Manage themes/i,      file: 'manage-themes.png' },
    { menu: 'Homepages',      title: /Manage homepages/i,   file: 'manage-homepages.png' },
    { menu: 'Identity providers', title: /identity provider/i, file: 'manage-idps.png' },
    // The only one served by the GENERIC manager (ExtensionManagerDialog): the screenshot shows the UI is
    // the same as everybody else's, which is exactly what the guide promises.
    { menu: 'AI toolsets',    title: /Manage AI toolsets/i, file: 'manage-aitoolsets.png' }
]

/*
    CUSTOMER names that cannot appear in a PUBLIC guide. The development environment has extensions made
    for particular customers installed (a theme with their brand, for instance), and they came out with
    their name in the published images. They are not uninstalled — the environment is the user's and
    uninstalling would be destructive —: they are relabelled in the DOM right before firing the capture,
    just as Agora's captures do with the real cluster names. The image stays faithful to what the product
    does; the only thing that changes is who the example belongs to.
*/
const RELABEL: Record<string, string> = { Santander: 'Acme Bank' }

/** Replaces, in the document's TEXT nodes, each customer name with its demo alias. */
const relabelCustomers = (pairs: Record<string, string>) => {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (tw.nextNode()) nodes.push(tw.currentNode as Text)
    for (const n of nodes) {
        let v = n.nodeValue ?? ''
        for (const [real, alias] of Object.entries(pairs)) v = v.split(real).join(alias)
        if (v !== n.nodeValue) n.nodeValue = v
    }
}

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

const readSettings = (page: Page, s: ISession) => page.evaluate(async ([b, a]) =>
    await (await fetch(`${b}/core/settings`, { headers: { Authorization: a } })).json(), [s.backend, s.auth])

const writeMarketplaces = (page: Page, s: ISession, marketplaces: unknown) => page.evaluate(async ([b, a, m]) => {
    await fetch(`${b}/core/settings`, {
        method: 'PUT',
        headers: { Authorization: a as string, 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplaces: m })
    })
}, [s.backend, s.auth, marketplaces] as [string, string, unknown])

test('capture manager dialogs (dark, solo catalogo publico)', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    const s = await captureSession(page)

    const original = (await readSettings(page, s)).marketplaces ?? []
    const privatesOff = (original as Record<string, unknown>[]).map(m => ({ ...m, enabled: false }))

    try {
        // No reload is needed: each dialog asks for its catalogue on opening, and a disabled marketplace
        // is excluded from the resolution on the back end.
        if (privatesOff.length) await writeMarketplaces(page, s, privatesOff)

        // The families menu, which is the first image of "Extending kwirth". It is regenerated here
        // because EVERY new extension type changes it, and done by hand it went stale with nobody
        // noticing: the one that was there did not even have the `aitoolset` type.
        if (pedida('admin-manage-extensions.png')) {
            await dismissOpenDialogs(page)
            await page.locator('header button').first().click({ force: true })
            await page.getByRole('menuitem', { name: /Manage extensions/i }).click()
            await page.waitForTimeout(600)
            await page.screenshot({ path: `${MEDIA}/admin-manage-extensions.png` })
            await page.keyboard.press('Escape')
            await page.waitForTimeout(400)
        }

        for (const m of MANAGERS.filter(x => pedida(x.file))) {
            await clickExtensionMenuItem(page, m.menu)
            const dialog = page.getByRole('dialog').filter({ hasText: m.title })
            await dialog.waitFor({ timeout: 10000 })
            // give it time to resolve the catalogue: otherwise the spinner is captured
            await page.waitForTimeout(2500)
            await page.evaluate(relabelCustomers, RELABEL)
            await dialog.screenshot({ path: `${MEDIA}/${m.file}` })

            // the list view goes to the guide too: it is the half of the screen that drifted the most
            const listToggle = dialog.getByRole('button', { name: /list view/i }).first()
            if (await listToggle.count() > 0) {
                await listToggle.click()
                // The pointer stays over the button and MUI ends up drawing its tooltip ('List view') ON
                // TOP of the screenshot. The mouse is moved away and given time to vanish before shooting.
                await page.mouse.move(0, 0)
                await page.waitForTimeout(1200)
                // Again: switching views remounts the rows with the real names.
                await page.evaluate(relabelCustomers, RELABEL)
                await dialog.screenshot({ path: `${MEDIA}/${m.file.replace('.png', '-list.png')}` })
            }
            await dismissOpenDialogs(page)
        }
    }
    finally {
        if (privatesOff.length) await writeMarketplaces(page, s, original)
    }

    // the environment is left as it was: the marketplaces come back with their original enabled flag
    const restored = (await readSettings(page, s)).marketplaces ?? []
    expect(JSON.stringify(restored)).toBe(JSON.stringify(original))
})
