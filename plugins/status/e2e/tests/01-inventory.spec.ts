import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'

/*
    El inventario de Kwirth Status, de punta a punta (S1).

    Serial y con UNA sola página: el coste dominante es recargar la SPA contra el dev server, no
    Playwright. Se paga una vez.

    NO destructivo por construcción: este canal solo lee. No instala, no configura y no toca nada del
    Kwirth del usuario — abrirlo es toda la interacción que hay.
*/

test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    const option = await openChannelPicker(page)
    await expect(option).toBeVisible()
    await expect(option).toHaveText(CHANNEL)
    await option.click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)

    /*
        El canal declara setup:false y sin configuración que pedir, asi que el core lo arranca al añadir
        la pestaña: en el menú ya no hay 'Start'. Se comprueba de todos modos, para que el e2e siga
        valiendo si algún día el arranque vuelve a ser manual.
    */
    await openTabMenu(page)
    const start = page.getByText('Start', { exact: true })
    if (await start.isVisible().catch(() => false)) await start.click()
    else await page.keyboard.press('Escape')
    await page.waitForTimeout(2500)
})

test.afterAll(async () => {
    await page?.goto('about:blank').catch(() => {})
    await page?.context().close().catch(() => {})
})

test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

test('al abrir el canal llega el inventario, sin pedir nada', async () => {
    await expect(page.getByText('What this Kwirth has inside')).toBeVisible({ timeout: 30000 })
    // La cabecera cuenta cuantos componentes hay; en un Kwirth de desarrollo hay varios.
    await expect(page.getByText(/\d+ components/)).toBeVisible()
})

test('la tabla trae la columna QUE justifica la pantalla', async () => {
    for (const columna of ['Kind', 'Name', 'State', 'Why']) {
        await expect(page.getByRole('columnheader', { name: columna, exact: true })).toBeVisible()
    }
})

test('se listan providers y senders del Kwirth de verdad', async () => {
    // Contra el back real: lo que salga depende del entorno, pero tiene que haber filas de varios tipos.
    const filas = page.locator('table tbody tr')
    expect(await filas.count()).toBeGreaterThan(0)
    const texto = await page.locator('table tbody').innerText()
    expect(texto).toMatch(/Provider|Sender|Webhook|Pluvider/)
})

test('🔴 nada aparece como "activo" ni como "ocioso"', async () => {
    /*
        El invariante de S1: saber si algo tiene consumidores exige el contrato de S2. Mientras no
        exista, la pantalla no puede insinuar que lo sabe — quien lea "ocioso" irá a desinstalar algo.
    */
    const texto = await page.locator('table tbody').innerText()
    expect(texto).not.toMatch(/\bActive\b/i)
    expect(texto).not.toMatch(/\bIdle\b/i)
})

test('🔴 no se filtra ninguna URL de webhook: llevan el token dentro', async () => {
    const texto = await page.locator('table').innerText()
    expect(texto).not.toMatch(/token=/i)
    expect(texto).not.toMatch(/https?:\/\//i)
})

test('la pantalla dice de cuando es la foto, y que no se actualiza sola', async () => {
    // Que no se refresca solo no es un defecto que se esconde: es el producto, y se dice.
    await expect(page.getByText(/Snapshot taken at .* it does not refresh on its own/)).toBeVisible()
})

test('refrescar trae una foto nueva', async () => {
    const antes = await page.getByText(/Snapshot taken at/).innerText()
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    // La hora se pinta con segundos, asi que hay que dejar pasar uno para que el texto cambie.
    await page.waitForTimeout(1500)
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    await expect(async () => {
        expect(await page.getByText(/Snapshot taken at/).innerText()).not.toBe(antes)
    }).toPass({ timeout: 15000 })
})

test('🔴 la tabla scrollea: con muchos componentes se ven TODOS', async () => {
    /*
        El contenedor que el core da al contenido de una pestaña no tiene altura definida, asi que un
        'height: 100%' no resuelve a nada: la tabla crecia hasta salirse de la pantalla y las ultimas
        filas eran inalcanzables. Se vio en el QA de S1 con 20 componentes.

        Se comprueba lo que importa: que la caja no se sale del viewport y que la ultima fila se puede
        alcanzar scrollando.
    */
    const caja = page.locator('table').locator('xpath=..')
    const alto = await caja.evaluate(el => ({ visible: el.clientHeight, contenido: el.scrollHeight, viewport: window.innerHeight }))
    expect(alto.visible, 'la caja de la tabla se sale del viewport').toBeLessThanOrEqual(alto.viewport)

    const ultima = page.locator('table tbody tr').last()
    await ultima.scrollIntoViewIfNeeded()
    await expect(ultima).toBeInViewport()
})

test('el filtro deja solo lo que se busca', async () => {
    const todas = await page.locator('table tbody tr').count()
    await page.getByPlaceholder('Filter…').fill('provider')
    await expect(async () => {
        expect(await page.locator('table tbody tr').count()).toBeLessThan(todas)
    }).toPass({ timeout: 10000 })
    await page.getByPlaceholder('Filter…').fill('')
})
