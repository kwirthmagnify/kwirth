import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

// La ayuda del dialogo de configuracion de un sender lleva a la pagina de referencia DE ESE SENDER, que
// es la que explica sus campos. Los que no la tienen —un sender de pago, o uno recien publicado— caen a
// la pagina general de senders, nunca a un 404.
//
// El front lo resuelve preguntando por el .md, no con una lista: asi, publicar la referencia de un sender
// la enlaza sola. Este test comprueba las dos ramas contra los senders que hay instalados de verdad.

interface IHelpOpen { url: string }

async function captureOpens(page: Page) {
    await page.evaluate(() => {
        ;(window as unknown as { __helpOpens: IHelpOpen[] }).__helpOpens = []
        window.open = ((url?: string | URL) => {
            ;(window as unknown as { __helpOpens: IHelpOpen[] }).__helpOpens.push({ url: String(url ?? '') })
            return null
        }) as typeof window.open
    })
}

const lastOpen = (page: Page) =>
    page.evaluate(() => (window as unknown as { __helpOpens: IHelpOpen[] }).__helpOpens.at(-1)?.url ?? '')

/** Abre el Configure del sender indicado y devuelve la URL de guia que abre su boton de ayuda. */
async function helpUrlFor(page: Page, senderName: RegExp): Promise<string> {
    await dismissOpenDialogs(page)
    await clickExtensionMenuItem(page, 'Senders')
    const manager = page.getByRole('dialog').filter({ hasText: 'Manage senders' })
    await manager.waitFor()

    // En vista de LISTA cada sender es una fila plana, asi que el ancestro con boton es justo esa fila.
    // En tarjetas el texto queda varios divs por dentro de los botones y el localizador no los alcanza.
    await manager.getByRole('button', { name: /list view/i }).first().click()
    await page.waitForTimeout(600)

    const row = manager.getByText(senderName).first().locator('xpath=ancestor::div[.//button][1]')
    await row.getByRole('button', { name: 'Configure' }).first().click()

    const config = page.getByRole('dialog').filter({ hasText: /^Configure:/ })
    await config.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(1200)   // la seccion se resuelve preguntando por el .md

    await config.getByRole('button', { name: 'help' }).click()
    await expect.poll(() => lastOpen(page), { timeout: 5000 }).not.toBe('')
    return await lastOpen(page)
}

test('la ayuda de un sender lleva a SU pagina de referencia, y a la general si no la tiene', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await captureOpens(page)

    // 'console' tiene pagina propia: guide/extensions/senders/console
    const consoleUrl = await helpUrlFor(page, /^Console Sender/)
    expect(consoleUrl, 'debe abrir la referencia del propio sender').toContain('guide/extensions/senders/console')
    expect(consoleUrl, 'y no la general').not.toContain('senders/index')

    // 'jira' es de pago y no publica referencia: cae a la pagina general, nunca a un 404
    await dismissOpenDialogs(page)
    const jiraUrl = await helpUrlFor(page, /^Jira Sender/)
    expect(jiraUrl, 'sin pagina propia se cae a la general').toContain('guide/extensions/senders/index')

    await page.goto('about:blank')
})
