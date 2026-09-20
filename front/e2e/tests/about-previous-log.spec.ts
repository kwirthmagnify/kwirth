import { test, expect } from '@playwright/test'
import { login, clickMenuItem } from './helpers'

/*
    El About ofrece el log del contenedor ANTERIOR del core.

    Ese log solo existe tras un reinicio dentro del mismo pod, asi que en un entorno sano lo normal es que
    NO haya nada que ver. Eso es justo lo que se comprueba: que el boton esta, que el core responde con el
    contrato que el dialogo consume, y que los dos encajan. Provocar un crash del core para verlo lleno no
    es cosa de un e2e — va en el QA manual.

    ⚠️ No destructivo: solo lee. No reinicia nada ni toca configuracion.
*/

test.describe.configure({ mode: 'serial' })

interface IPreviousLogBody {
    restarted: boolean
    abnormal: boolean
    restartCount: number
    lines: string[]
    container?: string
    unavailableReason?: string
}

test('el About pide el log del contenedor anterior y el core responde con su contrato', async ({ page }) => {
    await login(page)

    // La peticion sale al abrir el dialogo, con la credencial de la propia sesion: interceptarla aqui es
    // lo unico que prueba el camino entero (UI → autorizacion → core) sin montar un accessKey a mano.
    const responsePromise = page.waitForResponse(r => r.url().includes('/managekwirth/previouslog'), { timeout: 15000 })
    await clickMenuItem(page, 'About Kwirth...')

    const response = await responsePromise
    expect(response.status(), 'el usuario del e2e es admin: no puede recibir 403').toBe(200)

    const body = await response.json() as IPreviousLogBody
    // lo que el dialogo consume siempre, haya log o no
    expect(typeof body.restarted).toBe('boolean')
    expect(typeof body.abnormal).toBe('boolean')
    expect(Array.isArray(body.lines)).toBeTruthy()

    // sin reinicio no puede haber ni salida anomala ni lineas: son los estados que el About distingue
    if (!body.restarted) {
        expect(body.abnormal).toBe(false)
        expect(body.lines.length).toBe(0)
    }
    // y si reinicio, o hay lineas o hay un motivo escrito de por que no las hay
    else if (body.lines.length === 0) {
        expect(typeof body.unavailableReason).toBe('string')
    }
})

test('el boton esta presente y su estado concuerda con lo que dice el core', async ({ page }) => {
    const responsePromise = page.waitForResponse(r => r.url().includes('/managekwirth/previouslog'), { timeout: 15000 })
    await login(page)
    await clickMenuItem(page, 'About Kwirth...')
    const body = await (await responsePromise).json() as IPreviousLogBody

    const dialog = page.locator('[role="dialog"]').filter({ hasText: 'About Kwirth' })
    await expect(dialog).toBeVisible()

    const button = dialog.getByRole('button', { name: 'Previous container log' })
    await expect(button).toHaveCount(1)
    // el boton se queda VISIBLE aunque no se pueda usar, y solo se habilita si de verdad hay log anterior
    await expect(button).toBeEnabled({ enabled: body.restarted })

    if (body.restarted) {
        await button.click()
        const viewer = page.locator('[role="dialog"]').filter({ hasText: 'Log of the previous container' })
        await expect(viewer).toBeVisible()
        await expect(viewer).toContainText('Restarts:')
        await viewer.getByRole('button', { name: 'Close' }).click()
        await expect(viewer).toBeHidden()
    }

    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(dialog).toBeHidden()
})
