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

// ── Home (v2) ──────────────────────────────────────────────────────────────────

// By its own aria-label: the tabs are called the same as the boxes.
const box = (title: string) => page.locator(`[aria-label="${title} summary"]`)
const tab = (name: string) => page.getByRole('tab', { name, exact: true })

test('🔴 it opens on Home, with one box per tab', async () => {
    await expect(tab('Home')).toHaveAttribute('aria-selected', 'true')
    for (const title of ['Providers', 'Graph', 'Performance', 'Plugins', 'Extensions', 'Routes', 'Log', 'Previous log', 'DCE']) {
        await expect(box(title)).toBeVisible()
    }
    // No table on Home: the boxes are the summary, the tables are behind the tabs.
    await expect(page.locator('table')).toHaveCount(0)
})

test('🔴 the Providers box counts exactly what the Providers tab lists', async () => {
    const dicho = (await box('Providers').innerText()).match(/(\d+) producers?/)
    expect(dicho, 'the box does not say how many producers').not.toBeNull()
    await tab('Providers').click()
    await expect(page.locator('table tbody tr').first()).toBeVisible()
    expect(await page.locator('table tbody tr').count()).toBe(Number(dicho![1]))
    await tab('Home').click()
})

test('🔴 the Extensions box counts exactly what the Extensions tab lists', async () => {
    const dicho = (await box('Extensions').innerText()).match(/(\d+) extensions?/)
    expect(dicho, 'the box does not say how many extensions').not.toBeNull()
    await tab('Extensions').click()
    await page.waitForTimeout(300)
    expect(await page.locator('table tbody tr').count()).toBe(Number(dicho![1]))
    await tab('Home').click()
})

test('the Graph box says how many lines, producers and consumers', async () => {
    await expect(box('Graph')).toContainText(/\d+ subscriptions?/)
    await expect(box('Graph')).toContainText(/\d+ producers? · \d+ consumers?/)
})

test('🔴 the Performance box shows the process with a VALUE, not a label', async () => {
    const rss = (await box('Performance').innerText()).match(/(\d+) MB RSS/)
    expect(rss, 'no RSS in MB on the Performance box').not.toBeNull()
    expect(Number(rss![1])).toBeGreaterThan(0)
    await expect(box('Performance')).toContainText(/up \d+(s|m|h|d)/)
})

test('🔴 the boxes are three per row, equal, and fill the whole width', async () => {
    // Measured on screen: the page is wide enough here for the three-column layout.
    const cajas = await page.locator('[aria-label$=" summary"]').evaluateAll(els => els.map(e => {
        const r = e.getBoundingClientRect()
        return { top: Math.round(r.top), left: r.left, right: r.right, width: r.width }
    }))
    expect(cajas.length, 'nine boxes: the eight tabs and DCE').toBe(9)
    const primeraFila = cajas.filter(c => c.top === cajas[0].top)
    expect(primeraFila.length, 'boxes in the first row').toBe(3)
    const anchos = cajas.map(c => c.width)
    expect(Math.max(...anchos) - Math.min(...anchos), 'the boxes are not all the same width').toBeLessThanOrEqual(1)
    // And down: the same height for every card, and the grid reaching the bottom of the window.
    const medidas = await page.locator('[aria-label$=" summary"]').evaluateAll(els => els.map(e => {
        const r = e.getBoundingClientRect()
        return { height: r.height, bottom: r.bottom }
    }))
    const altos = medidas.map(m => m.height)
    expect(Math.max(...altos) - Math.min(...altos), 'the cards are not all the same height').toBeLessThanOrEqual(1)
    const fondo = Math.max(...medidas.map(m => m.bottom))
    expect(page.viewportSize()!.height - fondo, 'the cards do not fill the height available').toBeLessThanOrEqual(80)
    // Full width: the same margin on the right as on the left of the window (the tab strip is no
    // reference — it is only as wide as its tabs).
    const ancho = page.viewportSize()!.width
    const izquierda = primeraFila[0].left
    const derecha = ancho - primeraFila[2].right
    expect(Math.abs(izquierda - derecha), `the row does not fill the width: ${izquierda}px left, ${derecha}px right`).toBeLessThanOrEqual(2)
})

test('🔴 the DCE box is a door now: it opens the DCE tab', async () => {
    await expect(box('DCE')).toHaveAttribute('role', 'button')
    await box('DCE').click()
    await expect(tab('DCE')).toHaveAttribute('aria-selected', 'true')
    await tab('Home').click()
})

test('🔴 a box is a door: clicking it opens its tab', async () => {
    await box('Graph').click()
    await expect(tab('Graph')).toHaveAttribute('aria-selected', 'true')
    await tab('Home').click()
    await box('Providers').click()
    await expect(tab('Providers')).toHaveAttribute('aria-selected', 'true')
    // The table cases below run on the Providers tab.
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
    // What the snapshot is lives on Home since the tabs; the controls stay on every tab.
    await tab('Home').click()
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

test('the filter box and the refresh selector are the same height', async () => {
    // The outlined boxes themselves: the MuiInputBase-root that holds each control, measured in the page.
    const alturas = await page.evaluate(() => {
        const box = (el: Element | null) => el?.closest('.MuiInputBase-root')?.getBoundingClientRect().height
        return {
            filtro: box(document.querySelector('input[placeholder="Filter…"]')),
            selector: box(document.querySelector('[aria-label="Auto refresh"]'))
        }
    })
    expect(alturas.filtro, 'no filter box').toBeDefined()
    expect(alturas.selector, 'no refresh selector box').toBeDefined()
    expect(Math.abs(alturas.filtro! - alturas.selector!), `filter ${alturas.filtro}px vs selector ${alturas.selector}px`).toBeLessThanOrEqual(1)
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
    await tab('Providers').click()
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
    await tab('Home').click()
    const antes = await page.getByText(/Snapshot taken at/).innerText()
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    // The time is drawn with seconds, so one has to pass for the text to change.
    await page.waitForTimeout(1500)
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    await expect(async () => {
        expect(await page.getByText(/Snapshot taken at/).innerText()).not.toBe(antes)
    }).toPass({ timeout: 15000 })
    await tab('Providers').click()
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

test('🔴 the ten tabs, in their order: Home first', async () => {
    const nombres = await page.getByRole('tablist').last().getByRole('tab').allInnerTexts()
    expect(nombres.map(n => n.trim())).toEqual(['HOME', 'PROVIDERS', 'GRAPH', 'PERFORMANCE', 'PLUGINS', 'EXTENSIONS', 'ROUTES', 'DCE', 'LOG', 'PREVIOUS LOG'])
})

test('🔴 the filter is always there, and only ENABLED on the tabs that are lists', async () => {
    // It must not come and go: a box that disappears moves everything next to it.
    const filtro = page.getByPlaceholder('Filter…')
    for (const tab of ['Home', 'Graph', 'Performance']) {
        await page.getByRole('tab', { name: tab, exact: true }).click()
        await expect(filtro, `the filter disappears on ${tab}`).toBeVisible()
        await expect(filtro, `the filter can be typed into on ${tab}`).toBeDisabled()
    }
    await page.getByRole('tab', { name: 'Providers', exact: true }).click()
    await expect(filtro).toBeEnabled()
})

// ── Plugins (v2, S4) ───────────────────────────────────────────────────────────

// One line per plugin: the cells by column.
const pluginRows = () => page.locator('table tbody tr').evaluateAll(rows => rows.map(r => {
    const td = r.querySelectorAll('td')
    return {
        label: r.getAttribute('aria-label') ?? '',
        name: (td[0]?.querySelector('p')?.textContent ?? '').trim(),
        version: (td[1]?.textContent ?? '').trim(),
        state: (td[2]?.querySelector('.MuiChip-label')?.textContent ?? '').trim(),
        instances: (td[3]?.textContent ?? '').trim(),
        connections: (td[4]?.textContent ?? '').trim(),
        source: (td[5]?.textContent ?? '').trim()
    }
}))

test('🔴 the Plugins tab lists the dev plugins, and Status reports ITSELF with real figures', async () => {
    await page.getByRole('tab', { name: 'Plugins', exact: true }).click()
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 })
    const rows = await pluginRows()
    const status = rows.find(r => r.label === 'Plugin status')
    test.skip(!status, 'this Kwirth does not run the Status plugin from kwirth-dev.json')
    // This very tab is one open instance of Status, over at least one connection.
    expect(status).toMatchObject({ name: 'Kwirth Status', state: 'Running', source: 'dev' })
    expect(status!.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(Number(status!.instances), 'instances of Status').toBeGreaterThanOrEqual(1)
    expect(Number(status!.connections), 'connections of Status').toBeGreaterThanOrEqual(1)
    expect(Number(status!.connections)).toBeLessThanOrEqual(Number(status!.instances))
})

test('🔴 a plugin whose channel does not report shows a dash, never a zero', async () => {
    /*
        Not tied to one plugin: which ones report changes as they are updated (B7 — nettools did, mid-way).
        What must hold is that the header and the rows agree: "M not reporting" is exactly the running rows
        with a dash in BOTH columns, and a dash never sits next to a number.
    */
    const rows = await pluginRows()
    const header = await page.getByText(/^\d+ not reporting$/).textContent().catch(() => null)
    const declared = header ? Number(header.split(' ')[0]) : 0
    const dashed = rows.filter(r => r.state === 'Running' && r.instances === '—')
    test.skip(declared === 0, 'every running plugin in this Kwirth reports its instances: no dash to check')
    expect(dashed.length, 'running rows with a dash vs the header').toBe(declared)
    for (const r of rows) {
        expect(r.instances === '—', `${r.label}: a dash on one column and a number on the other`).toBe(r.connections === '—')
    }
})

test('every state is one of the four, and figures are counts or a dash', async () => {
    const rows = await pluginRows()
    expect(rows.length).toBeGreaterThan(1)
    for (const r of rows) {
        expect(['Running', 'Remote', 'Not started', 'Failed'], `state of ${r.label}`).toContain(r.state)
        expect(r.instances, `instances of ${r.label}`).toMatch(/^(\d+|—)$/)
        expect(r.connections, `connections of ${r.label}`).toMatch(/^(\d+|—)$/)
    }
})

test('the Plugins header and the Home box count exactly what the tab lists', async () => {
    const rows = await pluginRows()
    const instances = rows.reduce((n, r) => n + (/^\d+$/.test(r.instances) ? Number(r.instances) : 0), 0)
    await expect(page.getByText(new RegExp(`^${rows.length} plugins?:$`))).toBeVisible()
    await expect(page.getByText(new RegExp(`^${instances} instances? open$`))).toBeVisible()
    await tab('Home').click()
    await expect(box('Plugins')).toContainText(`${rows.length} plugin${rows.length === 1 ? '' : 's'}`)
    await expect(box('Plugins')).toContainText(`${instances} instance${instances === 1 ? '' : 's'} open`)
    await tab('Plugins').click()
})

test('🔴 filtering does not move the Plugins columns', async () => {
    /*
        Two causes, both seen by the user: the automatic table layout (each column sized to the rows on
        screen), and the vertical scrollbar coming and going with the number of rows — the table lost or
        gained its width. The scrollbar room is now always kept ('scrollbar-gutter: stable').
    */
    const box = page.locator('[aria-label="Tab content"]')
    await expect(box).toHaveCSS('scrollbar-gutter', 'stable')
    const medida = async () => ({
        columns: await page.locator('table thead th').evaluateAll(ths => ths.map(th => Math.round(th.getBoundingClientRect().width))),
        table: await page.locator('table').first().evaluate(t => Math.round(t.getBoundingClientRect().width))
    })
    const antes = await medida()
    const filtro = page.getByPlaceholder('Filter…')
    for (const texto of ['k', 'kwirth status', 'net', 'zzz-nothing']) {
        await filtro.fill(texto)
        await page.waitForTimeout(300)
        const gutter = await box.evaluate(e => e.offsetWidth - e.clientWidth)
        expect(await medida(), `columns or table moved with filter '${texto}' (scrollbar room: ${gutter}px)`).toEqual(antes)
    }
    await filtro.fill('')
})

test('the filter narrows the plugins by name and by state', async () => {
    const filtro = page.getByPlaceholder('Filter…')
    await expect(filtro).toBeEnabled()
    await filtro.fill('kwirth status')
    await expect(async () => {
        expect((await pluginRows()).map(r => r.label)).toEqual(['Plugin status'])
    }).toPass({ timeout: 10000 })
    await filtro.fill('running')
    await expect(async () => {
        const rows = await pluginRows()
        expect(rows.length).toBeGreaterThan(0)
        expect(rows.every(r => r.state === 'Running')).toBe(true)
    }).toPass({ timeout: 10000 })
    await filtro.fill('')
})

// ── Performance (v2 S2) ────────────────────────────────────────────────────────

// By its own aria-label: the charts below have titles like 'CPU' too.
const figure = (label: string) => page.locator(`[aria-label="${label} figure"]`)

test('🔴 Performance shows the Kwirth process with real VALUES', async () => {
    await page.getByRole('tab', { name: 'Performance', exact: true }).click()
    // Values, not just labels: an 'MB' figure above zero, a heap as used / reserved, an uptime.
    const rss = (await figure('Memory (RSS)').innerText()).match(/(\d+) MB/)
    expect(rss, 'no RSS in MB').not.toBeNull()
    expect(Number(rss![1])).toBeGreaterThan(0)
    expect(await figure('JS heap').innerText()).toMatch(/\d+ MB \/ \d+ MB/)
    expect(await figure('Uptime').innerText()).toMatch(/\d+(s|m|h|d)/)
    expect(await figure('Uptime').innerText()).toMatch(/pid \d+ · Node v\d+/)
})

test('the five figures are as tall as asked, and all the same height', async () => {
    // ~78px of content, +30% (102px) and then +25% on top (128px), both asked for by the user.
    const alturas = await page.locator('[aria-label$=" figure"]').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))
    expect(alturas.length).toBe(5)
    for (const h of alturas) expect(h, `a figure is ${h}px tall`).toBeGreaterThanOrEqual(127)
    expect(Math.max(...alturas) - Math.min(...alturas), 'figures of different heights').toBeLessThanOrEqual(1)
})

test('🔴 CPU and charts need TWO snapshots: before that they say so, after it they show', async () => {
    // Taking snapshots until there are two in this channel is what makes a rate and a line possible.
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    await page.waitForTimeout(1500)
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    await expect(async () => {
        expect(await figure('CPU').innerText()).toMatch(/\d+\.\d %/)
    }).toPass({ timeout: 15000 })
    await expect(page.locator('.recharts-line').first()).toBeVisible({ timeout: 15000 })
    // Session, not history: the page says how many snapshots it holds and that nothing is kept.
    await expect(page.getByText(/\d+ snapshots since this channel started, kept only in this browser/)).toBeVisible()
})

test('the event loop is measured once somebody has been looking', async () => {
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    await expect(async () => {
        expect(await figure('Event loop delay (p99)').innerText()).toMatch(/\d+\.\d ms/)
    }).toPass({ timeout: 15000 })
    await page.getByRole('tab', { name: 'Providers', exact: true }).click()
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

// ── Routes (v2) ────────────────────────────────────────────────────────────────

// One line per path: its path (without the 'collision' chip), the labels of its method chips, its owner.
const routeRows = () => page.locator('table tbody tr').evaluateAll(rows => rows.map(r => {
    const td = r.querySelectorAll('td')
    return {
        path: (td[0]?.querySelector('p')?.textContent ?? '').trim(),
        methods: [...(td[1]?.querySelectorAll('.MuiChip-label') ?? [])].map(c => (c.textContent ?? '').trim()),
        owner: (td[2]?.textContent ?? '').trim()
    }
}))

test('🔴 Routes lists the core API with real paths, methods and owners', async () => {
    await page.getByRole('tab', { name: 'Routes', exact: true }).click()
    const rows = await routeRows()
    expect(rows.length, 'no routes listed').toBeGreaterThan(10)
    // VALUES, not presence: routes this Kwirth certainly publishes, each with its method and owner.
    expect(rows.some(r => r.methods.includes('GET') && /\/config\/info$/.test(r.path) && /^Core config/.test(r.owner)), 'GET …/config/info from Core config').toBe(true)
    expect(rows.some(r => /\/core\/providers\//.test(r.path) && /^Core providers/.test(r.owner)), 'the providers manager API').toBe(true)
    expect(rows.some(r => r.path === '/healthz' && r.methods.join(',') === 'GET'), 'GET /healthz').toBe(true)
    for (const r of rows) {
        // Every method a real verb, each once; ALL only when it is ALL the route has (it is middleware otherwise).
        for (const m of r.methods) expect(m).toMatch(/^(GET|POST|PUT|PATCH|DELETE|ALL|OPTIONS|HEAD)$/)
        expect(new Set(r.methods).size, `repeated method on ${r.path}`).toBe(r.methods.length)
        if (r.methods.includes('ALL')) expect(r.methods, `ALL next to other methods on ${r.path}`).toEqual(['ALL'])
        expect(r.path.startsWith('/'), `relative path ${r.path}`).toBe(true)
    }
})

test('🔴 ONE line per path and owner: no path repeated for the same owner', async () => {
    const rows = await routeRows()
    const keys = rows.map(r => `${r.owner} ${r.path}`)
    expect(keys.length - new Set(keys).size, 'lines that should have been one').toBe(0)
})

test('🔴 the path column is readable: a line fits in one row, not a letter per line', async () => {
    // What went wrong once: the methods cell took the whole width and the path wrapped letter by letter.
    const alturas = await page.locator('table tbody tr').evaluateAll(rows => rows.slice(0, 20).map(r => r.getBoundingClientRect().height))
    expect(Math.max(...alturas), 'a route line is taller than two text lines').toBeLessThan(80)
})

test('🔴 routes are PATTERNS: the webhook receiver shows :token, never a token', async () => {
    const rows = await routeRows()
    const webhook = rows.find(r => /\/webhook\//.test(r.path))
    expect(webhook, 'the webhook receiver is not listed').toBeDefined()
    expect(webhook!.path).toMatch(/\/webhook\/:provider\/:token$/)
})

test('the header counts paths (lines) and routes (methods), and says how many each owner published', async () => {
    const rows = await routeRows()
    const metodos = rows.reduce((n, r) => n + r.methods.length, 0)
    await expect(page.getByText(new RegExp(`^${rows.length} paths · ${metodos} routes:$`))).toBeVisible()
    await expect(page.getByText(/^\d+ Core$/)).toBeVisible()
})

test('the filter narrows the routes by path and by method', async () => {
    const filtro = page.getByPlaceholder('Filter…')
    await expect(filtro).toBeEnabled()
    await filtro.fill('healthz')
    await expect(async () => {
        const rows = await routeRows()
        expect(rows.length).toBeGreaterThan(0)
        expect(rows.every(r => r.path.includes('healthz'))).toBe(true)
    }).toPass({ timeout: 10000 })
    await filtro.fill('delete')
    await expect(async () => {
        const rows = await routeRows()
        expect(rows.length).toBeGreaterThan(0)
        // Every line that is left answers DELETE — shown with all its methods, not only that one.
        expect(rows.every(r => r.methods.includes('DELETE'))).toBe(true)
    }).toPass({ timeout: 10000 })
    await filtro.fill('')
})

test('the Routes box on Home counts exactly what the Routes tab lists', async () => {
    // Routes, not lines: one per method, the same figure the tab's header gives.
    const total = (await routeRows()).reduce((n, r) => n + r.methods.length, 0)
    await page.getByRole('tab', { name: 'Home', exact: true }).click()
    await expect(box('Routes')).toContainText(`${total} routes`)
    await page.getByRole('tab', { name: 'Providers', exact: true }).click()
})

// ── DCE (v2) ───────────────────────────────────────────────────────────────────

// One line per DCE: the cells by column, the consumer chips by label.
const dceRows = () => page.locator('table tbody tr').evaluateAll(rows => rows.map(r => {
    const td = r.querySelectorAll('td')
    return {
        label: r.getAttribute('aria-label') ?? '',
        name: (td[0]?.querySelector('p')?.textContent ?? '').trim(),
        version: (td[1]?.textContent ?? '').trim(),
        back: (td[2]?.querySelector('.MuiChip-label, p')?.textContent ?? '').trim(),
        front: (td[3]?.querySelector('.MuiChip-label, p')?.textContent ?? '').trim(),
        source: (td[4]?.textContent ?? '').trim(),
        consumers: [...(td[5]?.querySelectorAll('.MuiChip-label') ?? [])].map(c => (c.textContent ?? '').trim())
    }
}))

test('🔴 the DCE tab lists the dev DCEs with their REAL version, state and consumers', async () => {
    await tab('DCE').click()
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 15000 })
    const rows = await dceRows()
    // kwirth-dev.json declares 'nettools' and 'sample', and the plugins that require each one.
    const nettools = rows.find(r => r.label === 'DCE nettools')
    const sample = rows.find(r => r.label === 'DCE sample')
    test.skip(!nettools || !sample, 'this Kwirth does not run the dev DCEs nettools and sample')
    expect(nettools).toMatchObject({ name: 'Net Tools', version: '0.2.0', source: 'dev', consumers: ['plugin nettools'] })
    expect(sample).toMatchObject({ name: 'Sample DCE', version: '0.1.0', source: 'dev', consumers: ['plugin dce-consumer'] })
    // Both have a back end that loaded in the core.
    expect(nettools!.back).toBe('Loaded')
    expect(sample!.back).toBe('Loaded')
})

test('🔴 the front half is read from THIS page: what the tab says is what the page loaded', async () => {
    const rows = await dceRows()
    const nettools = rows.find(r => r.label === 'DCE nettools')
    const sample = rows.find(r => r.label === 'DCE sample')
    test.skip(!nettools || !sample, 'this Kwirth does not run the dev DCEs nettools and sample')
    const registry = await page.evaluate(() => {
        const r = (window as unknown as Record<string, Record<string, { state: string }> | undefined>)['__kwirth_dce__'] ?? {}
        return Object.fromEntries(Object.entries(r).map(([id, e]) => [id, e.state]))
    })
    // Both dev DCEs ship a front.js: the core's front loaded them into this page before any plugin.
    expect(registry).toMatchObject({ nettools: 'loaded', sample: 'loaded' })
    expect(nettools!.front).toBe('Loaded')
    expect(sample!.front).toBe('Loaded')
})

test('the header counts DCEs and distinct consumers', async () => {
    const rows = await dceRows()
    const consumers = new Set(rows.flatMap(r => r.consumers)).size
    await expect(page.getByText(new RegExp(`^${rows.length} DCEs?:$`))).toBeVisible()
    await expect(page.getByText(new RegExp(`^${consumers} consumers?$`))).toBeVisible()
})

test('the filter narrows the DCEs by id and by consumer', async () => {
    const filtro = page.getByPlaceholder('Filter…')
    await expect(filtro).toBeEnabled()
    await filtro.fill('dce-consumer')
    await expect(async () => {
        const rows = await dceRows()
        expect(rows.map(r => r.label)).toEqual(['DCE sample'])
    }).toPass({ timeout: 10000 })
    await filtro.fill('')
})

test('the DCE box on Home counts exactly what the DCE tab lists', async () => {
    const rows = await dceRows()
    const consumers = new Set(rows.flatMap(r => r.consumers)).size
    await tab('Home').click()
    await expect(box('DCE')).toContainText(`${rows.length} DCE${rows.length === 1 ? '' : 's'}`)
    await expect(box('DCE')).toContainText(`${consumers} consumer${consumers === 1 ? '' : 's'}`)
    await tab('Providers').click()
})

// ── Log and Previous log (v2, moved from the About dialog) ─────────────────────

interface ICoreLogBody {
    lines: string[]
    unavailableReason?: string
}

interface IPreviousLogBody {
    restarted: boolean
    abnormal: boolean
    restartCount: number
    lines: string[]
    unavailableReason?: string
}

test('🔴 the Log tab asks the core and it answers its contract', async () => {
    // The e2e user is an admin: it cannot get a 403. The request goes out when the tab is OPENED.
    const responsePromise = page.waitForResponse(r => r.url().includes('/managekwirth/log'), { timeout: 15000 })
    await page.getByRole('tab', { name: 'Log', exact: true }).click()
    const response = await responsePromise
    expect(response.status()).toBe(200)
    const body = await response.json() as ICoreLogBody
    expect(Array.isArray(body.lines)).toBeTruthy()
    // With no lines there has to be a written reason: an empty viewer is what makes one think there is no log.
    if (body.lines.length === 0) expect(typeof body.unavailableReason).toBe('string')
})

test('🔴 the Log tab paints the log and does not leak the ANSI escapes', async () => {
    const responsePromise = page.waitForResponse(r => r.url().includes('/managekwirth/log'), { timeout: 15000 })
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    const body = await (await responsePromise).json() as ICoreLogBody

    /*
        🔴 SKIPPED, not passed, when there is nothing to paint. A development kwirth runs from source, NOT as
        a pod, so the core answers with a reason — which the tab has to show, centred like every empty state.
    */
    if (body.lines.length === 0) {
        await expect(page.locator('[aria-label="Log message"]')).toContainText(body.unavailableReason!)
    }
    test.skip(body.lines.length === 0, 'this kwirth does not run as a pod: there is no log to paint')

    await expect(page.getByText(new RegExp(`^Last ${body.lines.length} lines of the container running now`))).toBeVisible()
    // The escape character must not survive to the DOM (looked for by its code point, never by '[36m').
    const painted = await page.locator('[aria-label="Log lines"] pre').innerText()
    expect(painted.includes('\x1b'), 'the ANSI escapes are reaching the screen as text').toBeFalsy()
})

test('🔴 the Previous log tab tells the states apart, as the core says them', async () => {
    const responsePromise = page.waitForResponse(r => r.url().includes('/managekwirth/previouslog'), { timeout: 15000 })
    await page.getByRole('tab', { name: 'Previous log', exact: true }).click()
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    const response = await responsePromise
    expect(response.status()).toBe(200)
    const body = await response.json() as IPreviousLogBody
    expect(typeof body.restarted).toBe('boolean')
    expect(typeof body.abnormal).toBe('boolean')
    expect(Array.isArray(body.lines)).toBeTruthy()

    if (!body.restarted) {
        // No restart: neither an abnormal exit nor lines, and the tab says so in words.
        expect(body.abnormal).toBe(false)
        expect(body.lines.length).toBe(0)
        await expect(page.locator('[aria-label="Log message"]')).toContainText('No previous log')
    }
    else if (body.lines.length === 0) {
        // Restarted with nothing to show: said centred, with how it ended.
        await expect(page.locator('[aria-label="Log message"]')).toContainText(`Restarts: ${body.restartCount}`)
    }
    else {
        await expect(page.getByText(new RegExp(`Restarts: ${body.restartCount}`))).toBeVisible()
        await expect(page.locator('[aria-label="Log lines"]')).toBeVisible()
    }
})

test('🔴 the empty states of both log tabs look the SAME: centred across and down', async () => {
    // Asked for after seeing them differ: one centred in the middle, the other left and at the top.
    const posicion = async () => page.locator('[aria-label="Log message"]').evaluate(el => {
        const r = el.getBoundingClientRect()
        const t = getComputedStyle(el)
        return { justify: t.justifyContent, align: t.alignItems, textAlign: t.textAlign, height: r.height }
    })
    const previa = await page.locator('[aria-label="Log message"]').count() > 0 ? await posicion() : undefined
    await page.getByRole('tab', { name: 'Log', exact: true }).click()
    await page.waitForTimeout(1500)
    const actual = await page.locator('[aria-label="Log message"]').count() > 0 ? await posicion() : undefined
    test.skip(!previa || !actual, 'one of the two tabs has lines to show: there are not two empty states to compare')
    expect(actual).toEqual(previa)
    expect(actual!.justify).toBe('center')
    expect(actual!.align).toBe('center')
    await page.getByRole('tab', { name: 'Providers', exact: true }).click()
})

test('the Home says whether Kwirth restarted, from the same answer the tab shows', async () => {
    const responsePromise = page.waitForResponse(r => r.url().includes('/managekwirth/previouslog'), { timeout: 15000 })
    await page.getByRole('tab', { name: 'Home', exact: true }).click()
    await page.locator('button[aria-label="Take a new snapshot"]').click()
    const body = await (await responsePromise).json() as IPreviousLogBody
    await expect(box('Previous log')).toContainText(body.restarted ? `${body.restartCount} restart` : 'No restarts')
    await page.getByRole('tab', { name: 'Providers', exact: true }).click()
})
