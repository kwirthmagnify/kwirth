import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'

/*
    Kwirth Status's inventory, end to end (S1).

    Serial and with ONE single page: the dominant cost is reloading the SPA against the dev server, not
    Playwright. It is paid once.

    NOT destructive by construction: this channel only reads. It installs nothing, configures nothing and
    touches nothing of the user's Kwirth — opening it is the whole of the interaction.
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
        The channel declares setup:false and has no configuration to ask for, so the core starts it when
        the tab is added: there is no 'Start' in the menu any more. It is checked all the same, so that
        the e2e still holds should starting become manual again some day.
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

test('🔴 the Providers tab lists ONLY providers and pluviders', async () => {
    // Senders and webhooks do not produce data: they live in the Extensions tab since v2.
    const filas = page.locator('table tbody tr')
    expect(await filas.count()).toBeGreaterThan(0)
    const tipos = await filas.evaluateAll(rows => rows.map(r => (r.querySelector('td')?.textContent ?? '').trim()))
    expect([...new Set(tipos)].filter(t => t !== 'Provider' && t !== 'Pluvider'), 'kinds that do not belong here').toEqual([])
})

test('la columna de consumidores distingue "ninguno" de "no lo dice"', async () => {
    /*
        The invariant, which survives S2 even though it changes shape: a component that does not
        implement getStats can NOT come out with a 0 — whoever reads "zero consumers" is going to go and
        uninstall something that may well be in use. It comes out with a dash.

        Once the repo's providers were wired up, both cases live in the same table, which is precisely
        what has to be tellable at a glance.
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
    // Every cell is either a number or a dash. That a component which does not report gets a dash and
    // not a 0 is pinned in the harness; here only providers remain, and all of them may report.
    expect(conNumero + sinDato).toBe(n)
})

test('🔴 un provider cableado dice si esta ACTIVO o si emite para nadie', async () => {
    // With the repo.s providers wired up, the table has to be able to say it for at least one.
    const texto = await page.locator('table tbody').innerText()
    expect(texto, 'ningun provider informa: el cableado de getStats no ha llegado').toMatch(/Active|Idle/)
})

test('la pantalla dice de cuando es la foto y si se refresca sola', async () => {
    // In manual mode — the default — it says it does not refresh by itself. Not a default that hides.
    await expect(page.getByText(/Snapshot taken at .* it does not refresh on its own/)).toBeVisible()
})

test('el selector de auto-refresco esta a la izquierda del boton de refrescar', async () => {
    /*
        The order matters: it was asked for there expressly. It is checked by position on screen, not by
        DOM order, which is what whoever uses it really sees.
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
        The container the core gives a tab's content has no defined height, so a 'height: 100%' resolves
        to nothing: the table grew until it ran off the screen and the last rows were unreachable. It was
        seen in S1's QA with 20 components.

        What matters is checked: that the box does not run off the viewport and that the last row can be
        reached by scrolling.
    */
    const caja = page.locator('table').locator('xpath=..')
    const alto = await caja.evaluate(el => ({ visible: el.clientHeight, contenido: el.scrollHeight, viewport: window.innerHeight }))
    expect(alto.visible, 'la caja de la tabla se sale del viewport').toBeLessThanOrEqual(alto.viewport)

    const ultima = page.locator('table tbody tr').last()
    await ultima.scrollIntoViewIfNeeded()
    await expect(ultima).toBeInViewport()
})

test('el filtro deja solo lo que se busca', async () => {
    // Filter by the name of a real row: what is left must all match, and it must include that row.
    const nombre = (await page.locator('table tbody tr').first().locator('td').nth(1).innerText()).trim()
    await page.getByPlaceholder('Filter…').fill(nombre)
    await expect(async () => {
        const nombres = await page.locator('table tbody tr').evaluateAll(rows => rows.map(r => (r.querySelectorAll('td')[1]?.textContent ?? '').trim()))
        expect(nombres).toContain(nombre)
    }).toPass({ timeout: 10000 })
    await page.getByPlaceholder('Filter…').fill('zz-no-component-has-this-name')
    await expect(page.locator('table tbody tr')).toHaveCount(0)
    await page.getByPlaceholder('Filter…').fill('')
})

// ── The tabs (v2) ──────────────────────────────────────────────────────────────

test('🔴 the five tabs, in their order', async () => {
    const nombres = await page.getByRole('tablist').last().getByRole('tab').allInnerTexts()
    expect(nombres.map(n => n.trim())).toEqual(['PROVIDERS', 'GRAPH', 'PERFORMANCE', 'PLUGINS', 'EXTENSIONS'])
})

test('the filter only shows on the tabs that are lists', async () => {
    await page.getByRole('tab', { name: 'Graph', exact: true }).click()
    await expect(page.getByPlaceholder('Filter…')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Performance', exact: true }).click()
    await expect(page.getByPlaceholder('Filter…')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Providers', exact: true }).click()
    await expect(page.getByPlaceholder('Filter…')).toBeVisible()
})

test('a tab with nothing true to show yet says why, instead of an empty table', async () => {
    await page.getByRole('tab', { name: 'Performance', exact: true }).click()
    await expect(page.getByText(/Memory, CPU and event-loop lag of the Kwirth process come in the next version/)).toBeVisible()
    await page.getByRole('tab', { name: 'Plugins', exact: true }).click()
    await expect(page.getByText(/does not tell channels which plugins are installed yet/)).toBeVisible()
    await expect(page.locator('table')).toHaveCount(0)
})

test('🔴 the Extensions tab lists senders and webhooks, without producer columns', async () => {
    await page.getByRole('tab', { name: 'Extensions', exact: true }).click()
    const tipos = await page.locator('table tbody tr').evaluateAll(rows => rows.map(r => (r.querySelector('td')?.textContent ?? '').trim()))
    expect([...new Set(tipos)].filter(t => t !== 'Sender' && t !== 'Webhook'), 'kinds that do not belong here').toEqual([])
    // Consumers and deliveries are about producing data: they would be a column of dashes here.
    await expect(page.getByRole('columnheader', { name: 'Consumers', exact: true })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Why', exact: true })).toBeVisible()
})

test('🔴 no se filtra ninguna URL de webhook: llevan el token dentro', async () => {
    // On the Extensions tab, which is where webhooks are now.
    const texto = await page.locator('table').innerText()
    expect(texto).not.toMatch(/token=/i)
    expect(texto).not.toMatch(/https?:\/\//i)
    await page.getByRole('tab', { name: 'Providers', exact: true }).click()
})
