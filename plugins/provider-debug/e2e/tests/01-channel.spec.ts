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
    await page?.close()
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

    await expect(page.getByText("Subscribed to provider 'metrics'")).toBeVisible()
    await expect(page.getByText('Provider: metrics')).toBeVisible()
    await eventsArrived()
})

test('each event is collapsed behind a summary and expands to its raw JSON', async () => {
    // el resumen del acordeón enseña las claves de primer nivel sin desplegar
    const summary = page.getByRole('button').filter({ hasText: 'metricsInterval' }).first()
    await expect(summary).toBeVisible()

    await summary.click()

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

test('the clear button empties the captured events', async () => {
    await expect(page.getByRole('button', { name: 'Clear captured events' })).toBeEnabled()

    await page.getByRole('button', { name: 'Clear captured events' }).click()

    await expect(page.getByText('Events: 0 / 200')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Clear captured events' })).toBeDisabled()
})
