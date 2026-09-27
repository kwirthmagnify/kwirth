import { test, expect } from '@playwright/test'
import { login, clickMenuItem, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

// Verifies that every core dialog carrying a HelpButton invokes window.open (a popup) with the right
// deep link to its section of the guide. window.open is intercepted so the test does not depend on the
// guide's server being up, and so the contract is verified exactly:
//   1) pressing 'help' invokes window.open,
//   2) with the deep-link URL (…/#/<section>?id=<anchor>), and
//   3) with POPUP features and a stable target of 'kwirth-guide'.

interface IHelpOpen { url: string; target: string; features: string }

type OpenFn = () => Promise<void>

interface ICase {
    label: string
    open: OpenFn
    section: string
}

test('help button: dialogs del menú principal invocan window.open en su sección de la guía', async ({ page }) => {
    await login(page)

    // Close any dialog auto-opened at login (an admin profile's auto-start channel, for instance)
    await dismissOpenDialogs(page)

    await page.evaluate(() => {
        ;(window as unknown as { __helpOpens: IHelpOpen[] }).__helpOpens = []
        window.open = ((url?: string | URL, target?: string, features?: string) => {
            ;(window as unknown as { __helpOpens: IHelpOpen[] }).__helpOpens.push({
                url: String(url ?? ''), target: String(target ?? ''), features: String(features ?? '')
            })
            return null
        }) as typeof window.open
    })

    const readOpens = () => page.evaluate(() => (window as unknown as { __helpOpens: IHelpOpen[] }).__helpOpens)

    const CASES: ICase[] = [
        { label: 'User settings',        open: () => clickMenuItem(page, 'User settings'),        section: 'guide/admin/02-initial-config?id=user-settings-personal' },
        { label: 'Kwirth settings',      open: () => clickMenuItem(page, 'Kwirth settings'),      section: 'guide/admin/02-initial-config?id=kwirth-settings' },
        { label: 'Manage cluster list',  open: () => clickMenuItem(page, 'Manage cluster list'),  section: 'guide/admin/06-cluster-management?id=add-a-remote-cluster' },
        { label: 'API Security',         open: () => clickMenuItem(page, 'API Security'),         section: 'guide/admin/05-api-management?id=create-an-api-key' },
        { label: 'User security',        open: () => clickMenuItem(page, 'User security'),        section: 'guide/admin/03-user-management?id=user-fields' },
        { label: 'Plugins',              open: () => clickExtensionMenuItem(page, 'Plugins'),              section: 'guide/extensions/plugins/index?id=managing-channel-plugins' },
        { label: 'Providers',            open: () => clickExtensionMenuItem(page, 'Providers'),            section: 'guide/extensions/providers/index?id=managing-configuring-providers' },
        { label: 'Senders',              open: () => clickExtensionMenuItem(page, 'Senders'),              section: 'guide/extensions/senders/index?id=managing-configuring-senders' },
        { label: 'Themes',               open: () => clickExtensionMenuItem(page, 'Themes'),               section: 'guide/extensions/themes/index?id=admin-guide' },
        { label: 'Homepages',            open: () => clickExtensionMenuItem(page, 'Homepages'),            section: 'guide/extensions/homepages/index?id=admin-guide' },
        { label: 'Identity providers',   open: () => clickExtensionMenuItem(page, 'Identity providers'),   section: 'guide/admin/07-idp-integration?id=enabling-an-idp' },
        { label: 'Documentation',        open: () => clickExtensionMenuItem(page, 'Documentation'),        section: 'guide/extensions/docs/index?id=admin-guide' },
    ]

    for (const c of CASES) {
        await c.open()
        const d = page.getByRole('dialog')
        await expect(d.getByRole('button', { name: 'help' })).toBeVisible()

        const before = (await readOpens()).length
        await d.getByRole('button', { name: 'help' }).click()
        await expect.poll(async () => (await readOpens()).length, { timeout: 5_000 }).toBeGreaterThan(before)

        const last = (await readOpens()).at(-1)!
        expect(last.url,      `${c.label} → sección correcta`).toContain(c.section)
        expect(last.url,      `${c.label} → deep-link por hash`).toContain('/#/')
        expect(last.features, `${c.label} → popup (no pestaña)`).toContain('popup=yes')
        expect(last.target,   `${c.label} → ventana estable`).toBe('kwirth-guide')

        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
    }

    // Navigate to blank to release the WebSocket before the teardown (it stops Playwright hanging on the SPA)
    await page.goto('about:blank')
})

// The manager had help, but the dialog where the extension is really configured — which is where the
// doubt arises — did not. It is checked on senders, which is where it was spotted.
test('help button: el dialogo de configuracion de un sender tambien lleva ayuda', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    await page.evaluate(() => {
        ;(window as unknown as { __helpOpens: IHelpOpen[] }).__helpOpens = []
        window.open = ((url?: string | URL, target?: string, features?: string) => {
            ;(window as unknown as { __helpOpens: IHelpOpen[] }).__helpOpens.push({
                url: String(url ?? ''), target: String(target ?? ''), features: String(features ?? '')
            })
            return null
        }) as typeof window.open
    })
    const readOpens = () => page.evaluate(() => (window as unknown as { __helpOpens: IHelpOpen[] }).__helpOpens)

    await clickExtensionMenuItem(page, 'Senders')
    const manager = page.getByRole('dialog').filter({ hasText: 'Manage senders' })
    await manager.waitFor()

    // the first installed sender's gear opens its configuration dialog
    const gear = manager.getByRole('button', { name: 'Configure' }).first()
    test.skip(await gear.count() === 0, 'no hay ningun sender instalado que configurar')
    await gear.click()

    const config = page.getByRole('dialog').filter({ hasText: /^Configure:/ })
    await config.waitFor({ timeout: 10_000 })

    const help = config.getByRole('button', { name: 'help' })
    await expect(help, 'el dialogo de configuracion debe llevar ayuda').toBeVisible()

    const before = (await readOpens()).length
    await help.click()
    await expect.poll(async () => (await readOpens()).length, { timeout: 5_000 }).toBeGreaterThan(before)

    // All that is checked here is that the dialog CARRIES help and that it points at the senders guide.
    // Which page exactly depends on the sender: ever since each one links its own reference, demanding
    // the general page made this test pass or fail depending on which sender happened to be installed
    // first — it looked flaky and it was a stale assertion. Both branches — its own page and the fallback
    // to the general one — are covered by sender-help.spec.ts, which forces them on purpose.
    const last = (await readOpens()).at(-1)!
    expect(last.url).toContain('guide/extensions/senders/')
    expect(last.url).toContain('/#/')
    expect(last.target).toBe('kwirth-guide')

    await page.goto('about:blank')
})
