import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs, configureCogOf } from './helpers'

// The help on a sender's configuration dialog leads to THAT SENDER's reference page, which is the one
// explaining its fields. Those without one — a paid sender, or a freshly published one — fall back to
// the general senders page, never to a 404.
//
// The front end resolves it by asking for the .md rather than with a list: that way, publishing a
// sender's reference links it by itself. This test checks both branches against the senders that are
// really installed.

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

/** Opens the Configure of the given sender and returns the guide URL its help button opens. */
async function helpUrlFor(page: Page, senderName: RegExp): Promise<string> {
    await dismissOpenDialogs(page)
    await clickExtensionMenuItem(page, 'Senders')
    const manager = page.getByRole('dialog').filter({ hasText: 'Manage senders' })
    await manager.waitFor()

    // THAT sender's cog, climbing from its name: the first ancestor with a button is not always its row
    await configureCogOf(manager, senderName).click()

    const config = page.getByRole('dialog').filter({ hasText: /^Configure:/ })
    await config.waitFor({ timeout: 10_000 })
    await page.waitForTimeout(1200)   // la seccion se resuelve preguntando por el .md

    await config.getByRole('button', { name: 'help' }).click()
    await expect.poll(() => lastOpen(page), { timeout: 5000 }).not.toBe('')
    return await lastOpen(page)
}

/*
    🔴 UN LOGIN PARA EL FICHERO. Habia uno por test y cada uno es un arranque completo de la
    aplicacion, para dos comprobaciones que duran segundos. Los dos tests son independientes aunque
    compartan pagina —cada uno reinstala su captura de `window.open`— y el `about:blank`, que libera el
    WebSocket, pasa al cierre del fichero.
*/
test.describe.serial('sender help', () => {
let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    await dismissOpenDialogs(page)
})

test.afterAll(async () => {
    await page?.goto('about:blank')
    await page?.close()
})

test('la ayuda de un sender lleva a SU pagina de referencia', async () => {
    await captureOpens(page)

    // 'console' has a page of its own: guide/extensions/senders/console
    const consoleUrl = await helpUrlFor(page, /^Console Sender/)
    expect(consoleUrl, 'debe abrir la referencia del propio sender').toContain('guide/extensions/senders/console')
    expect(consoleUrl, 'y no la general').not.toContain('senders/index')
})

test('la ayuda de un sender sin pagina propia cae a la general', async () => {
    await dismissOpenDialogs(page)
    await captureOpens(page)

    // 'jira' is paid and publishes no reference. It comes from the private marketplace, so it is not
    // there in every environment: a skip, never a branch that turns green having checked nothing.
    await clickExtensionMenuItem(page, 'Senders')
    const manager = page.getByRole('dialog').filter({ hasText: 'Manage senders' })
    await manager.waitFor()
    // counted only once the installed list has drawn: an early count would skip on an empty dialog
    await expect(manager.getByText(/^Console Sender/).first()).toBeVisible({ timeout: 30000 })
    test.skip(await manager.getByText(/^Jira Sender/).count() === 0, 'the paid Jira sender is not installed in this environment')

    // it falls back to the general page, never to a 404
    const jiraUrl = await helpUrlFor(page, /^Jira Sender/)
    expect(jiraUrl, 'sin pagina propia se cae a la general').toContain('guide/extensions/senders/index')
})
})
