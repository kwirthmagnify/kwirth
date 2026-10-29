import { expect, Locator, Page } from '@playwright/test'
import { readdirSync } from 'fs'
import path from 'path'

export const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
export const PASS = process.env.KWIRTH_E2E_PASS ?? ''

// CRA's dev server covers the page with an iframe when compilation fails. That iframe means exactly
// that: **the front end does not compile**. It is not a leftover that can be brushed aside — remove it
// and the tests carry on against a bundle that is not the one meant to be tested, and may end up green.
//
// So it aborts, and with the overlay's text, which is exactly the diagnosis needed: without it, the
// symptom is a click that does not land because "something" intercepts it.
export async function assertFrontCompiles(page: Page): Promise<void> {
    const overlay = page.locator('iframe#webpack-dev-server-client-overlay')
    if (await overlay.count() === 0) return
    const message = await page.frameLocator('iframe#webpack-dev-server-client-overlay').locator('body')
        .innerText().catch(() => '(no se pudo leer el overlay)')
    throw new Error(`El front NO COMPILA — el dev server de CRA muestra:\n\n${message.slice(0, 1200)}`)
}

export async function login(page: Page, user = USER, pass = PASS): Promise<void> {
    await page.goto('/')
    await assertFrontCompiles(page)
    await page.getByLabel('User').fill(user)
    await page.getByLabel('Password').fill(pass)
    await page.getByRole('button', { name: 'OK' }).click()
    /*
        🔴 Se espera a que la aplicación ESTÉ, no un rato fijo.

        Aquí había un `waitForTimeout(1500)`, y esa era la causa de la mitad de los rojos intermitentes
        de la suite: si el front tardaba más de segundo y medio —y en desarrollo tarda a menudo— todo lo
        que venía detrás encontraba la aplicación a medias. El error aparecía mucho más adelante, al
        pulsar el menú, y se leía como «el menú no responde» en vez de «aún no había terminado de
        cargar»; se parcheó spec a spec durante un tiempo antes de mirar aquí.

        La barra superior es la señal: cuando su primer botón existe, la aplicación ha pintado. Y
        después `networkidle`, porque pintar no es haber terminado de pedir cosas.
    */
    await page.locator('header button').first().waitFor({ state: 'visible', timeout: 60_000 })
    await page.waitForLoadState('networkidle').catch(() => { /* alguna petición de fondo nunca calla */ })
}

/** Closes any open dialog (from auto-start or other causes). */
export async function dismissOpenDialogs(page: Page): Promise<void> {
    // Try Cancel, then OK, then Escape — in that order
    for (const name of ['CANCEL', 'OK', 'Close']) {
        const btn = page.getByRole('button', { name })
        if (await btn.count() > 0) {
            await btn.first().click({ timeout: 1000 }).catch(() => {})
            await page.waitForTimeout(400)
        }
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    // Wait until no dialog is visible any more
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
}

/** Opens the hamburger drawer using a CSS locator (it is not blocked by the backdrop's aria-hidden). */
export async function openMenu(page: Page): Promise<void> {
    // First AppBar button (the hamburger) — a CSS locator avoids the aria-hidden problem with MUI Dialog
    const hamburguesa = page.locator('header button').first()
    /*
        🔴 Se espera a que la barra ESTÉ, con un minuto de margen, antes de pulsar nada.

        El `actionTimeout` de la config son 15 s y al front de desarrollo no siempre le llegan: después
        de un login tarda en quedarse quieto, y el click se daba contra una página que aún estaba
        navegando. El error que salía era «locator.click: Timeout exceeded» sobre `header button`, que
        se lee como un problema del menú y es simplemente que la aplicación no estaba lista.

        Era la causa de la mitad de los rojos intermitentes de la suite, y se estaba parcheando spec a
        spec. Vive aquí porque el problema no es de ninguno en particular: es de todos los que abren el
        menú, que son casi todos.
    */
    await hamburguesa.waitFor({ state: 'visible', timeout: 60_000 })
    await hamburguesa.click({ force: true, timeout: 60_000 })
    await page.waitForTimeout(300)
}

/** Opens the drawer and clicks a top-level item. */
export async function clickMenuItem(page: Page, label: string): Promise<void> {
    await dismissOpenDialogs(page)
    await openMenu(page)
    /*
        Y se espera a que la entrada esté HABILITADA. Kwirth deja algunas apagadas hasta que tiene con
        qué (el export, sin nada que exportar), así que un click a secas la encuentra con `aria-disabled`
        y agota el timeout diciendo que no pudo pulsarla — que parece un problema del menú y es que la
        aplicación todavía no estaba lista.
    */
    const entrada = page.getByRole('menuitem', { name: label, exact: true })
    await expect(entrada).toBeEnabled({ timeout: 60_000 })
    await entrada.click({ timeout: 60_000 })
    await page.waitForTimeout(400)
}

/** Opens the drawer, expands "Manage extensions" and clicks a sub-item. */
export async function clickExtensionMenuItem(page: Page, label: string): Promise<void> {
    await dismissOpenDialogs(page)
    await openMenu(page)
    // Mismo margen que en `clickMenuItem`, y por lo mismo: el front de desarrollo tarda más que el
    // `actionTimeout` de la config en quedarse quieto, y el click muere donde no se está midiendo nada.
    await page.getByRole('menuitem', { name: /Manage extensions/i }).click({ timeout: 60_000 })
    await page.waitForTimeout(200)
    const entrada = page.getByRole('menuitem', { name: label, exact: true })
    await expect(entrada).toBeEnabled({ timeout: 60_000 })
    await entrada.click({ timeout: 60_000 })
    await page.waitForTimeout(400)
}

/*
    The Configure cog of ONE extension in a manager dialog, found by its name. It climbs from the name to
    the first ancestor with a cog inside, so it lands on that card and not on the next one.

    Never `.first()` over every cog: the order is whatever is installed, and installing an extension that
    sorts earlier (a paid webhook, a sender with its own designer) silently retargets the test.
*/
export const configureCogOf = (manager: Locator, name: string | RegExp): Locator =>
    manager.getByText(name, { exact: typeof name === 'string' }).first()
        .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
        .locator('button[aria-label="Configure"]').first()

// --- Comboboxes of the ADD dialog (Cluster / View / … / Channel) ------------------------------------
// The ADD dialog mounts its selects in order, and the LAST one is always the channel's (its position
// depends on the chosen view), hence pickLastCombo.
export async function pickCombo(page: Page, idx: number, option: string): Promise<void> {
    await page.getByRole('combobox').nth(idx).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByRole('option', { name: option, exact: true }).click()
    await page.waitForTimeout(400)
}

export async function pickLastCombo(page: Page, option: string): Promise<void> {
    const n = await page.getByRole('combobox').count()
    await pickCombo(page, n - 1, option)
}

/*
    ── Where the guide's screenshots go ─────────────────────────────────────────────────────────────

    To the folder of the LIVE version of the documentation, resolved the same way as in
    `back/scripts/build-docs-tgz.js`: the highest `docs/<x.y.z>`. Every capture spec had the path nailed
    to a specific version, and it aged in silence: when a new version of the documentation was published,
    the runs went on writing over the OLD one while the live guide showed old screenshots — green,
    because a capture spec checks nothing, it only writes files.
*/
const DOCS = path.resolve(__dirname, '..', '..', '..', 'docs')

/** The highest `docs/<x.y.z>` there is in the repo. */
export const liveDocsVersion = (): string =>
    readdirSync(DOCS, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d+\.\d+\.\d+$/.test(d.name))
        .map(d => d.name)
        .sort((a, b) => {
            const pa = a.split('.').map(Number)
            const pb = b.split('.').map(Number)
            return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2]
        })
        .pop() ?? ''

/** Image folder of the live guide. Forward slashes: it is interpolated into screenshot paths. */
export const GUIDE_MEDIA = path.join(DOCS, liveDocsVersion(), '_media', 'guide').replace(/\\/g, '/')

/*
    Regenerating ONE screenshot without dragging the rest along: `CAPTURE_ONLY=aitoolsets`. Without the
    variable they are all regenerated, as always. It is needed because a normal closing changes a single
    screen, and redoing a handful of images to update one leaves diffs nobody has looked at.
*/
const ONLY = process.env.CAPTURE_ONLY ?? ''
export const capturePedida = (file: string): boolean => !ONLY || file.includes(ONLY)
