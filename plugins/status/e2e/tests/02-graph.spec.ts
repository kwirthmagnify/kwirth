import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'

/*
    El grafo de quién consume a quién (S3).

    Fichero aparte del inventario porque comparten canal pero no tema, y así el de la tabla sigue
    corriendo solo si este se rompe.

    NO destructivo: abre, mira y cierra.
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
    // El layout es asincrono (elk se descarga la primera vez), asi que se espera al resultado.
    await expect(page.locator('.react-flow__node').first()).toBeVisible({ timeout: 30000 })
    expect(await page.locator('.react-flow__node').count()).toBeGreaterThan(1)
    expect(await page.locator('.react-flow__edge').count()).toBeGreaterThan(0)
})

test('los productores quedan ARRIBA y los consumidores DEBAJO', async () => {
    /*
        La disposicion es informacion: el dato cae de arriba abajo. Si el layout se volviera horizontal
        sin querer —cambiar elk.direction es una linea— el diagrama seguiria "funcionando" y diria otra
        cosa distinta, asi que se fija aqui.
    */
    const aristas = page.locator('.react-flow__edge')
    expect(await aristas.count()).toBeGreaterThan(0)

    // De la primera arista se sacan sus dos extremos y se comparan sus alturas.
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
        Sustituye al invariante de S3 ("nada se anima nunca"), que dejo de valer cuando S4 trajo los
        contadores. El que queda es igual de importante: una linea se anima solo si el contador de su
        productor CAMBIO respecto al refresco anterior, asi que recien abierto —cuando solo hay una
        foto— no puede haber ninguna animada. Si la hay, se esta animando sin dato que lo sostenga.
    */
    expect(await page.locator('.react-flow__edge.animated').count(),
        'hay aristas animadas con una sola foto: se esta afirmando actividad sin comparar nada').toBe(0)
})

test('y la pantalla dice que significa una linea, y que significa que se mueva', async () => {
    await expect(page.getByText(/A line means .*active subscription/i)).toBeVisible()
    // lo importante: que se mueva NO dice cuanto va a cada consumidor
    await expect(page.getByText(/not how much goes to each consumer/i)).toBeVisible()
})

test('🔴 el grafo es SOLO VISUALIZACION: no se pueden crear conexiones', async () => {
    /*
        React Flow es un editor de grafos y de serie deja tirar de un nodo para crear una arista. Aqui
        eso no significa nada —la topologia la deciden las suscripciones reales— y ademas sugiere que
        estas cambiando algo. Se comprueba por el atributo que React Flow pone cuando permite conectar.
    */
    const conectables = await page.locator('.react-flow__handle.connectable').count()
    expect(conectables, 'los nodos permiten crear conexiones a mano').toBe(0)
})

test('al seleccionar un nodo se resaltan sus lineas y se atenua el resto', async () => {
    const aristas = page.locator('.react-flow__edge-path')
    const total = await aristas.count()
    expect(total).toBeGreaterThan(0)

    // Sin seleccion, ninguna arista esta atenuada.
    const opacidadesAntes = await aristas.evaluateAll(els => els.map(e => (e as SVGElement).style.opacity))
    expect(opacidadesAntes.every(o => o === '' || o === '1'), 'hay aristas atenuadas sin haber seleccionado nada').toBe(true)

    /*
        Se selecciona un nodo que TENGA aristas, no el primero que haya: en el grafo tambien estan los
        providers sin consumidores (un 'Not started' no tiene ninguna), y clicar uno de esos no resalta
        nada — el test fallaba por elegir mal el sujeto, no por el producto.
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
    // Con una seleccion tiene que haber DOS grupos: lo resaltado y lo apagado.
    // El navegador puede normalizar el ancho como '3' o como '3px' segun como se serialice.
    expect(despues.some(d => d.width === '3px' || d.width === '3'), 'ninguna arista se resalta al seleccionar').toBe(true)
    if (total > 1) expect(despues.some(d => d.opacity === '0.2'), 'no se atenua nada: todo sigue igual de visible').toBe(true)

    // Y el fondo limpia la seleccion.
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

/** Animación CSS que tiene aplicada ahora mismo la primera línea viva, o undefined si no hay ninguna. */
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
    // El menu de MUI entra con animacion: sin esperar, el clic llega a un elemento que aun se mueve.
    await page.waitForTimeout(500)
    await page.getByRole('option', { name: opcion }).click()
}

/** Refresca a mano hasta que haya alguna línea viva: hacen falta dos fotos y que algo haya entregado entre ellas. */
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
        La linea que se mueve cuenta lo que paso en el intervalo. Si siguiera moviendose despues, diria
        "ahora" con un dato que ya es viejo. Por eso con auto-refresco la animacion es UNA sola pasada
        que dura exactamente el intervalo y se queda en su ultimo fotograma (forwards).

        Y tiene que VOLVER A EMPEZAR en cada foto aunque la linea ya estuviera viva: el nombre de la
        animacion alterna entre dos keyframes identicos, que es lo unico que relanza una animacion CSS.
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

    // En la foto siguiente, si sigue viva, la animacion se ha relanzado con el otro nombre.
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
        React Flow esconde (visibility: hidden) todo nodo que recibe como objeto nuevo hasta volver a
        medirlo. Si cada foto regenera los nodos, el grafo entero da un flash en cada refresco aunque no
        haya cambiado nada. Se vigila un ciclo completo de auto-refresco muestreando cada 50 ms.
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
