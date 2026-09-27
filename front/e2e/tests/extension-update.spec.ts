import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    The UPDATE button of the installed extensions.

    Updating used to be uninstall + install, and that takes the extension's configuration away. Now it
    installs on top, which is what the back end already did inside —it replaces index, code and loaded
    module— and all that was missing was letting it be asked for.

    What is watched here is the visible part, and in particular what must NOT break:

      · the button is ALWAYS there, including when there is nothing to update, and then it says why. If
        it came and went, the buttons would dance about between rows and the bin would end up exactly
        where the row above's update was — with all that means when clicking fast.
      · the bin is still the LAST button.
      · a pack is not updated in place (installing it also refuses if any of its members is in place),
        and the button says so instead of offering something that is going to fail.

    NON-destructive: it opens, looks and closes. No update is ever pressed — really updating would change
    the user's extensions, and that belongs to the manual QA, not here.
*/

test.describe.configure({ mode: 'serial' })

/*
    The update button's possible tooltips, which are its only label. Pinning them down in a list is the
    goal and not a side effect: each answers a different situation —and an 'Up to date' put where there
    is in fact no catalogue would be a lie— so if somebody adds a new case, this test forces them to
    decide which text it gets.
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
    That every INSTALLED extension has its update, without having to separate the dialog's two sections.

    The catalogue also has buttons saying 'Update to v…' —from there one updates to a specific version—
    so counting them all does not tell one section from the other. What IS specific to what is installed
    is the bin, and the update goes right BEFORE it: checking that pair verifies in one go that the
    button is on all of them and that it has not slipped behind the bin.
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
            The order matters more than it seems: the update was put BETWEEN configure and uninstall, and
            had it been put at the end, the bin would have moved in every row of all eleven managers at
            once.
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
            The previous text was 'Already installed — uninstall first', which is no longer true: from
            the versions dropdown one can go to a newer one without uninstalling anything.
        */
        const d = await abrir('Plugins', /Manage channel plugins/i)
        await expect(d.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
        await expect(d.locator('button[aria-label*="uninstall first"]')).toHaveCount(0)
    })
})
