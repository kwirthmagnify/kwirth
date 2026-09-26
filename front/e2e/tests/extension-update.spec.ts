import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    El boton de ACTUALIZAR de las extensiones instaladas.

    Antes actualizar era desinstalar + instalar, y eso se lleva por delante la configuracion de la
    extension. Ahora se instala encima, que es lo que el back ya hacia por dentro —reemplaza indice,
    codigo y modulo cargado— y solo faltaba dejarle pedirlo.

    Lo que se vigila aqui es la parte que se ve, y en particular lo que NO se puede romper:

      · el boton esta SIEMPRE, tambien cuando no hay nada que actualizar, y entonces dice por que. Si
        apareciera y desapareciera, los botones bailarian de sitio entre filas y la papelera acabaria
        justo donde estaba el update de la fila de arriba — con lo que eso significa al pulsar rapido.
      · la papelera sigue siendo el ULTIMO boton.
      · un pack no se actualiza en sitio (instalarlo rechaza tambien si alguno de sus miembros esta
        puesto), y el boton lo dice en vez de ofrecer algo que va a fallar.

    NO destructivo: abre, mira y cierra. No se pulsa ningun update — actualizar de verdad cambiaria las
    extensiones del usuario, y eso es del QA manual, no de aqui.
*/

test.describe.configure({ mode: 'serial' })

/*
    Los tooltips posibles del boton de update, que son su unica etiqueta. Fijarlos en una lista es el
    objetivo y no un efecto colateral: cada uno responde a una situacion distinta —y un 'Up to date'
    puesto donde en realidad no hay catalogo seria mentira—, asi que si alguien añade un caso nuevo, este
    test le obliga a decidir que texto le toca.
*/
const ETIQUETAS_UPDATE = [
    /^Update to v/,
    /^Up to date \(v/,
    /^Not in any catalog/,
    /^Checking the catalog/,
    /^No version information/,
    /^A dev version is loaded/,
    /^Bundled with Kwirth/,
    /^Packs cannot be updated/
]

const esUpdate = (etiqueta: string): boolean => ETIQUETAS_UPDATE.some(r => r.test(etiqueta))

/** The labels of ALL the dialog's buttons, in the order they are drawn. */
const etiquetasDe = async (page: Page, dialogo: RegExp): Promise<string[]> => {
    const botones = page.getByRole('dialog').filter({ hasText: dialogo }).locator('button[aria-label]')
    const total = await botones.count()
    const etiquetas: string[] = []
    for (let i = 0; i < total; i++) etiquetas.push((await botones.nth(i).getAttribute('aria-label')) ?? '')
    return etiquetas
}

/*
    Que cada extension INSTALADA tenga su update, sin tener que separar las dos secciones del diálogo.

    En el catalogo tambien hay botones que dicen 'Update to v…' —desde alli se actualiza a una version
    concreta—, asi que contarlos todos no distingue una seccion de la otra. Lo que si es propio de lo
    instalado es la papelera, y el update va justo ANTES de ella: comprobar esa pareja verifica de una vez
    que el boton esta en todas y que no se ha colado detras de la papelera.
*/
const parejas = (etiquetas: string[]): { papeleras: number, conUpdateDelante: number } => {
    let papeleras = 0
    let conUpdateDelante = 0
    etiquetas.forEach((e, i) => {
        if (!/^Uninstall/i.test(e)) return
        papeleras++
        if (i > 0 && esUpdate(etiquetas[i - 1])) conUpdateDelante++
    })
    return { papeleras, conUpdateDelante }
}

test.describe('boton de actualizar en las extensiones instaladas', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const abrir = async (menu: string, dialogo: RegExp) => {
        await dismissOpenDialogs(page).catch(() => {})
        await clickExtensionMenuItem(page, menu)
        await page.getByRole('dialog').filter({ hasText: dialogo }).waitFor({ timeout: 40000 })
        return page.getByRole('dialog').filter({ hasText: dialogo })
    }

    test('cada plugin instalado tiene su update, y va justo antes de la papelera', async () => {
        /*
            El orden importa mas de lo que parece: el update se metio ENTRE configurar y desinstalar, y si
            se hubiera puesto al final, la papelera cambiaria de sitio en todas las filas de los once
            gestores a la vez.
        */
        const d = await abrir('Plugins', /Manage channel plugins/i)
        await expect(d.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })

        const { papeleras, conUpdateDelante } = parejas(await etiquetasDe(page, /Manage channel plugins/i))
        expect(papeleras, 'el gestor no pinta ningun plugin instalado').toBeGreaterThan(0)
        expect(conUpdateDelante).toBe(papeleras)
    })

    test('lo que no se puede actualizar lo dice, y esta deshabilitado', async () => {
        const d = page.getByRole('dialog').filter({ hasText: /Manage channel plugins/i })
        // 'Up to date' is the normal case on an up-to-date Kwirth: the button is there, visible, and cannot be pressed.
        const alDia = d.locator('button[aria-label^="Up to date (v"]')
        if (await alDia.count() > 0) await expect(alDia.first()).toBeDisabled()

        // and what is in dev is never updated from the catalogue: it is changed in kwirth-dev.json
        const dev = d.locator('button[aria-label^="A dev version is loaded"]')
        if (await dev.count() > 0) await expect(dev.first()).toBeDisabled()
    })

    test('en vista de lista sale el mismo boton que en tarjeta', async () => {
        // card and row share the same ActionButtons, and this is what keeps it that way
        const d = page.getByRole('dialog').filter({ hasText: /Manage channel plugins/i })
        const enTarjeta = parejas(await etiquetasDe(page, /Manage channel plugins/i))

        await d.getByRole('button', { name: 'List view' }).click()
        await expect(d.getByRole('button', { name: 'Card view' })).toBeVisible()
        const enLista = parejas(await etiquetasDe(page, /Manage channel plugins/i))
        expect(enLista.papeleras).toBe(enTarjeta.papeleras)
        expect(enLista.conUpdateDelante).toBe(enTarjeta.conUpdateDelante)

        await d.getByRole('button', { name: 'Card view' }).click()
    })

    test('un sender instalado tambien lo tiene: es el mismo dialogo para los once tipos', async () => {
        const d = await abrir('Senders', /Manage senders/i)
        await expect(d.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
        const { papeleras, conUpdateDelante } = parejas(await etiquetasDe(page, /Manage senders/i))
        expect(papeleras, 'el gestor no pinta ningun sender instalado').toBeGreaterThan(0)
        expect(conUpdateDelante).toBe(papeleras)
    })

    test('un pack dice que no se actualiza en sitio, en vez de ofrecerlo', async () => {
        const d = await abrir('Packs', /Manage extension packs/i)
        const boton = d.locator('button[aria-label^="Packs cannot be updated"]')
        // Only when some pack is installed: with no packs there is no row, and that is not a failure.
        if (await boton.count() > 0) {
            await expect(boton.first()).toBeVisible()
            await expect(boton.first()).toBeDisabled()
        }
    })

    test('en el catalogo, algo ya instalado invita a elegir una version mas nueva', async () => {
        /*
            El texto de antes era 'Already installed — uninstall first', que ya no es verdad: desde el
            desplegable de versiones se puede ir a una mas nueva sin desinstalar nada.
        */
        const d = await abrir('Plugins', /Manage channel plugins/i)
        await expect(d.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
        await expect(d.locator('button[aria-label*="uninstall first"]')).toHaveCount(0)
    })
})
