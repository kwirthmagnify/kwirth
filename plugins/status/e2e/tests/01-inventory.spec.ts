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
    // The header counts how many components there are; on a development Kwirth there are several.
    await expect(page.getByText(/\d+ components/)).toBeVisible()
})

test('la tabla trae la columna QUE justifica la pantalla', async () => {
    for (const columna of ['Kind', 'Name', 'State', 'Why']) {
        await expect(page.getByRole('columnheader', { name: columna, exact: true })).toBeVisible()
    }
})

test('se listan providers y senders del Kwirth de verdad', async () => {
    // Against the real back end: what shows depends on the environment, but there must be rows of several kinds.
    const filas = page.locator('table tbody tr')
    expect(await filas.count()).toBeGreaterThan(0)
    const texto = await page.locator('table tbody').innerText()
    expect(texto).toMatch(/Provider|Sender|Webhook|Pluvider/)
})

test('la columna de consumidores distingue "ninguno" de "no lo dice"', async () => {
    /*
        El invariante, que sobrevive a S2 aunque cambie de forma: un componente que no implementa
        getStats NO puede salir con un 0 — quien lea "cero consumidores" va a ir a desinstalar algo que
        quizá se usa. Sale con un guion.

        Tras cablear los providers del repo conviven los dos casos en la misma tabla, que es justo lo
        que hay que poder distinguir de un vistazo.
    */
    const filas = page.locator('table tbody tr')
    const n = await filas.count()
    let conNumero = 0
    let sinDato = 0
    for (let i = 0; i < n; i++) {
        const consumidores = (await filas.nth(i).locator('td').nth(3).innerText()).trim()
        if (consumidores === '—') sinDato++
        else if (/^[0-9]+$/.test(consumidores)) conNumero++
        else throw new Error(`la columna de consumidores dice '${consumidores}', que no es ni un numero ni un guion`)
    }
    expect(conNumero + sinDato).toBe(n)
    // Senders and webhooks do not report (the contract belongs to providers), so there are always dashes.
    expect(sinDato, 'nadie sale como "no informa", y eso significa que se esta inventando el dato').toBeGreaterThan(0)
})

test('🔴 un provider cableado dice si esta ACTIVO o si emite para nadie', async () => {
    // With the repo.s providers wired up, the table has to be able to say it for at least one.
    const texto = await page.locator('table tbody').innerText()
    expect(texto, 'ningun provider informa: el cableado de getStats no ha llegado').toMatch(/Active|Idle/)
})

test('🔴 no se filtra ninguna URL de webhook: llevan el token dentro', async () => {
    const texto = await page.locator('table').innerText()
    expect(texto).not.toMatch(/token=/i)
    expect(texto).not.toMatch(/https?:\/\//i)
})

test('la pantalla dice de cuando es la foto y si se refresca sola', async () => {
    // In manual mode — the default — it says it does not refresh by itself. Not a default that hides.
    await expect(page.getByText(/Snapshot taken at .* it does not refresh on its own/)).toBeVisible()
})

test('el selector de auto-refresco esta a la izquierda del boton de refrescar', async () => {
    /*
        El orden importa: se pidio ahi expresamente. Se comprueba por posicion en pantalla, no por el
        orden del DOM, que es lo que de verdad ve quien lo usa.
    */
    const selector = page.locator('[aria-label="Auto refresh"]')
    await expect(selector).toBeVisible()
    const izq = await selector.boundingBox()
    const der = await page.locator('button[aria-label="Take a new snapshot"]').boundingBox()
    expect(izq!.x + izq!.width, 'el selector no esta a la izquierda del boton').toBeLessThanOrEqual(der!.x + 2)
})

test('🔴 al elegir un intervalo, la pantalla deja de decir que no se refresca sola', async () => {
    // The sentence used to be a fixed claim; with auto-refresh it would be false, and a screen that lies
    // about whether it refreshes is worse than one that does not refresh.
    await page.locator('[aria-label="Auto refresh"]').click()
    // The MUI menu animates in: without waiting, the click lands on an element that is still moving.
    await page.waitForTimeout(500)
    await page.getByRole('option', { name: 'Every 5s' }).click()
    await expect(page.getByText(/refreshing every 5s while this tab is open/)).toBeVisible()
    await expect(page.getByText(/it does not refresh on its own/)).toHaveCount(0)

    // and it is left as it was, since the other cases rely on manual mode
    await page.locator('[aria-label="Auto refresh"]').click()
    // The MUI menu animates in: without waiting, the click lands on an element that is still moving.
    await page.waitForTimeout(500)
    await page.getByRole('option', { name: 'Manual' }).click()
    await expect(page.getByText(/it does not refresh on its own/)).toBeVisible()
})

test('la columna de entregas distingue un numero de "no lo dice"', async () => {
    const filas = page.locator('table tbody tr')
    const n = await filas.count()
    let conNumero = 0
    for (let i = 0; i < n; i++) {
        const txt = (await filas.nth(i).locator('td').nth(4).innerText()).trim().split('\n')[0]
        if (txt === '—') continue
        expect(txt.replace(/[.,]/g, ''), `entregas raras: '${txt}'`).toMatch(/^[0-9]+$/)
        conNumero++
    }
    expect(conNumero, 'ningun componente informa de sus entregas').toBeGreaterThan(0)
})

test('refrescar trae una foto nueva', async () => {
    const antes = await page.getByText(/Snapshot taken at/).innerText()
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    // The time is drawn with seconds, so one has to pass for the text to change.
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
