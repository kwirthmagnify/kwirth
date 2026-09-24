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

test('🔴 si hay consumo, o se dibuja o se dice por que no se puede dibujar', async () => {
    /*
        El invariante que faltaba, y el que se rompio de verdad: la tabla y el grafo no pueden decir
        cosas distintas. Si algun productor reconoce consumidores, el grafo NO puede limitarse a
        "nothing is subscribed to anything" — o ensena las aristas, o explica que esas suscripciones
        se hicieron sin pasar por el core y por eso no sabe quienes son.

        Se cruza lo que ve el usuario en las dos vistas, no el estado interno: asi el test sigue
        valiendo aunque cambie de donde sale cada numero.
    */
    await page.locator('button[aria-label="Table view"]').click()
    await expect(page.getByRole('columnheader', { name: 'Why', exact: true })).toBeVisible()

    const filas = page.locator('table tbody tr')
    let consumo = 0
    for (let i = 0; i < await filas.count(); i++) {
        const celda = (await filas.nth(i).locator('td').nth(3).innerText()).trim()
        if (/^[0-9]+$/.test(celda)) consumo += Number(celda)
    }

    await page.locator('button[aria-label="Graph view"]').click()
    if (consumo === 0) return   // sin consumo, "no hay nada que dibujar" es la verdad

    await page.waitForTimeout(1500)   // el layout es asincrono
    const aristas = await page.locator('.react-flow__edge').count()
    if (aristas > 0) return

    await expect(
        page.getByText(/subscribed straight to the provider/),
        `${consumo} consumidores en la tabla y el grafo no dibuja ni explica nada`
    ).toBeVisible()
})
