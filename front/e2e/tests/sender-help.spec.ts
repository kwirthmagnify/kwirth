import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

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

    // In LIST view each sender is a flat row, so the ancestor with a button is exactly that row.
    // In card view the text sits several divs inside the buttons and the locator does not reach them.
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

    // 'console' has a page of its own: guide/extensions/senders/console
    const consoleUrl = await helpUrlFor(page, /^Console Sender/)
    expect(consoleUrl, 'debe abrir la referencia del propio sender').toContain('guide/extensions/senders/console')
    expect(consoleUrl, 'y no la general').not.toContain('senders/index')

    // 'jira' is paid and publishes no reference: it falls back to the general page, never to a 404
    await dismissOpenDialogs(page)
    const jiraUrl = await helpUrlFor(page, /^Jira Sender/)
    expect(jiraUrl, 'sin pagina propia se cae a la general').toContain('guide/extensions/senders/index')

    await page.goto('about:blank')
})
