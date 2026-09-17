import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migracion del gestor de `provider` al diálogo generico (plan: plans/extension-managers-ui/PLAN.md).

    Es el tipo con mas matices propios, y son justo los que se podrian perder al tirar sus 600 lineas:

      · los providers DE CORE (events, metrics) no son extensiones y no salen en el gestor
      · se configura de DOS formas, y la elige `hasFront`: el formulario por schema que pinta el core, o
        la UI que trae el propio provider (que es quien tiene sus configuraciones y su endpoint)
      · el chip 'N configs' cuenta lo que dice el provider, no lo que sabe el core

    ⚠️ No se comprueba contra una lista fija de providers: el entorno cambia. Se pregunta al back que hay
    y se compara con lo que se pinta.

    NO destructivo: abre, mira y cierra. No instala, no desinstala y no guarda ninguna configuracion.
*/

const DIALOG = /Manage providers/i

test.describe.configure({ mode: 'serial' })

interface IProviderRef {
    id: string
    displayName?: string
    core?: boolean
    hasFront?: boolean
    configNames?: string[]
}

test.describe('gestor generico de extensiones: providers', () => {
    let page: Page
    let delBack: IProviderRef[] = []

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
        delBack = await page.evaluate(async () => {
            const base = window.location.origin.replace(':3000', ':3883')
            return await (await fetch(`${base}/core/providers`)).json()
        })
        await clickExtensionMenuItem(page, 'Providers')
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    /*
        El engranaje de la tarjeta de ESE provider. Se sube del nombre al primer ancestro que tenga un
        engranaje dentro: filtrar divs por texto devuelve el <Typography> del nombre (sin botones) o el
        contenedor de todas las tarjetas (con el engranaje de otra), y las dos formas enseñan lo que no es.
    */
    const gearDe = (nombre: string) => dialog().getByText(nombre, { exact: true }).first()
        .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
        .locator('button[aria-label="Configure"]').first()

    test('los providers de CORE no se pintan: no son extensiones', async () => {
        // events y metrics vienen dentro de Kwirth. Si salieran, la papelera invitaria a quitar algo que
        // no se puede quitar, y el contador de instalados mentiria.
        const core = delBack.filter(p => p.core)
        const extensiones = delBack.filter(p => !p.core)
        expect(core.length, 'el back no devuelve ningun provider de core: el test no probaria nada').toBeGreaterThan(0)

        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
        const papeleras = dialog().locator('span[aria-label="Uninstall"] button, span[aria-label^="Dev providers"] button, span[aria-label^="Installed via pack"] button')
        expect(await papeleras.count(), 'lo instalado no cuadra con las extensiones que sirve el back').toBe(extensiones.length)

        for (const p of core) {
            await expect(dialog().getByText(p.displayName ?? p.id, { exact: true }), `'${p.id}' es de core y no debe salir`).toHaveCount(0)
        }
    })

    test('el chip de configs dice lo que dice el provider', async () => {
        // El core no cuenta configuraciones de providers: las lleva cada uno. El chip solo repite lo que
        // el provider declara, y por eso uno con varias conexiones dentro de una sola config pone 1.
        const conConfigs = delBack.filter(p => !p.core && (p.configNames?.length ?? 0) > 0)
        test.skip(conConfigs.length === 0, 'ningun provider tiene configuraciones en este entorno')

        for (const p of conConfigs) {
            const n = p.configNames!.length
            await expect(dialog().getByText(`${n} config${n > 1 ? 's' : ''}`).first(),
                `'${p.id}' declara ${n} y la tarjeta no lo dice`).toBeVisible()
        }
    })

    test('un provider con front propio abre SU dialogo, no el formulario del core', async () => {
        /*
            La diferencia se ve en el titulo: el formulario del core se titula 'Configure: <nombre>', y la
            UI del provider trae la suya. Lo que se comprueba es que al pulsar la rueda de uno con
            `hasFront` NO sale el formulario del core — que es lo que pasaria si la migracion se hubiera
            dejado por el camino el camino del front propio.
        */
        const conFront = delBack.find(p => !p.core && p.hasFront)
        test.skip(!conFront, 'ningun provider con front propio en este entorno')

        const nombre = conFront!.displayName ?? conFront!.id
        await gearDe(nombre).click()

        /*
            ⚠️ Se cuenta `.MuiDialog-root`, NO getByRole('dialog'): con dos diálogos apilados MUI le pone
            aria-hidden al de debajo y Playwright deja de verlo como dialogo, asi que el rol dice 1
            teniendo 2 en pantalla. Costo un rato de diagnostico creyendo que no se abria nada.

            Su UI tarda: hay que bajarse el front.js del provider y montarlo.
        */
        await expect(page.locator('.MuiDialog-root'), 'no se abrio la UI del provider').toHaveCount(2, { timeout: 30000 })
        await expect(page.getByText(`Configure: ${nombre}`), 'se abrio el formulario del core en vez de la UI del provider').toHaveCount(0)
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'Providers')
        await dialog().waitFor({ timeout: 40000 })
    })

    test('un provider sin front se configura con el formulario del core', async () => {
        const sinFront = delBack.find(p => !p.core && !p.hasFront)
        test.skip(!sinFront, 'ningun provider basico en este entorno')

        const nombre = sinFront!.displayName ?? sinFront!.id
        await gearDe(nombre).click()

        // El formulario lo pinta el core a partir del schema del provider, y se titula con su nombre.
        const cfg = page.getByRole('dialog').filter({ hasText: `Configure: ${nombre}` })
        await expect(cfg).toBeVisible({ timeout: 20000 })
        // Sin nada configurable tiene que DECIRLO, no quedarse en blanco.
        const campos = await cfg.locator('input, .MuiSelect-select').count()
        if (campos === 0) await expect(cfg.getByText('This provider has no configurable options.')).toBeVisible()
        await cfg.getByRole('button', { name: /cancel/i }).click()
    })
})
