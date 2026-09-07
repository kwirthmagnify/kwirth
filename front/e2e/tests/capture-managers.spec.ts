import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

// Regenera las capturas de los diálogos de gestión de extensiones para la guía (docs/_media/guide).
// Ejecutar a mano: playwright test capture-managers.spec.ts
//
// ─── POR QUE DESACTIVA LOS MARKETPLACES PRIVADOS ─────────────────────────────────────────────────
// La guía es PÚBLICA y el catálogo del entorno de desarrollo trae las extensiones de pago servidas por
// el marketplace privado de la organización. Publicarlas en la documentación abierta seria filtrar el
// catalogo comercial. Se desactivan mientras dura la captura — no se borran — y se restaura el
// snapshot literal al terminar, pase lo que pase.
//
// Ademas asi las imagenes muestran lo que ve un Kwirth recien instalado, que es de lo que habla la guia.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const MEDIA = 'C:/github/aisdkvercel/kwirth/docs/0.5.287/_media/guide'

interface ISession { auth: string; backend: string }

/** Cada manager, con el nombre de su entrada de menú, el título de su diálogo y el fichero destino. */
const MANAGERS: { menu: string, title: RegExp, file: string }[] = [
    { menu: 'Plugins',        title: /Manage plugins/i,     file: 'admin-plugins-manage.png' },
    { menu: 'Providers',      title: /Manage providers/i,   file: 'manage-providers.png' },
    { menu: 'Senders',        title: /Manage senders/i,     file: 'manage-senders.png' },
    { menu: 'Themes',         title: /Manage themes/i,      file: 'manage-themes.png' },
    { menu: 'Homepages',      title: /Manage homepages/i,   file: 'manage-homepages.png' },
    { menu: 'Identity providers', title: /identity provider/i, file: 'manage-idps.png' }
]

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
        // No hace falta recargar: cada diálogo pide su catálogo al abrirse, y un marketplace
        // deshabilitado se excluye de la resolución en el back.
        if (privatesOff.length) await writeMarketplaces(page, s, privatesOff)

        for (const m of MANAGERS) {
            await clickExtensionMenuItem(page, m.menu)
            const dialog = page.getByRole('dialog').filter({ hasText: m.title })
            await dialog.waitFor({ timeout: 10000 })
            // dar tiempo a que resuelva el catalogo: si no, se captura el spinner
            await page.waitForTimeout(2500)
            await dialog.screenshot({ path: `${MEDIA}/${m.file}` })

            // la vista de lista tambien va a la guia: es la mitad de la pantalla que mas derivaba
            const listToggle = dialog.getByRole('button', { name: /list view/i }).first()
            if (await listToggle.count() > 0) {
                await listToggle.click()
                await page.waitForTimeout(1200)
                await dialog.screenshot({ path: `${MEDIA}/${m.file.replace('.png', '-list.png')}` })
            }
            await dismissOpenDialogs(page)
        }
    }
    finally {
        if (privatesOff.length) await writeMarketplaces(page, s, original)
    }

    // el entorno queda como estaba: los marketplaces vuelven con su enabled original
    const restored = (await readSettings(page, s)).marketplaces ?? []
    expect(JSON.stringify(restored)).toBe(JSON.stringify(original))
})
