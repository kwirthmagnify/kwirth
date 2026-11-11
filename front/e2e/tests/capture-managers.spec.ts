import { test, expect, Page, Locator } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
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
    // Served by the GENERIC manager (ExtensionManagerDialog): the screenshot shows the UI is the same as
    // everybody else's, which is exactly what the guide promises.
    { menu: 'AI toolsets',    title: /Manage AI toolsets/i, file: 'manage-aitoolsets.png' },
    { menu: 'DCEs',           title: /Manage DCEs/i,        file: 'manage-dces.png' }
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

/*
    The AI toolset grant dialog.

    🔴 Its ROWS are the INSTALLED plugins, and the development environment has the paid ones installed:
    disabling the private marketplaces hides them from the catalogue, not from here. So the rows are
    filtered against a WHITELIST — the public plugins manifest of this repo — and every other row is taken
    out of the DOM before shooting. A whitelist and not a list of paid ids: a new paid plugin nobody added
    to a blacklist would leak; one missing from the public manifest is simply not shown.

    Nothing is saved: the dialog is opened, shot and cancelled.
*/
const GRANT_FILE = 'aitoolset-grant.png'
// A PUBLIC toolset: in the development environment K8s Ops may be a build from a private marketplace, and its
// name and badge would end up in the public guide.
const GRANT_TOOLSET = 'K8s Describe'
const PUBLIC_PLUGINS: string[] = [...new Set((JSON.parse(readFileSync(path.resolve(__dirname, '..', '..', '..', 'plugins', 'manifest.json'), 'utf-8')) as { id: string }[]).map(e => e.id))]

/** Removes from the grant table every row whose plugin is not in the whitelist. */
const keepPublicRows = (allowed: string[]) => {
    for (const sw of Array.from(document.querySelectorAll('input[role="switch"][aria-label$=" all tools"]'))) {
        const id = (sw.getAttribute('aria-label') ?? '').replace(/ all tools$/, '')
        if (!allowed.includes(id)) sw.closest('tr')?.remove()
    }
}

async function captureGrant(page: Page, manager: Locator): Promise<void> {
    // Narrowed with the INSTALLED section's filter (the first one), not by guessing the card's markup.
    // No fallback to "any toolset": the next one could be a private build.
    const filter = manager.getByPlaceholder('Filter…').first()
    await filter.fill(GRANT_TOOLSET)
    await page.waitForTimeout(400)
    const gears = manager.locator('span[aria-label="Configure"] button')
    expect(await gears.count(), `'${GRANT_TOOLSET}' no esta instalado: no hay toolset publico que capturar`).toBe(1)
    await gears.first().click()
    const grant = page.getByRole('dialog').filter({ hasText: /^Grant: / })
    await grant.waitFor({ timeout: 20000 })
    await expect(grant.getByRole('columnheader', { name: 'All', exact: true })).toBeVisible()
    await page.evaluate(keepPublicRows, PUBLIC_PLUGINS)
    await page.evaluate(relabelCustomers, RELABEL)
    await page.mouse.move(0, 0)
    await page.waitForTimeout(800)
    await grant.screenshot({ path: `${MEDIA}/${GRANT_FILE}` })
    await grant.getByRole('button', { name: 'Cancel' }).click()
    await expect(grant).toHaveCount(0)
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

        // A manager is opened when its own image is asked for OR when an image behind it is (the grant
        // dialog lives behind the AI toolsets one): asking for that one alone must not re-shoot the manager.
        const conGrant = (m: { file: string }) => m.file === 'manage-aitoolsets.png' && pedida(GRANT_FILE)
        for (const m of MANAGERS.filter(x => pedida(x.file) || conGrant(x))) {
            await clickExtensionMenuItem(page, m.menu)
            const dialog = page.getByRole('dialog').filter({ hasText: m.title })
            await dialog.waitFor({ timeout: 10000 })
            // give it time to resolve the catalogue: otherwise the spinner is captured
            await page.waitForTimeout(2500)
            await page.evaluate(relabelCustomers, RELABEL)
            if (pedida(m.file)) await dialog.screenshot({ path: `${MEDIA}/${m.file}` })

            // the list view goes to the guide too: it is the half of the screen that drifted the most
            const listToggle = dialog.getByRole('button', { name: /list view/i }).first()
            if (pedida(m.file) && await listToggle.count() > 0) {
                await listToggle.click()
                // The pointer stays over the button and MUI ends up drawing its tooltip ('List view') ON
                // TOP of the screenshot. The mouse is moved away and given time to vanish before shooting.
                await page.mouse.move(0, 0)
                await page.waitForTimeout(1200)
                // Again: switching views remounts the rows with the real names.
                await page.evaluate(relabelCustomers, RELABEL)
                await dialog.screenshot({ path: `${MEDIA}/${m.file.replace('.png', '-list.png')}` })
            }

            // The AI toolsets' GRANT dialog (plans/ai-tool-grants): plugins × tools, behind the card's ⚙.
            if (conGrant(m)) await captureGrant(page, dialog)
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
