import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Lo que instalas tiene que aparecer en User settings SIN volver a entrar.

    Regresion de un fallo real (2026-09-17): la lista de temas y homepages instalados solo se leia en el
    efecto de login, y de esa lista sale el desplegable de User settings. Instalabas un tema desde el gestor
    —el tema se cargaba, salia en el gestor con su chip— y al abrir User settings no estaba: habia que
    cerrar sesion y volver a entrar. Se arregla releyendo la lista al instalar y al desinstalar (App.tsx).

    Se prueba el CICLO COMPLETO a proposito: instalar y que aparezca es la mitad; desinstalar y que
    DESAPAREZCA es la otra, y es la que dejaria el desplegable ofreciendo un tema que ya no existe.

    NO destructivo: instala un tema del catalogo y lo desinstala al terminar. Si el entorno no tiene
    ninguno instalable (todos puestos ya), el test se salta en vez de inventarse uno.
*/

const THEMES_DIALOG = /Manage themes/i

test.describe.configure({ mode: 'serial' })

/** The themes the User settings dropdown offers, not counting 'Default'. */
const themesInUserSettings = async (page: Page): Promise<string[]> => {
    await clickMenuItem(page, 'User settings')
    const dialog = page.getByRole('dialog').filter({ hasText: /Default settings to use when you work with Kwirth/i })
    await dialog.waitFor({ timeout: 15000 })

    // ⚠️ SettingsUser's InputLabel is not associated with the Select (it carries no id/htmlFor), so the
    // combobox has no accessible name and getByLabel('Theme') does not find it. It is looked up by its
    // FormControl, which is what holds the label.
    await dialog.locator('.MuiFormControl-root').filter({ has: page.getByText('Theme', { exact: true }) }).getByRole('combobox').click()
    const opciones = (await page.getByRole('option').allTextContents()).filter(o => o !== 'Default')
    await page.keyboard.press('Escape')

    // Cancel, not OK: opening Settings to have a look must not change anybody's theme
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await dialog.waitFor({ state: 'hidden', timeout: 10000 })
    return opciones
}

const abrirGestorTemas = async (page: Page) => {
    await clickExtensionMenuItem(page, 'Themes')
    const dialog = page.getByRole('dialog').filter({ hasText: THEMES_DIALOG })
    // The back end resolves the catalogue against the remote marketplaces: on a loaded machine it is not fast.
    await dialog.waitFor({ timeout: 40000 })
    await expect(dialog.getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
    return dialog
}

test('un tema recien instalado sale en User settings sin volver a entrar', async ({ page }) => {
    test.setTimeout(240000)

    await login(page)
    await dismissOpenDialogs(page)

    const antes = await themesInUserSettings(page)

    let dialog = await abrirGestorTemas(page)
    const instalables = dialog.locator('span[aria-label="Install"] button:not([disabled])')
    const disponibles = await instalables.count()
    test.skip(disponibles === 0, 'no hay ningun tema del catalogo sin instalar en este entorno')

    await instalables.first().click()
    // Installed = it appears in the section above. The manager re-reads what is installed before notifying App.
    await expect(async () => {
        expect(await dialog.locator('span[aria-label="Uninstall"] button').count()).toBeGreaterThan(0)
    }).toPass({ timeout: 60000 })
    await dismissOpenDialogs(page)

    const despues = await themesInUserSettings(page)
    const nuevos = despues.filter(t => !antes.includes(t))
    expect(nuevos.length, `User settings no vio el tema instalado (antes: ${antes.join(', ')} | despues: ${despues.join(', ')})`).toBe(1)
    const nuevo = nuevos[0]

    // ── and now the other side: removing it has to take it out of the dropdown ──────────────────────
    dialog = await abrirGestorTemas(page)
    await dialog.getByPlaceholder('Filter…').first().fill(nuevo)
    const desinstalar = dialog.locator('span[aria-label="Uninstall"] button')
    await expect(desinstalar).toHaveCount(1)
    await desinstalar.click()
    await expect(desinstalar).toHaveCount(0, { timeout: 30000 })
    await dismissOpenDialogs(page)

    const final = await themesInUserSettings(page)
    expect(final, 'el tema desinstalado sigue ofreciendose en User settings').not.toContain(nuevo)
    expect(final.sort()).toEqual(antes.sort())
})
