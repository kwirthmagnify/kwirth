import { test, expect } from '@playwright/test'
import { login, clickMenuItem, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

// Verifica que cada dialog del core que lleva HelpButton invoca window.open (popup) con el deep-link
// correcto a su sección de la guía. Se intercepta window.open para que el test no dependa de que el
// servidor de la guía esté levantado, y para verificar exactamente el contrato:
//   1) al pulsar 'help' se invoca window.open,
//   2) con la URL de deep-link (…/#/<section>?id=<anchor>), y
//   3) con features de POPUP y target estable 'kwirth-guide'.

interface IHelpOpen { url: string; target: string; features: string }

type OpenFn = () => Promise<void>

interface ICase {
    label: string
    open: OpenFn
    section: string
}

test('help button: dialogs del menú principal invocan window.open en su sección de la guía', async ({ page }) => {
    await login(page)

    // Cerrar cualquier dialog auto-abierto al login (ej. auto-start channel del perfil admin)
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
        { label: 'Cluster Settings',     open: () => clickMenuItem(page, 'Cluster Settings'),     section: 'guide/admin/02-initial-config?id=cluster-settings' },
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

    // Navegar a blank para liberar el WebSocket antes del teardown (evita cuelgue de Playwright en SPA)
    await page.goto('about:blank')
})
