import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'
import { readdirSync } from 'fs'
import path from 'path'

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

/*
    Las capturas van a la carpeta de la version VIVA de la documentacion, resuelta igual que en
    `back/scripts/build-docs-tgz.js`: la `docs/<x.y.z>` mas alta. Estuvo fija a una version concreta y
    envejecio en silencio — se seguian regenerando imagenes sobre la documentacion ANTIGUA mientras la
    guia viva enseñaba capturas viejas, y nadie se enteraba porque el spec pasaba en verde.
*/
const DOCS = path.resolve(__dirname, '..', '..', '..', 'docs')
const liveDocsVersion = (): string =>
    readdirSync(DOCS, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d+\.\d+\.\d+$/.test(d.name))
        .map(d => d.name)
        .sort((a, b) => {
            const pa = a.split('.').map(Number)
            const pb = b.split('.').map(Number)
            return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2]
        })
        .pop() ?? ""

const MEDIA = path.join(DOCS, liveDocsVersion(), '_media', 'guide').replace(/\\/g, '/')

/*
    Regenerar UNA captura sin arrastrar las demas: `CAPTURE_ONLY=aitoolsets`. Sin la variable se
    regeneran todas, como siempre. Hace falta porque un cierre normal cambia una sola pantalla, y
    rehacer siete imagenes para actualizar una deja seis diffs que nadie ha mirado.
*/
const ONLY = process.env.CAPTURE_ONLY ?? ''
const pedida = (file: string): boolean => !ONLY || file.includes(ONLY)

interface ISession { auth: string; backend: string }

/** Cada manager, con el nombre de su entrada de menú, el título de su diálogo y el fichero destino. */
const MANAGERS: { menu: string, title: RegExp, file: string }[] = [
    { menu: 'Plugins',        title: /Manage channel plugins/i, file: 'admin-plugins-manage.png' },
    { menu: 'Providers',      title: /Manage providers/i,   file: 'manage-providers.png' },
    { menu: 'Senders',        title: /Manage senders/i,     file: 'manage-senders.png' },
    { menu: 'Themes',         title: /Manage themes/i,      file: 'manage-themes.png' },
    { menu: 'Homepages',      title: /Manage homepages/i,   file: 'manage-homepages.png' },
    { menu: 'Identity providers', title: /identity provider/i, file: 'manage-idps.png' },
    // El unico servido por el gestor GENERICO (ExtensionManagerDialog): la captura enseña que la UI es la
    // misma que la de los demas, que es justo lo que promete la guia.
    { menu: 'AI toolsets',    title: /Manage AI toolsets/i, file: 'manage-aitoolsets.png' }
]

/*
    Nombres de CLIENTE que no pueden aparecer en una guía PÚBLICA. El entorno de desarrollo tiene instaladas
    extensiones hechas para clientes concretos (un tema con su marca, por ejemplo), y salían con su nombre en
    las imágenes publicadas. No se desinstalan — el entorno es del usuario y desinstalar sería destructivo —:
    se reetiquetan en el DOM justo antes de disparar la captura, igual que las capturas de Agora hacen con los
    nombres de cluster reales. La imagen sigue siendo fiel a lo que hace el producto; lo único que cambia es a
    quién pertenece el ejemplo.
*/
const RELABEL: Record<string, string> = { Santander: 'Acme Bank' }

/** Reemplaza, en los nodos de TEXTO del documento, cada nombre de cliente por su alias de demo. */
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
        // No hace falta recargar: cada diálogo pide su catálogo al abrirse, y un marketplace
        // deshabilitado se excluye de la resolución en el back.
        if (privatesOff.length) await writeMarketplaces(page, s, privatesOff)

        // El menu de familias, que es la primera imagen de "Extending kwirth". Se regenera aqui porque
        // CADA tipo de extension nuevo lo cambia, y hecha a mano se quedaba vieja sin que nadie lo notara:
        // la que habia no tenia ni el tipo `aitoolset`.
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
            // dar tiempo a que resuelva el catalogo: si no, se captura el spinner
            await page.waitForTimeout(2500)
            await page.evaluate(relabelCustomers, RELABEL)
            await dialog.screenshot({ path: `${MEDIA}/${m.file}` })

            // la vista de lista tambien va a la guia: es la mitad de la pantalla que mas derivaba
            const listToggle = dialog.getByRole('button', { name: /list view/i }).first()
            if (await listToggle.count() > 0) {
                await listToggle.click()
                // El puntero se queda sobre el boton y MUI acaba pintando su tooltip ('List view') ENCIMA
                // de la captura. Se aparta el raton y se le da tiempo a desaparecer antes de disparar.
                await page.mouse.move(0, 0)
                await page.waitForTimeout(1200)
                // Otra vez: cambiar de vista vuelve a montar las filas con los nombres reales.
                await page.evaluate(relabelCustomers, RELABEL)
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
