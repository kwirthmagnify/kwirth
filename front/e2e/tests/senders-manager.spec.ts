import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migration of the `sender` manager to the generic dialog (plan: plans/extension-managers-ui/PLAN.md).

    It is the last of the eleven and the one that brought the most. What is watched is what could have
    been left behind when throwing away its 1060 lines:

      · the chip with the configurations it has in place, which here are the DESTINATIONS
      · the BASE configuration (the fields the schema marks as `common`): the mail server is one and the
        recipients are many
      · exporting and importing configurations, which is how the same thing is taken from one Kwirth to
        another
      · those bringing their own UI (composite) open THEIRS, not the core's list

    ⚠️⚠️ NOTHING is saved and nothing that could send an alert is pressed. A sender sends emails and
    messages to real people: here it is opened, looked at and cancelled. Nothing is exported either: the
    file would carry the destinations' credentials.
*/

const DIALOG = /Manage senders/i

test.describe.configure({ mode: 'serial' })

interface ISenderRef {
    id: string
    displayName?: string
    name?: string
    hasFront?: boolean
    configNames: string[]
}

const nombreDe = (s: ISenderRef) => s.displayName || s.name || s.id

test.describe('gestor generico de extensiones: senders', () => {
    let page: Page
    let senders: ISenderRef[] = []

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
        // The endpoint is authenticated: the response the dialog itself asks for on opening is listened to.
        const respuesta = page.waitForResponse(r => r.url().endsWith('/core/senders'), { timeout: 60000 })
        await clickExtensionMenuItem(page, 'Senders')
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
        senders = await (await respuesta).json()
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    const gearDe = (nombre: string) => dialog().getByText(nombre, { exact: true }).first()
        .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
        .locator('button[aria-label="Configure"]').first()

    test('todos los senders salen, con su nombre', async () => {
        expect(senders.length, 'el back no devuelve ningun sender').toBeGreaterThan(0)
        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
        for (const s of senders) {
            await expect(dialog().getByText(nombreDe(s), { exact: true }).first(), `'${s.id}' no aparece`).toBeVisible()
        }
    })

    /*
        A sender mounted from dev REPLACES the installed one with the same id, it is not added to it.

        The filter was missing in `SenderManager.listInstalled()` —which concatenates the installed index
        with the dev metadata— and in a development environment, where the normal thing is to have an
        extension installed AND also mounted from its dist, the same sender came out TWICE: here in the
        manager, and in any consumer of '/core/senders'. The sender-debug plugin's e2e caught it, its
        dropdown painting 'console' twice.

        The endpoint's RESPONSE is looked at and not the cards: the manager paints the installed ones and
        also those available in the marketplace, so an installed sender that is also published shows up
        twice quite rightly. Counting cards by name would give a red that says nothing about the bug —
        it was checked, and that was exactly what happened with 'email-resend'.
    */
    test('ningun sender sale repetido, aunque este instalado y ademas montado desde dev', async () => {
        const ids = senders.map(s => s.id)
        const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i)
        expect(repetidos, `'/core/senders' devuelve ids repetidos: ${repetidos.join(', ')}`).toEqual([])
    })

    test('el chip cuenta los destinos que tiene puestos cada sender', async () => {
        // A sender with no configurations sends nothing anywhere, and that reads at a glance.
        const conConfigs = senders.filter(s => s.configNames.length > 0)
        expect(conConfigs.length, 'ningun sender tiene configuraciones en este entorno').toBeGreaterThan(0)

        for (const s of conConfigs) {
            const n = s.configNames.length
            await expect(dialog().getByText(`${n} config${n > 1 ? 's' : ''}`).first(),
                `'${s.id}' tiene ${n} y la tarjeta no lo dice`).toBeVisible()
        }
    })

    test('la configuracion lista los destinos por nombre, y ofrece llevarselos', async () => {
        const conVarios = senders.find(s => !s.hasFront && s.configNames.length > 1) ?? senders.find(s => !s.hasFront && s.configNames.length > 0)
        test.skip(!conVarios, 'ningun sender del core con configuraciones')

        await gearDe(nombreDe(conVarios!)).click()
        const cfg = page.getByRole('dialog').filter({ hasText: `Configure: ${nombreDe(conVarios!)}` })
        await expect(cfg).toBeVisible({ timeout: 20000 })

        // Each destination, by its name: it is what tells this dialog from a loose form.
        for (const nombre of conVarios!.configNames) {
            await expect(cfg.getByText(nombre, { exact: true }).first(), `falta el destino '${nombre}'`).toBeVisible()
        }

        // And they can be taken to another Kwirth. Export is NOT pressed: the file carries the credentials.
        await expect(cfg.getByRole('button', { name: 'Export' })).toBeEnabled()
        await expect(cfg.getByRole('button', { name: 'Import' })).toBeVisible()
        await cfg.getByRole('button', { name: 'Close' }).click()
    })

    test('🔴 la configuracion BASE existe cuando el sender la declara, y se abre aparte', async () => {
        /*
            The schema's `common` fields belong to the extension, not to each destination: the mail
            server is one and the recipients are many. They are edited on their own screen, and the way
            in only appears on the senders that declare any.

            It is opened and CANCELLED. Saving here would touch the real sending configuration.
        */
        const candidatos = senders.filter(s => !s.hasFront && s.configNames.length > 0)
        let encontrado = false

        for (const s of candidatos) {
            await gearDe(nombreDe(s)).click()
            const cfg = page.getByRole('dialog').filter({ hasText: `Configure: ${nombreDe(s)}` })
            await expect(cfg).toBeVisible({ timeout: 20000 })

            const base = cfg.locator('button[aria-label="Edit base configuration"]')
            if (await base.count() > 0) {
                await base.click()
                await expect(page.getByRole('dialog').filter({ hasText: 'Base configuration' })).toBeVisible({ timeout: 10000 })
                await page.getByRole('button', { name: /cancel/i }).last().click()
                encontrado = true
            }
            await cfg.getByRole('button', { name: 'Close' }).click()
            if (encontrado) break
        }
        test.skip(!encontrado, 'ningun sender de este entorno declara configuracion base')
    })

    test('un sender con su propia UI abre esa, no la lista del core', async () => {
        const conFront = senders.find(s => s.hasFront)
        test.skip(!conFront, 'ningun sender con front propio en este entorno')

        await gearDe(nombreDe(conFront!)).click()
        // ⚠️ .MuiDialog-root and not getByRole: with two stacked dialogs MUI marks the lower one aria-hidden.
        await expect(page.locator('.MuiDialog-root'), 'no se abrio la UI del sender').toHaveCount(2, { timeout: 30000 })
        await expect(page.getByText(`Configure: ${nombreDe(conFront!)}`), 'se abrio la lista del core en vez de su UI').toHaveCount(0)
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'Senders')
        await dialog().waitFor({ timeout: 40000 })
    })
})
