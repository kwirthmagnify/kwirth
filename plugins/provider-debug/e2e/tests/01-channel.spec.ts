import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'

/**
 * Serial y con UNA sola página para todo el fichero. El coste dominante de este e2e no es
 * Playwright sino recargar la SPA contra el dev server de react-scripts (decenas de segundos por
 * carga), así que abrir una página por test multiplicaba ese coste por el número de tests. Aquí se
 * paga una vez. El precio es que los tests comparten estado y el orden importa: van de "sin
 * arrancar" hacia "arrancado", y el que limpia el buffer va el último.
 */
test.describe.configure({ mode: 'serial' })

// Trace y video apagados: la SPA mantiene el websocket vivo (metrics empuja cada 15 s) y el cierre
// de la pagina se queda colgado finalizando el trace. Las capturas de fallo no se pierden: las
// adjunta el afterEach a mano, porque la pagina se crea fuera de la fixture.
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
})

test.afterAll(async () => {
    // La SPA deja el websocket vivo (metrics empuja cada 15 s) y page.close() se queda colgado
    // finalizando el trace. Se navega fuera para soltar el socket y se cierra el CONTEXTO, que no
    // espera al cierre ordenado de la pagina.
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

// La página se crea a mano, así que Playwright no le adjunta capturas solo: se hace aquí.
test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

// El canal declara requirements.setup = true, así que "Start" abre primero el diálogo de setup
// (front/src/App.tsx:1337, onClickChannelStart) y el canal arranca al aceptarlo.
/**
 * Abre el setup. Si el canal ya está arrancado hay que pararlo primero: el menú deshabilita Start
 * mientras corre, así que reconfigurar es siempre Stop -> Start (es el flujo real del plugin, con
 * modifiable: false).
 */
const openSetup = async (): Promise<void> => {
    const stopped = await page.getByText(/Provider Debug not started/).isVisible().catch(() => false)
    if (!stopped) {
        await openTabMenu(page)
        await page.getByText('Stop', { exact: true }).click()
        await page.waitForTimeout(1200)
    }
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await expect(page.getByText('Configure Provider Debug channel')).toBeVisible()
}

// Por rol y no por label: el título del diálogo ("Configure Provider Debug channel") también casa
// con getByLabel('Provider') y rompe el modo estricto.
const providerSelect = () => page.getByRole('combobox', { name: 'Provider', exact: true })

/** Cierra el desplegable abierto y, si el diálogo sigue vivo, lo cancela. */
const closeSetup = async (): Promise<void> => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const cancel = page.getByRole('button', { name: 'CANCEL' })
    if (await cancel.isVisible().catch(() => false)) await cancel.click()
    await page.waitForTimeout(400)
}

/** Selecciona un provider de la Select (MUI pinta cada opción con data-value). */
const selectProvider = async (providerId: string): Promise<void> => {
    await providerSelect().click()
    await page.locator(`li[data-value="${providerId}"]`).click()
}

const startWith = async (providerId: string, payload = ''): Promise<void> => {
    await openSetup()
    if (providerId) await selectProvider(providerId)
    if (payload) await page.getByLabel('Subscription payload (JSON)').fill(payload)
    await page.getByRole('button', { name: 'OK' }).click()
    await page.waitForTimeout(2500)
}

/** Chip de hito del arranque ('config' / 'subscribed'), por texto exacto de su etiqueta. */
const statusChip = (label: string) => page.locator('.MuiChip-root').filter({ hasText: new RegExp('^' + label + '$') }).first()

const METRICS_PAYLOAD = '{"pod":true,"container":true,"machine":true}'
const eventsArrived = () => expect(page.getByText(/Events: [1-9]\d* \/ 200/)).toBeVisible({ timeout: 90000 })

test('the tab explains that the channel must be started', async () => {
    await expect(page.getByText(/Provider Debug not started\. Start the channel/)).toBeVisible()
})


// GET /core/providers es la vista completa del core, así que todo lo de la Select (ids, estado y
// ayuda) está disponible SIN haber arrancado el canal ni una vez. Estos tests van antes del primer
// Start a propósito: si alguien vuelve a atar la Select al catálogo por websocket, se ponen rojos.
test('before any start the select offers installed and core providers, already flagged', async () => {
    await openSetup()
    await providerSelect().click()

    // instalados
    await expect(page.locator('li[data-value="kafka"]')).toBeVisible()
    await expect(page.locator('li[data-value="otel"]')).toBeVisible()
    // de core: no son extensiones, los sirve el mismo endpoint marcados como core
    await expect(page.locator('li[data-value="events"]')).toBeVisible()
    await expect(page.locator('li[data-value="metrics"]')).toBeVisible()
    // y el estado ya viene resuelto, sin arrancar nada
    await expect(page.locator('li[data-value="kafka"]')).toContainText('not running')
    await expect(page.locator('li[data-value="metrics"]')).not.toContainText('not running')
    await expect(page.getByText(/Only the ones marked as running can be subscribed to/)).toBeVisible()

    await closeSetup()
})

test('a provider that publishes help explains itself and enables the form', async () => {
    await openSetup()
    await selectProvider('events')

    // EventsProvider.getSubscriptionHelp(): usage + example + fields
    await expect(page.getByText(/Strict opt-in/)).toBeVisible()
    await expect(page.getByText(/Subscribing/)).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Form' })).toBeEnabled()

    await closeSetup()
})

test('the example button fills the payload', async () => {
    await openSetup()
    await selectProvider('metrics')

    // MetricsProvider publica usage + example, sin fields: el formulario no aplica
    await expect(page.getByText(/Pushes on its own clock/)).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Form' })).toBeDisabled()

    await page.getByRole('button', { name: 'USE EXAMPLE' }).click()

    await expect(page.getByLabel('Subscription payload (JSON)')).toHaveValue(/"pod": true/)
    await closeSetup()
})

test('the generated form writes into the payload', async () => {
    await openSetup()
    await selectProvider('events')
    await page.getByLabel(/^kinds/).fill('Pod, Event')

    await page.getByRole('tab', { name: 'JSON' }).click()

    await expect(page.getByLabel('Subscription payload (JSON)')).toHaveValue(/"kinds"/)
    await expect(page.getByLabel('Subscription payload (JSON)')).toHaveValue(/"Event"/)
    await closeSetup()
})

test('a provider without help says so instead of leaving the user guessing', async () => {
    await openSetup()
    await selectProvider('otel')

    await expect(page.getByText(/does not publish subscription help/)).toBeVisible()
    await closeSetup()
})

test('starting without a provider lists the providers currently running', async () => {
    await startWith('')

    await expect(page.getByText('Running providers')).toBeVisible()
    await expect(page.getByText('events', { exact: true })).toBeVisible()
    await expect(page.getByText('metrics', { exact: true })).toBeVisible()
    await expect(page.getByText('Provider: (none)')).toBeVisible()
    await expect(page.getByText('Events: 0 / 200')).toBeVisible()
})

test('a provider that is not running is reported instead of failing silently', async () => {
    await startWith('kafka')

    await expect(page.getByText("Provider 'kafka' is not running")).toBeVisible()
    await expect(page.getByText('Events: 0 / 200')).toBeVisible()
})

test('a malformed subscription payload blocks the dialog instead of reaching the back', async () => {
    await openSetup()
    await selectProvider('otel')
    await page.getByLabel('Subscription payload (JSON)').fill('{ not json')

    await expect(page.getByText('Not valid JSON')).toBeVisible()
    await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled()

    await page.getByRole('button', { name: 'CANCEL' }).click()
})

test('subscribing to a running provider is confirmed and streams its raw events', async () => {
    // 'metrics' es el provider determinista del core: su tick empuja a TODOS sus subscribers cada
    // metricsInterval (15 s por defecto), sin filtro, así que el tráfico no depende de la actividad
    // del cluster (back/src/providers/metrics/MetricsProvider.ts, tick()).
    await startWith('metrics', METRICS_PAYLOAD)

    await expect(statusChip('subscribed')).toHaveClass(/MuiChip-filledSuccess/)
    await expect(page.getByText('Provider: metrics')).toBeVisible()
    await eventsArrived()
})

test('the start milestones are chips, not text lines', async () => {
    // los dos hitos se encienden en verde...
    await expect(statusChip('config')).toHaveClass(/MuiChip-filledSuccess/)
    await expect(statusChip('subscribed')).toHaveClass(/MuiChip-filledSuccess/)

    // ...y sus antiguas lineas *** ... *** ya no se pintan
    await expect(page.getByText(/^\*\*\* .* \*\*\*$/)).toHaveCount(0)
})

test('each event is collapsed behind a summary and expands to its raw JSON', async () => {
    // el resumen enseña las claves de primer nivel sin desplegar
    await expect(page.getByText(/metricsInterval, cluster/).first()).toBeVisible()

    await page.locator('button[aria-label="Expand event"]').first().click()

    await expect(page.getByText('"metricsInterval"').first()).toBeVisible()
})

test('each event can be copied without collapsing its card', async () => {
    // writeText() exige documento con foco; sin bringToFront la promesa se rechaza en silencio.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.bringToFront()
    // OJO: por rol NO vale. El AccordionSummary es role="button" y su nombre accesible incluye el
    // aria-label de este botón, así que getByRole casaba con la cabecera y solo plegaba la tarjeta.
    const copyButton = page.locator('button[aria-label="Copy event JSON"]').first()
    await expect(copyButton).toBeVisible()

    await copyButton.click()

    // se asserta el contenido real del portapapeles, no el tick visual de "copiado": ese solo dura
    // 1,5 s y compite con los repintados del stream de eventos.
    await expect.poll(async () => {
        const text = await page.evaluate(() => navigator.clipboard.readText())
        try { return Object.keys(JSON.parse(text)) }
        catch { return [] }
    }, { timeout: 10000 }).toContain('metricsInterval')
    // el botón vive dentro del summary, así que el click no debe plegar la tarjeta abierta
    await expect(page.getByText('"metricsInterval"').first()).toBeVisible()
})

test('expanding a card is not animated', async () => {
    // Un evento puede traer miles de lineas: animar el despliegue lo deja ilegible mientras crece.
    // MUI vuelca el timeout del Collapse a transition-duration, asi que es asertable de verdad.
    // El detalle se renderiza directamente, sin Collapse de por medio: si el JSON desplegado no
    // cuelga de ningun Collapse, no hay transicion que pueda animarlo. Se comprueba sobre el
    // elemento real en vez de sobre duraciones CSS, que MUI escribe en estilo inline.
    const expand = page.locator('button[aria-label="Expand event"]').first()
    if (await expand.isVisible().catch(() => false)) await expand.click()

    const json = page.getByText('"metricsInterval"').first()
    await expect(json).toBeVisible()

    const insideCollapse = await json.evaluate(el => Boolean(el.closest('.MuiCollapse-root')))
    expect(insideCollapse).toBe(false)
})

test('the match counter sits left of the search box and starts at 0/0', async () => {
    await expect(page.getByText('0/0')).toBeVisible()

    // se comprueba el orden REAL en el DOM, no solo que ambos existan
    const order = await page.evaluate(() => {
        const input = document.querySelector('input[aria-label="Search events"]')
        const counter = [...document.querySelectorAll('span,p')].find(el => el.textContent?.trim() === '0/0')
        if (!input || !counter) return 'falta ' + (!input ? 'input' : 'contador')
        return (counter.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING) ? 'contador-antes' : 'contador-despues'
    })
    expect(order).toBe('contador-antes')
})

test('the search box reports how many events match', async () => {
    await page.getByLabel('Search events').fill('metricsInterval')

    // aun no se ha saltado a ninguna, asi que la posicion es 0 y el total el numero de eventos
    await expect(page.getByText(/^0\/[1-9]\d*$/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next match' })).toBeEnabled()
})

test('a search with no hits disables the navigation', async () => {
    await page.getByLabel('Search events').fill('no-existe-este-texto-en-ningun-evento')

    await expect(page.getByText('0/0')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next match' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Previous match' })).toBeDisabled()
})

test('next and previous walk the matches and open the card', async () => {
    await page.getByLabel('Search events').fill('metricsInterval')
    // se pliega lo que hubiera abierto de tests anteriores, para probar que navegar despliega
    const openCard = page.locator('button[aria-label="Collapse event"]').first()
    if (await openCard.isVisible().catch(() => false)) await openCard.click()

    await page.getByRole('button', { name: 'Next match' }).click()

    await expect(page.getByText(/^1\/[1-9]\d*$/)).toBeVisible()
    // la coincidencia se abre sola: su JSON queda a la vista
    await expect(page.getByText('"metricsInterval"').first()).toBeVisible()

    // previous desde la primera da la vuelta a la ultima
    await page.getByRole('button', { name: 'Previous match' }).click()
    await expect(page.getByText(/^\d+\/\d+$/)).toBeVisible()
})

test('the searched text is highlighted inside the expanded card', async () => {
    await page.getByLabel('Search events').fill('maxPods')
    await page.getByRole('button', { name: 'Next match' }).click()

    // el termino se pinta en video inverso: su span lleva fondo propio, no el transparente heredado
    const marked = page.locator('pre span').filter({ hasText: /^maxPods$/ }).first()
    await expect(marked).toBeVisible()

    const style = await marked.evaluate(el => {
        const s = getComputedStyle(el)
        return { bg: s.backgroundColor, color: s.color }
    })
    expect(style.bg).not.toBe('rgba(0, 0, 0, 0)')
    expect(style.bg).not.toBe(style.color)
})

test('clearing the search empties the box and resets the counter', async () => {
    await page.getByLabel('Search events').fill('metricsInterval')

    await page.getByRole('button', { name: 'Clear search' }).click()

    await expect(page.getByLabel('Search events')).toHaveValue('')
    // el contador no se esconde: se queda en 0/0 para que el hueco no baile
    await expect(page.getByText('0/0')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next match' })).toBeDisabled()
    // el boton de limpiar tampoco desaparece, solo se deshabilita
    await expect(page.getByRole('button', { name: 'Clear search' })).toBeDisabled()
})

test('the clear button empties the captured events', async () => {
    await expect(page.getByRole('button', { name: 'Clear captured events' })).toBeEnabled()

    await page.getByRole('button', { name: 'Clear captured events' }).click()

    await expect(page.getByText('Events: 0 / 200')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Clear captured events' })).toBeDisabled()
})
