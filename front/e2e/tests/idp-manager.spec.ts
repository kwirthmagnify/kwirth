import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migration of the `idp` manager to the generic dialog (plan: plans/extension-managers-ui/PLAN.md).

    It was the one the plan marked as the best candidate NOT to migrate, because it has two entities: the
    CONNECTOR (what gets installed) and the INSTANCE (that connector already configured). Since there is
    one instance per connector and they share an id, on the screen they behave like an extension and its
    configuration.

    What is watched is exactly what no other type has:

      · the three-valued STATUS chip: enabled / disabled / not configured. An IdP switched off and one
        not configured are not the same thing, and confusing them leaves people unable to log in.
      · that a bundled or dev connector cannot be uninstalled, and says so.
      · that a connector with no version does not show an empty 'v' chip.

    NON-destructive: it opens, looks and closes. It saves NO IdP configuration — touching that is
    touching the way people get in.
*/

const DIALOG = /Identity providers/i

test.describe.configure({ mode: 'serial' })

interface IConnector {
    id: string
    label: string
    installed: boolean
    version?: string
    schema?: unknown[]
}

test.describe('gestor generico de extensiones: idp', () => {
    let page: Page
    let conectores: IConnector[] = []

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
        /*
            The endpoint is authenticated and the session does not live in localStorage, so the response
            the dialog itself asks for on opening is LISTENED to.

            ⚠️ Only /idp/connectors. The instances list is NOT read here: '/idp' is also requested by the
            login screen to know which buttons to show, and listening for it returned that other
            response. What is configured is deduced from the chips, which is exactly what is to be checked.
        */
        const respConectores = page.waitForResponse(r => r.url().endsWith('/idp/connectors'), { timeout: 60000 })
        await clickExtensionMenuItem(page, 'Identity providers')
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
        conectores = await (await respConectores).json()
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    test('los conectores instalados salen con su nombre, no con su id', async () => {
        expect(conectores.length, 'el back no devuelve ningun conector').toBeGreaterThan(0)
        for (const c of conectores) {
            await expect(dialog().getByText(c.label, { exact: true }).first(),
                `'${c.id}' no aparece con su label`).toBeVisible({ timeout: 30000 })
        }
    })

    test('🔴 cada conector dice su estado, y no todos son "sin configurar"', async () => {
        /*
            The chip is the type's own and depends on data the generic one does NOT have: the instances
            are loaded by the descriptor in `loadExtraData`. If the generic one did not repaint when
            that load finishes, they would ALL come out as 'not configured' — which is what happened
            while migrating, and is what the second assert catches.
        */
        const encendidos = await dialog().getByText('enabled', { exact: true }).count()
        const apagados = await dialog().getByText('disabled', { exact: true }).count()
        const sinConfigurar = await dialog().getByText('not configured', { exact: true }).count()

        // One per card, no more and no less: they are mutually exclusive states.
        expect(encendidos + apagados + sinConfigurar, 'hay conectores sin chip de estado, o con dos')
            .toBe(conectores.length)
        expect(encendidos + apagados, 'todos salen sin configurar: las instancias no llegaron al pintar')
            .toBeGreaterThan(0)
    })

    test('un conector bundled o de dev no se desinstala, y dice por que', async () => {
        const fijos = conectores.filter(c => !c.installed)
        test.skip(fijos.length === 0, 'todos los conectores de este entorno son instalables')

        const bloqueados = dialog().locator('span[aria-label="Bundled/dev connector (cannot be uninstalled)"] button')
        expect(await bloqueados.count(), `${fijos.length} conectores vienen dentro y ninguno lo dice`).toBe(fijos.length)
        await expect(bloqueados.first()).toBeDisabled()
    })

    test('un conector sin version no enseña un chip de version vacio', async () => {
        // Bundled ones carry no version. The generic chip draws 'v' + number, and with no number a lone
        // 'v' was left that says nothing.
        const sinVersion = conectores.filter(c => !c.version)
        test.skip(sinVersion.length === 0, 'todos los conectores de este entorno traen version')
        await expect(dialog().getByText('v', { exact: true })).toHaveCount(0)
    })

    test('la configuracion de un conector abre SU formulario, con el interruptor de encendido', async () => {
        // It is opened and closed with Cancel: nothing is saved, since this is how people get in.
        const conCampos = conectores.find(c => (c.schema?.length ?? 0) > 0)
        test.skip(!conCampos, 'ningun conector con campos configurables')

        await dialog().getByText(conCampos!.label, { exact: true }).first()
            .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
            .locator('button[aria-label="Configure"]').first().click()

        const cfg = page.getByRole('dialog').filter({ hasText: `Configure: ${conCampos!.label}` })
        await expect(cfg).toBeVisible({ timeout: 20000 })
        // The switch is what allows leaving an IdP ready and turning it on the day of the cutover.
        await expect(cfg.getByText('Enabled', { exact: true })).toBeVisible()
        await cfg.getByRole('button', { name: /cancel/i }).click()
    })
})
