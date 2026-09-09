import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// De donde se BAJAN los paquetes no es donde vive el manifest. El marketplace publico ya lo demuestra:
// manifests en GitHub, tarballs en npmjs. Por eso los registros de paquetes son una lista aparte, y la
// credencial se elige casando la URL del tarball contra el prefijo del registro.
//
// Esto cubre lo que el harness no puede: que la pestaña existe, que lo guardado sobrevive a reabrir —o
// sea que viajo al back de verdad, no se quedo en el formulario— y que el secreto vuelve pre-rellenado.
//
// NO destructivo: se cuenta lo que hay, se anade un registro con prefijo propio e inventado, y se borra
// al final pase lo que pase. El registro real del usuario no se toca en ningun momento.

const STAMP = Date.now()
const LABEL = `e2e-registry-${STAMP}`
const URL_PREFIX = `https://e2e-${STAMP}.invalid/repository/e2e`
const URL_INPUT = 'input[placeholder="https://…/repository/my-repo"]'

// La fila entera de un registro: la caja MAS INTERNA que contiene a la vez su URL y el check de
// credenciales. Buscar 'el primer ancestro con un boton' no vale — se queda en la fila de arriba, que ya
// trae el boton de borrar, y deja fuera la segunda mitad.
const rowOf = (page: Page, url: string) => page.locator('div.MuiBox-root')
    .filter({ has: page.locator(`input[value="${url}"]`) })
    .filter({ hasText: 'Needs credentials' })
    .last()

const openRegistriesTab = async (page: Page) => {
    await clickMenuItem(page, 'Kwirth Settings')
    await expect(page.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: 10000 })
    await page.getByRole('tab', { name: 'Package registries' }).click()
    await expect(page.getByRole('button', { name: 'Add registry' })).toBeVisible()
}

const save = async (page: Page) => {
    const ok = page.getByRole('button', { name: 'OK' })
    await expect(ok).toBeEnabled()
    await ok.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 })
}

// Borra CUALQUIER registro de e2e, no solo el de esta corrida. Si un fallo anterior dejo uno a medias, el
// entorno del usuario se queda sucio y la corrida siguiente cuenta mal el punto de partida. Un test no
// destructivo tiene que recoger tambien lo que dejo su propia version rota.
const removeE2eRegistries = async (page: Page) => {
    await dismissOpenDialogs(page)
    await openRegistriesTab(page)
    const leftovers = page.locator('input[value^="https://e2e-"]')
    let removed = 0
    while (await leftovers.count() > 0 && removed < 10) {
        const url = await leftovers.first().inputValue()
        // la papelera es el PRIMER boton de la fila; el ULTIMO es el ojo de revelar el secreto
        await rowOf(page, url).locator('button').first().click()
        removed++
    }
    if (removed > 0) await save(page)
    else await dismissOpenDialogs(page)
}

test('package registries: se anade, persiste con su secreto y se borra', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    await removeE2eRegistries(page)
    await openRegistriesTab(page)
    const before = await page.locator(URL_INPUT).count()

    try {
        await page.getByRole('button', { name: 'Add registry' }).click()
        const urls = page.locator(URL_INPUT)
        await expect(urls).toHaveCount(before + 1)
        await urls.last().fill(URL_PREFIX)

        const newRow = rowOf(page, URL_PREFIX)
        await newRow.getByLabel('Name').fill(LABEL)
        await newRow.getByLabel('Needs credentials').check()

        // Por defecto Token (Bearer): un Nexus con user tokens acepta el token como Bearer y rechaza esa
        // MISMA credencial como Basic, asi que el tipo por defecto importa.
        await expect(newRow.getByLabel('Token')).toBeVisible()
        await expect(newRow.getByLabel('User')).toBeDisabled()   // el usuario no pinta nada en Bearer
        await newRow.getByLabel('Token').fill('e2e-token-value')
        await save(page)

        // reabrir relee del back: comprueba persistencia real, no estado del formulario
        await openRegistriesTab(page)
        await expect(page.locator(`input[value="${URL_PREFIX}"]`)).toHaveCount(1)
        expect(await rowOf(page, URL_PREFIX).getByLabel('Token').inputValue()).toBe('e2e-token-value')

        // el esquema lo decide el TIPO, no la pinta del secreto: al pasar a Basic aparece usuario
        await rowOf(page, URL_PREFIX).getByRole('combobox').click()
        await page.getByRole('option', { name: 'User and password (Basic)' }).click()
        const basic = rowOf(page, URL_PREFIX)
        await expect(basic.getByLabel('User')).toBeEnabled()
        await basic.getByLabel('User').fill('e2e-user')
        await basic.getByLabel('Password').fill('e2e-pass')
        await save(page)

        await openRegistriesTab(page)
        const reread = rowOf(page, URL_PREFIX)
        expect(await reread.getByLabel('User').inputValue()).toBe('e2e-user')
        expect(await reread.getByLabel('Password').inputValue()).toBe('e2e-pass')
        await dismissOpenDialogs(page)
    }
    finally {
        await removeE2eRegistries(page)
    }

    // el entorno queda como estaba: ni un registro de mas
    await openRegistriesTab(page)
    expect(await page.locator(URL_INPUT).count()).toBe(before)
    await dismissOpenDialogs(page)
    await page.goto('about:blank')
})
