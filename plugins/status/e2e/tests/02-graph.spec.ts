import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'

/*
    The graph of who consumes whom (S3).

    A file apart from the inventory because they share a channel but not a subject, and that way the
    table's one goes on running on its own if this one breaks.

    NON-destructive: it opens, looks and closes.
*/

test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    const option = await openChannelPicker(page)
    await expect(option).toHaveText(CHANNEL)
    await option.click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
    await openTabMenu(page)
    const start = page.getByText('Start', { exact: true })
    if (await start.isVisible().catch(() => false)) await start.click()
    else await page.keyboard.press('Escape')
    await expect(page.getByText('What this Kwirth has inside')).toBeVisible({ timeout: 30000 })

    await page.locator('button[aria-label="Graph view"]').click()
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

test('el grafo se dibuja, con nodos y aristas', async () => {
    // The layout is asynchronous (elk is downloaded the first time), so the result is awaited.
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30000 })
    expect(await page.locator('.react-flow__node').count()).toBeGreaterThan(1)
    expect(await page.locator('.react-flow__edge').count()).toBeGreaterThan(0)
})

test('los productores quedan ARRIBA y los consumidores DEBAJO', async () => {
    /*
        The arrangement is information: the data falls from top to bottom. Were the layout to turn
        horizontal by accident — changing elk.direction is one line — the diagram would go on "working"
        and would say something different, so it is pinned down here.
    */
    const aristas = page.locator('.react-flow__edge')
    expect(await aristas.count()).toBeGreaterThan(0)

    // The first edge.s two endpoints are taken and their heights compared.
    const ids = await aristas.first().getAttribute('data-id')
    expect(ids, 'la arista no dice a quien une').toBeTruthy()

    const cajas = await page.locator('.react-flow__node').evaluateAll(nodos =>
        nodos.map(n => ({ id: n.getAttribute('data-id') ?? '', y: n.getBoundingClientRect().top })))
    const productores = cajas.filter(c => !c.id.startsWith('channel:'))
    const consumidores = cajas.filter(c => c.id.startsWith('channel:'))
    expect(productores.length, 'no hay productores en el grafo').toBeGreaterThan(0)
    expect(consumidores.length, 'no hay consumidores en el grafo').toBeGreaterThan(0)

    const masBajoDeArriba = Math.max(...productores.map(p => p.y))
    const masAltoDeAbajo = Math.min(...consumidores.map(c => c.y))
    expect(masAltoDeAbajo, 'los consumidores no estan por debajo de los productores').toBeGreaterThan(masBajoDeArriba)
})

test('🔴 con una sola foto no se anima nada: no hay con que comparar', async () => {
    /*
        It replaces S3's invariant ("nothing is ever animated"), which stopped holding when S4 brought the
        counters. The one that remains is just as important: a line is animated only when its producer's
        counter CHANGED with respect to the previous refresh, so freshly opened — when there is only one
        snapshot — there can be none animated. If there is, something is being animated with no data
        behind it.
    */
    expect(await page.locator('.react-flow__edge.animated').count(),
        'hay aristas animadas con una sola foto: se esta afirmando actividad sin comparar nada').toBe(0)
})

test('y la pantalla dice que significa una linea, y que significa que se mueva', async () => {
    await expect(page.getByText(/A line means .*active subscription/i)).toBeVisible()
    // the point: movement does NOT say how much goes to each consumer
    await expect(page.getByText(/not how much goes to each consumer/i)).toBeVisible()
})

test('🔴 el grafo es SOLO VISUALIZACION: no se pueden crear conexiones', async () => {
    /*
        React Flow is a graph editor and by default it lets you drag from a node to create an edge. Here
        that means nothing — the topology is decided by the real subscriptions — and on top of that it
        suggests you are changing something. It is checked through the attribute React Flow sets when it
        allows connecting.
    */
    const conectables = await page.locator('.react-flow__handle.connectable').count()
    expect(conectables, 'los nodos permiten crear conexiones a mano').toBe(0)
})

test('al seleccionar un nodo se resaltan sus lineas y se atenua el resto', async () => {
    const aristas = page.locator('.react-flow__edge-path')
    const total = await aristas.count()
    expect(total).toBeGreaterThan(0)

    // With no selection, no edge is dimmed.
    const opacidadesAntes = await aristas.evaluateAll(els => els.map(e => (e as SVGElement).style.opacity))
    expect(opacidadesAntes.every(o => o === '' || o === '1'), 'hay aristas atenuadas sin haber seleccionado nada').toBe(true)

    /*
        A node that HAS edges is selected, not the first one around: the graph also holds the providers
        with no consumers (a 'Not started' has none), and clicking one of those highlights nothing — the
        test was failing for picking the wrong subject, not because of the product.
    */
    const origen = await page.locator('.react-flow__edge').first().getAttribute('data-id')
    const idOrigen = (origen ?? '').split('->')[0]
    expect(idOrigen, 'no se pudo deducir el origen de la primera arista').toBeTruthy()
    await page.locator(`.react-flow__node[data-id="${idOrigen}"]`).click()
    await page.waitForTimeout(600)

    const despues = await aristas.evaluateAll(els => els.map(e => ({
        opacity: (e as SVGElement).style.opacity,
        width: (e as SVGElement).style.strokeWidth
    })))
    // With a selection there must be TWO groups: what is highlighted and what is dimmed.
    // The browser may normalise the width as '3' or as '3px' depending on how it serialises.
    expect(despues.some(d => d.width === '3px' || d.width === '3'), 'ninguna arista se resalta al seleccionar').toBe(true)
    if (total > 1) expect(despues.some(d => d.opacity === '0.2'), 'no se atenua nada: todo sigue igual de visible').toBe(true)

    // And the background clears the selection.
    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } })
    await page.waitForTimeout(600)
    const vueltaAtras = await aristas.evaluateAll(els => els.map(e => (e as SVGElement).style.opacity))
    expect(vueltaAtras.every(o => o === '' || o === '1'), 'el clic en el fondo no ha limpiado la seleccion').toBe(true)
})

test('se vuelve a la tabla sin perder nada', async () => {
    await page.locator('button[aria-label="Table view"]').click()
    await expect(page.getByRole('columnheader', { name: 'Why', exact: true })).toBeVisible()
    expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0)
})

test('🔴 if there is consumption, it either draws it or says why it cannot', async () => {
    /*
        The invariant that was missing, and the one that actually broke: the table and the graph
        cannot say different things. If any producer acknowledges consumers, the graph must NOT
        settle for "nothing is subscribed to anything" — it either shows the edges, or explains that
        those subscriptions were made without going through the core and that is why it does not
        know who they are.

        It crosses what the USER sees in both views, not the internal state, so the test keeps its
        value even if where each number comes from changes.
    */
    await page.locator('button[aria-label="Table view"]').click()
    await expect(page.getByRole('columnheader', { name: 'Why', exact: true })).toBeVisible()

    const rows = page.locator('table tbody tr')
    let consumption = 0
    for (let i = 0; i < await rows.count(); i++) {
        const cell = (await rows.nth(i).locator('td').nth(3).innerText()).trim()
        if (/^[0-9]+$/.test(cell)) consumption += Number(cell)
    }

    await page.locator('button[aria-label="Graph view"]').click()
    if (consumption === 0) return   // with no consumption, "nothing to draw" is the truth

    await page.waitForTimeout(1500)   // the layout is asynchronous
    const edges = await page.locator('.react-flow__edge').count()
    if (edges > 0) return

    await expect(
        page.getByText(/subscribed straight to the provider/),
        `${consumption} consumers in the table and the graph neither draws nor explains anything`
    ).toBeVisible()
})

/** The CSS animation currently applied to the first live line, or undefined when there is none. */
interface IAnimacionLinea {
    nombre: string
    duracion: string
    repeticiones: string
    relleno: string
}
const animacionDeLineaViva = async (): Promise<IAnimacionLinea | undefined> => {
    const viva = page.locator('.react-flow__edge.animated path.react-flow__edge-path').first()
    if (await viva.count() === 0) return undefined
    return viva.evaluate(p => {
        const s = getComputedStyle(p)
        return { nombre: s.animationName, duracion: s.animationDuration, repeticiones: s.animationIterationCount, relleno: s.animationFillMode }
    })
}

const elegirRefresco = async (opcion: string): Promise<void> => {
    await page.locator('[aria-label="Auto refresh"]').click()
    // The MUI menu animates in: without waiting, the click lands on an element that is still moving.
    await page.waitForTimeout(500)
    await page.getByRole('option', { name: opcion }).click()
}

/** Refreshes by hand until some line is live: it takes two snapshots with something delivered between them. */
const esperarLineaViva = async (): Promise<IAnimacionLinea> => {
    for (let i = 0; i < 10; i++) {
        await page.locator('button[aria-label="Take a new snapshot"]').click()
        await page.waitForTimeout(2000)
        const a = await animacionDeLineaViva()
        if (a) return a
    }
    throw new Error('en 10 refrescos ningun productor ha entregado nada: no hay linea viva que mirar')
}

test('🔴 con auto-refresco, la linea viva FRENA y se para justo al acabar el intervalo', async () => {
    /*
        The moving line tells what happened in the interval. Were it to go on moving afterwards, it would
        say "now" with data that is already stale. That is why with auto-refresh the animation is ONE
        single pass lasting exactly the interval and staying on its last frame (forwards).

        And it has to START OVER on every snapshot even though the line was already alive: the animation's
        name alternates between two identical keyframes, which is the only thing that relaunches a CSS animation.
    */
    await elegirRefresco('Every 5s')
    let primera: IAnimacionLinea | undefined
    for (let i = 0; i < 12 && !primera; i++) {
        await page.waitForTimeout(1000)
        primera = await animacionDeLineaViva()
    }
    expect(primera, 'con auto-refresco a 5s no ha aparecido ninguna linea viva').toBeTruthy()
    expect(primera!.nombre).toMatch(/^statusFrenada[01]$/)
    expect(primera!.duracion, 'la frenada no dura lo mismo que el intervalo').toBe('5s')
    expect(primera!.repeticiones, 'la animacion se repite: no se para nunca').toBe('1')
    expect(primera!.relleno, 'al acabar vuelve al principio en vez de quedarse parada').toBe('forwards')

    // In the next snapshot, if it is still live, the animation has been relaunched under the other name.
    await page.waitForTimeout(5500)
    const segunda = await animacionDeLineaViva()
    if (segunda) expect(segunda.nombre, 'la foto nueva no ha relanzado el movimiento').not.toBe(primera!.nombre)

    await elegirRefresco('Manual')
})

test('en manual no hay intervalo que agotar: la linea viva se mueve sin parar, como siempre', async () => {
    await expect(page.getByText(/it does not refresh on its own/)).toBeVisible()
    const a = await esperarLineaViva()
    expect(a.nombre, 'en manual la linea viva no usa la animacion de serie de React Flow').toBe('dashdraw')
    expect(a.repeticiones).toBe('infinite')
})

test('🔴 al refrescar el grafo no parpadea: un nodo que no ha cambiado no se vuelve a pintar', async () => {
    /*
        React Flow hides (visibility: hidden) every node it receives as a new object until it measures it
        again. If every snapshot regenerates the nodes, the whole graph flashes on each refresh even when
        nothing has changed. A complete auto-refresh cycle is watched, sampling every 50 ms.
    */
    await elegirRefresco('Every 5s')
    await page.waitForTimeout(1000)
    const escondidos = await page.evaluate(async () => {
        const vistos = new Set<string>()
        const fin = Date.now() + 6500
        while (Date.now() < fin) {
            for (const e of document.querySelectorAll('.react-flow__node')) {
                if (getComputedStyle(e).visibility === 'hidden') vistos.add(e.getAttribute('data-id') ?? '?')
            }
            await new Promise(r => setTimeout(r, 50))
        }
        return [...vistos]
    })
    await elegirRefresco('Manual')
    expect(escondidos, 'estos nodos se han escondido al refrescar: el grafo parpadea').toEqual([])
})

test('🔴 no line goes back up: every producer sits above what consumes it', async () => {
    /*
        A provider can now subscribe to another provider, so the graph has more than two layers: A and
        B on top, C (reading B) below them, and the channels at the bottom. Checked on the REAL
        positions of every drawn line, so it covers whatever chains this Kwirth has.
    */
    await page.locator('button[aria-label="Graph view"]').click()
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(1500)   // layout is async

    const tops = new Map((await page.locator('.react-flow__node').evaluateAll(nodes =>
        nodes.map(n => [n.getAttribute('data-id') ?? '', n.getBoundingClientRect().top] as [string, number]))))
    const ids = await page.locator('.react-flow__edge').evaluateAll(edges => edges.map(e => e.getAttribute('data-id') ?? ''))
    expect(ids.length, 'no lines to check').toBeGreaterThan(0)

    const upwards: string[] = []
    for (const id of ids) {
        const cut = id.indexOf('->')
        const source = id.slice(0, cut)
        const consumer = id.slice(cut + 2)
        // Same rule as the plugin: a provider consumer is the provider's own node.
        const target = consumer.startsWith('provider:') ? consumer.slice('provider:'.length) : `channel:${consumer}`
        const from = tops.get(source)
        const to = tops.get(target)
        if (from === undefined || to === undefined || from >= to) upwards.push(`${id} (${from} -> ${to})`)
    }
    expect(upwards, 'lines that do not go down').toEqual([])
})
