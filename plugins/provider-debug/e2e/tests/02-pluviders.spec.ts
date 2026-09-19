import { test, expect, Page } from '@playwright/test'
import { login, openChannelPicker, openTabMenu, CHANNEL } from './helpers'

/**
 * Depurar PLUVIDERS: plugins que además producen y publican su información in-process. Para quien
 * depura son un productor más —se listan, se suscribe uno y llegan eventos— y eso es justo lo que se
 * verifica aquí, contra el pluvider real de Agora.
 *
 * Serial y con UNA página para todo el fichero, por el mismo motivo que 01-channel: el coste
 * dominante es recargar la SPA contra el dev server, no Playwright.
 */
test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const PLUVIDER = 'plugin:agora'

let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    const option = await openChannelPicker(page)
    await expect(option).toBeVisible()
    await option.click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
})

test.afterAll(async () => {
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

const openSetup = async (): Promise<void> => {
    const stopped = await page.getByText('Provider Debug not started', { exact: true }).isVisible().catch(() => false)
    if (!stopped) {
        await openTabMenu(page)
        await page.getByText('Stop', { exact: true }).click()
        await page.waitForTimeout(1200)
    }
    await openTabMenu(page)
    await page.getByText('Start', { exact: true }).click()
    await expect(page.getByText('Configure Provider Debug channel')).toBeVisible()
}

const providerSelect = () => page.getByRole('combobox', { name: 'Provider', exact: true })

const selectProvider = async (providerId: string): Promise<void> => {
    await providerSelect().click()
    await page.locator(`li[data-value="${providerId}"]`).click()
}

const closeSetup = async (): Promise<void> => {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const cancel = page.getByRole('button', { name: 'CANCEL' })
    if (await cancel.isVisible().catch(() => false)) await cancel.click()
    await page.waitForTimeout(400)
}

test('with no producer chosen the three tabs are disabled', async () => {
    await openSetup()

    // Sin productor no hay nada que describir ni payload que escribir.
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeDisabled()
    await expect(page.getByRole('tab', { name: 'Form' })).toBeDisabled()
    await expect(page.getByRole('tab', { name: 'JSON' })).toBeDisabled()
    await expect(page.getByText(/Pick a provider to see how to subscribe/)).toBeVisible()

    await closeSetup()
})

test('a pluvider is offered in the same list as the providers, marked as coming from a plugin', async () => {
    // GET /core/providers sirve pluviders y providers en la MISMA lista: quien consume no tiene por
    // qué saber que hay dos clases de productor.
    await openSetup()
    await providerSelect().click()

    const option = page.locator(`li[data-value="${PLUVIDER}"]`)
    await expect(option).toBeVisible()
    // el chip dice de dónde sale, y la descripción qué produce
    await expect(option.getByText('plugin', { exact: true })).toBeVisible()
    await expect(option.getByText(/Proactive alerts/)).toBeVisible()
    // está vivo: no lleva la marca de 'not running'
    await expect(option.getByText('not running')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await closeSetup()
})

test('choosing a pluvider opens Overview with the help it publishes', async () => {
    await openSetup()
    await selectProvider(PLUVIDER)

    // Overview es la pestaña que se abre al elegir productor
    await expect(page.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    // el cuadro se titula con el id, para que se vea que lo de dentro es del productor y no del diálogo
    await expect(page.getByText(`Subscription — declared by '${PLUVIDER}'`)).toBeVisible()
    // la ayuda que publica Agora: qué entrega, y las dos advertencias que más despistan
    await expect(page.getByText(/artifacts/)).toBeVisible()
    await expect(page.getByText(/ADMINISTRATOR has enabled/)).toBeVisible()

    await closeSetup()
})

test('USE EXAMPLE fills the payload and lands on the form', async () => {
    await openSetup()
    await selectProvider(PLUVIDER)
    await page.getByRole('button', { name: 'USE EXAMPLE' }).click()

    // salta a donde se sigue trabajando, y el campo declarado por el pluvider está relleno
    await expect(page.getByRole('tab', { name: 'Form' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByLabel(/^alerts/)).toHaveValue(/artifacts/)

    // y el mismo payload está en el JSON: form y JSON editan el MISMO estado
    await page.getByRole('tab', { name: 'JSON' }).click()
    await expect(page.getByLabel('Subscription payload (JSON)')).toHaveValue(/"alerts"/)

    await closeSetup()
})

test('you can go back to Form after JSON', async () => {
    // Regresión: el Tab de Form estaba envuelto en un Tooltip, así que no era hijo directo de Tabs y
    // no recibía su onChange — se salía a JSON y no se podía volver.
    await openSetup()
    await selectProvider(PLUVIDER)

    await page.getByRole('tab', { name: 'JSON' }).click()
    await expect(page.getByLabel('Subscription payload (JSON)')).toBeVisible()

    await page.getByRole('tab', { name: 'Form' }).click()
    await expect(page.getByLabel(/^alerts/)).toBeVisible()

    await closeSetup()
})

test('subscribing to a pluvider is confirmed, the same as to a provider', async () => {
    await openSetup()
    await selectProvider(PLUVIDER)
    await page.getByRole('button', { name: 'OK' }).click()
    await page.waitForTimeout(2500)

    /*
        La suscripción in-process se confirma con el MISMO hito verde que la de un provider: para quien
        depura son lo mismo, que es justo lo que se quiere probar.

        No se espera a que lleguen eventos, a diferencia del test de 'metrics': las alertas de Agora no
        son deterministas —hacen falta un incidente y unas reglas activas—, así que esperarlas sería un
        test que falla por motivos ajenos al pluvider.
    */
    await expect(page.getByText(`Provider: ${PLUVIDER}`)).toBeVisible()
    await expect(page.locator('.MuiChip-root').filter({ hasText: /^subscribed$/ }).first()).toHaveClass(/MuiChip-filledSuccess/)
})
