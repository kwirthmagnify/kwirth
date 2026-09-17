import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migracion del gestor de `pack` al diálogo generico (plan: plans/extension-managers-ui/PLAN.md).

    El plan marcaba packs como candidato a NO migrar: es el unico tipo que CONTIENE otras extensiones y al
    instalarlo hay que cargar el front de cada miembro. Lo que se vigila aqui es justo lo que hacia dudar:

      · la LINEA DE MIEMBROS ('plugin, login' en el catalogo; '1 plugin, 1 login' instalado), que ningun
        otro tipo tiene y que el generico gano como `subtitle` al migrarlo
      · que instalar un pack instale DE VERDAD lo que trae, y desinstalarlo se lo lleve
      · que el boton de desinstalar avise de eso, en vez del 'Uninstall' generico

    Se prueba el ciclo completo con el pack PUBLICO del catalogo, y se deja el entorno como estaba: si algo
    queda instalado, la proxima corrida lo veria y el resultado dejaria de significar nada.
*/

const DIALOG = /Manage extension packs/i

test.describe.configure({ mode: 'serial' })

/** Lo que trae un pack, en la linea de debajo del nombre: '2 plugins, 1 theme' o 'plugin, theme'. */
const TIPOS = '(plugin|theme|homepage|sender|provider|webhook|login|docs|aitoolset|idp)'
const MIEMBROS = new RegExp(`^(\\d+ )?${TIPOS}s?(, (\\d+ )?${TIPOS}s?)*$`)

test.describe('gestor generico de extensiones: packs', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'Packs')
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    test('el tipo pack abre el gestor generico con sus dos secciones', async () => {
        await expect(dialog().getByText('Installed packs')).toBeVisible()
        await expect(dialog().getByText('Available packs')).toBeVisible()
    })

    test('el catalogo dice QUE trae cada pack, no solo su nombre', async () => {
        // Es la unica linea propia del tipo. Sin ella un pack es indistinguible de cualquier otra
        // extension y no hay forma de saber que se instala al pulsar.
        // ⚠️ En el catalogo la version va en un Select, no en el chip 'v0.0.0': se espera al boton.
        await expect(dialog().locator('span[aria-label="Install"] button').first()).toBeVisible({ timeout: 60000 })
        expect(await dialog().getByText(MIEMBROS).count(), 'ningun pack del catalogo dice que trae').toBeGreaterThan(0)
    })

    test('instalar un pack instala lo que trae, y desinstalarlo se lo lleva', async () => {
        test.setTimeout(240000)

        const instalable = dialog().locator('span[aria-label="Install"] button:not([disabled])')
        test.skip(await instalable.count() === 0, 'no hay ningun pack del catalogo sin instalar')

        await instalable.first().click()

        // Instalado = el generico lo pinta arriba con SU aviso de desinstalar, no con el generico.
        const desinstalar = dialog().locator('span[aria-label="Uninstall pack (removes all member extensions)"] button')
        await expect(desinstalar).toHaveCount(1, { timeout: 90000 })
        expect(await dialog().locator('span[aria-label="Uninstall"] button').count(), 'usa el tooltip generico: no avisa de lo que borra').toBe(0)

        // Y lo instalado cuenta lo que hay DENTRO, que es distinto de lo que promete el catalogo.
        await expect(dialog().getByText(/^\d+ \w+(s)?(, \d+ \w+(s)?)*$/).first()).toBeVisible()

        // Los miembros estan instalados de verdad, no solo el pack: es lo que hacia dudar de migrarlo.
        const miembros = await page.evaluate(async () => {
            const base = window.location.origin.replace(':3000', ':3883')
            const packs = await (await fetch(`${base}/core/packs`)).json() as { extensions: { extensionType: string, id: string }[] }[]
            const dentro = packs.flatMap(p => p.extensions)
            const plugins = await (await fetch(`${base}/core/plugins`)).json() as { id: string }[]
            const logins = await (await fetch(`${base}/core/logins`)).json() as { id: string }[]
            return dentro.map(e => ({
                ...e,
                presente: e.extensionType === 'plugin' ? plugins.some(p => p.id === e.id)
                    : e.extensionType === 'login' ? logins.some(l => l.id === e.id)
                    : true
            }))
        })
        expect(miembros.length, 'el pack instalado no declara ningun miembro').toBeGreaterThan(0)
        for (const m of miembros) expect(m.presente, `${m.extensionType} '${m.id}' no quedo instalado`).toBe(true)

        // ── y ahora quitarlo, que es como se deja el entorno igual que estaba ────────────────────────
        await desinstalar.click()
        await expect(desinstalar).toHaveCount(0, { timeout: 90000 })

        const quedan = await page.evaluate(async (ids: string[]) => {
            const base = window.location.origin.replace(':3000', ':3883')
            const plugins = await (await fetch(`${base}/core/plugins`)).json() as { id: string }[]
            const logins = await (await fetch(`${base}/core/logins`)).json() as { id: string }[]
            return [...plugins, ...logins].filter(e => ids.includes(e.id)).map(e => e.id)
        }, miembros.map(m => m.id))
        expect(quedan, 'quitar el pack dejo miembros sueltos detras').toEqual([])
    })

    test('la linea de miembros tambien esta en la vista de lista', async () => {
        // Al migrar, el subtitulo hay que pintarlo en las DOS vistas: la de lista solo tenia nombre.
        await dialog().getByRole('button', { name: 'List view' }).click()
        expect(await dialog().getByText(MIEMBROS).count(), 'la vista de lista pierde lo que trae el pack').toBeGreaterThan(0)
        await dialog().getByRole('button', { name: 'Card view' }).click()
    })
})
