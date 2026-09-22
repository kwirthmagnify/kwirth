import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL, SAFE_SENDER } from './helpers'

/**
 * Serial y con UNA sola página para todo el fichero. El coste dominante no es Playwright sino
 * recargar la SPA contra el dev server de react-scripts, así que se paga una vez. El precio es que
 * los tests comparten estado y el orden importa: van de "sin arrancar" a "arrancado", y el que
 * limpia el historial va el último.
 *
 * ⛔ Aquí solo se envía por 'console' (ver helpers.ts): un envío de este canal es REAL.
 */
test.describe.configure({ mode: 'serial' })

// Trace y video apagados: la SPA mantiene el websocket vivo y el cierre de la pagina se queda
// colgado finalizando el trace. Las capturas de fallo las adjunta el afterEach a mano.
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
    // navegar fuera suelta el websocket; cerrar el CONTEXTO no espera al cierre ordenado de la pagina
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

const senderSelect = () => page.getByRole('combobox', { name: 'Sender', exact: true })
const configSelect = () => page.getByRole('combobox', { name: 'Configuration', exact: true })
// exact: true SIEMPRE — getByRole casa el nombre accesible por SUBSTRING, y 'SEND' casa tambien con
// el boton 'Reload senders'. Sin el exact, esto resuelve a dos elementos y revienta en modo estricto.
const sendButton = () => page.getByRole('button', { name: 'SEND', exact: true })
const historyRows = () => page.locator('.MuiPaper-root').filter({ hasText: new RegExp(`${SAFE_SENDER} /`) })

/** El canal declara setup, así que Start abre primero el diálogo y el canal arranca al aceptarlo. */
const start = async (): Promise<void> => {
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await expect(page.getByText('Configure Sender Debug channel')).toBeVisible()
    await page.getByRole('button', { name: 'OK' }).click()
    await page.waitForTimeout(2500)
}

/** Elige una opción de una Select de MUI (cada opción lleva su data-value). */
const pick = async (combo: () => ReturnType<typeof page.getByRole>, value: string): Promise<void> => {
    await combo().click()
    await page.locator(`li[data-value="${value}"]`).click()
    await page.waitForTimeout(300)
}

/*
    Elige la PRIMERA configuración que haya, sin nombrarla. Cuántas configuraciones tiene 'console' en
    la máquina de quien corre esto no lo decide el plugin: son datos del entorno. Nombrar una (o dar
    por hecho que hay una sola, y que por tanto se autoselecciona) pone el test rojo el día que
    alguien añade otra — un fallo que no diría nada del canal.
*/
const pickFirstConfig = async (): Promise<string> => {
    await configSelect().click()
    const option = page.locator('li[data-value]:not([data-value=""])').first()
    const value = (await option.getAttribute('data-value')) ?? ''
    await option.click()
    await page.waitForTimeout(300)
    return value
}

test('the tab explains that the channel must be started', async () => {
    await expect(page.getByText('Sender Debug not started', { exact: true })).toBeVisible()
    await expect(page.getByText(/Start the channel .* to pick a sender/)).toBeVisible()
})

test('the setup only configures the channel, and warns that sending is real', async () => {
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await expect(page.getByText('Configure Sender Debug channel')).toBeVisible()
    await expect(page.getByLabel('Max history')).toHaveValue('100')
    await expect(page.getByText(/Sending from this channel is a REAL send/)).toBeVisible()
    // el sender NO se elige aquí: eso es de la pestaña
    await expect(page.getByRole('combobox', { name: 'Sender', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'CANCEL' }).click()
    await page.waitForTimeout(500)
})

test('once started the catalogue arrives and offers the installed senders', async () => {
    await start()
    await expect(page.getByText(/Senders: [1-9]/)).toBeVisible({ timeout: 30000 })
    await senderSelect().click()
    await expect(page.locator(`li[data-value="${SAFE_SENDER}"]`)).toBeVisible()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
})

test('SEND stays disabled until a sender AND a configuration are picked', async () => {
    // sin nada elegido no se puede enviar, y la configuración ni siquiera se puede desplegar
    await expect(sendButton()).toBeDisabled()
    await expect(configSelect()).toHaveAttribute('aria-disabled', 'true')

    await pick(senderSelect, SAFE_SENDER)
    await expect(configSelect()).not.toHaveAttribute('aria-disabled', 'true')
    const configName = await pickFirstConfig()
    expect(configName).not.toEqual('')
    await expect(sendButton()).toBeEnabled()
})

test('invalid metadata blocks the send and says why', async () => {
    await page.getByLabel('Metadata (JSON)').fill('{ not json')
    await expect(page.getByText('Not a valid JSON object')).toBeVisible()
    await expect(sendButton()).toBeDisabled()

    // un array tampoco vale: metadata es un objeto
    await page.getByLabel('Metadata (JSON)').fill('[1,2,3]')
    await expect(sendButton()).toBeDisabled()

    await page.getByLabel('Metadata (JSON)').fill('')
    await expect(sendButton()).toBeEnabled()
})

test('an empty body blocks the send', async () => {
    const body = page.getByLabel('Body')
    const original = await body.inputValue()
    await body.fill('   ')
    await expect(sendButton()).toBeDisabled()
    await body.fill(original)
    await expect(sendButton()).toBeEnabled()
})

test('the batch count only applies in batch mode, and is bounded', async () => {
    const count = page.getByLabel('Messages')
    await expect(count).toBeDisabled()

    await page.getByRole('checkbox', { name: 'Batch' }).check()
    await expect(count).toBeEnabled()

    await count.fill('0')
    await expect(page.getByText('1 to 100')).toBeVisible()
    await expect(sendButton()).toBeDisabled()

    await count.fill('200')
    await expect(sendButton()).toBeDisabled()

    await count.fill('3')
    await expect(sendButton()).toBeEnabled()
    await page.getByRole('checkbox', { name: 'Batch' }).uncheck()
    await expect(count).toBeDisabled()
})

// A partir de aquí se ENVÍA, y solo por 'console': escribe en el log del core y no sale a ninguna
// parte. Ningún otro sender se toca en este fichero.
test('a real send through console lands in the history as delivered', async () => {
    await page.getByLabel('Subject').fill('e2e sender-debug')
    await page.getByLabel('Body').fill('message from the e2e suite')
    await sendButton().click()

    await expect(historyRows().first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByText('delivered', { exact: true }).first()).toBeVisible()
    await expect(page.getByText(/Sends: 1/)).toBeVisible()
})

test('a batch through a sender without sendBatch is delivered and marked as emulated', async () => {
    await page.getByRole('checkbox', { name: 'Batch' }).check()
    await page.getByLabel('Messages').fill('3')
    await sendButton().click()

    // console no implementa sendBatch: el canal entrega uno a uno y lo dice, que es el dato útil
    await expect(page.getByText('batch 3 (emulated)')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(/Sends: 2/)).toBeVisible()
    await page.getByRole('checkbox', { name: 'Batch' }).uncheck()
})

/*
    La fila SIEMPRE se abre, también la de un sender que no devuelve nada — 'console' es de
    notificación pura, que es el caso normal. Lo primero que enseña es el mensaje que se envió: sin
    eso, saber qué contestó el destino obliga a reconstruir de memoria qué se le mandó.
*/
test('a row opens and shows what was sent and what came back', async () => {
    await page.locator('button[aria-label="Expand send"]').first().click()
    await page.waitForTimeout(300)

    await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Answered', { exact: true }).first()).toBeVisible()
    // el cuerpo que se escribió, dentro del JSON del mensaje enviado
    await expect(page.getByText(/"body":/).first()).toBeVisible()
    // y el origen que este canal estampa en todo lo que sale
    await expect(page.getByText(/"source": "sender-debug"/).first()).toBeVisible()
    // console entrega y devuelve void: la respuesta lo dice con todas las letras
    await expect(page.getByText(/The sender returned void/).first()).toBeVisible()

    await page.locator('button[aria-label="Collapse send"]').first().click()
    await page.waitForTimeout(300)
    await expect(page.getByText('Answered', { exact: true })).toHaveCount(0)
})

test('reloading the catalogue keeps the history', async () => {
    await page.locator('button[aria-label="Reload senders"]').click()
    await page.waitForTimeout(1500)
    await expect(page.getByText(/Sends: 2/)).toBeVisible()
    await expect(page.getByText(/Senders: [1-9]/)).toBeVisible()
})

// El último: deja la pestaña limpia.
test('clearing empties the history and disables its own button', async () => {
    const clear = page.locator('button[aria-label="Clear history"]')
    await clear.click()
    await expect(page.getByText(/Sends: 0/)).toBeVisible()
    await expect(historyRows()).toHaveCount(0)
    await expect(clear).toBeDisabled()
})
