import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migracion del gestor de `idp` al diálogo generico (plan: plans/extension-managers-ui/PLAN.md).

    Era el que el plan marcaba como el mejor candidato a NO migrar, por tener dos entidades: el CONECTOR
    (lo que se instala) y la INSTANCIA (ese conector ya configurado). Como hay una instancia por conector
    y comparten id, en la pantalla se comportan como una extension y su configuracion.

    Lo que se vigila es justo lo que no tiene ningun otro tipo:

      · el chip de ESTADO de tres valores: enabled / disabled / not configured. Un IdP apagado y uno sin
        configurar no son lo mismo, y confundirlos es dejar a la gente sin poder entrar.
      · que un conector bundled o de dev no se pueda desinstalar, y lo diga.
      · que el conector sin version no enseñe un chip 'v' vacio.

    NO destructivo: abre, mira y cierra. NO guarda ninguna configuracion de IdP — tocar eso es tocar por
    donde entra la gente.
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
            El endpoint va autenticado y la sesion no vive en localStorage, asi que se ESCUCHA la
            respuesta que pide el propio diálogo al abrirse.

            ⚠️ Solo /idp/connectors. La lista de instancias NO se lee aqui: '/idp' lo pide tambien la
            pantalla de login para saber que botones enseñar, y escucharlo devolvia esa otra respuesta.
            Lo que hay configurado se deduce de los chips, que es justo lo que se quiere comprobar.
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
            El chip es lo propio del tipo y depende de datos que el generico NO tiene: las instancias las
            carga el descriptor en `loadExtraData`. Si el generico no repintara al terminar esa carga,
            saldrian TODOS como 'not configured' — que es lo que pasaba mientras se migraba, y es lo que
            caza el segundo assert.
        */
        const encendidos = await dialog().getByText('enabled', { exact: true }).count()
        const apagados = await dialog().getByText('disabled', { exact: true }).count()
        const sinConfigurar = await dialog().getByText('not configured', { exact: true }).count()

        // Uno por tarjeta, ni mas ni menos: son estados excluyentes.
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
        // Los bundled no traen version. El chip generico pinta 'v' + numero, y sin numero quedaba una 'v'
        // suelta que no dice nada.
        const sinVersion = conectores.filter(c => !c.version)
        test.skip(sinVersion.length === 0, 'todos los conectores de este entorno traen version')
        await expect(dialog().getByText('v', { exact: true })).toHaveCount(0)
    })

    test('la configuracion de un conector abre SU formulario, con el interruptor de encendido', async () => {
        // Se abre y se cierra con Cancel: no se guarda nada, que esto es por donde entra la gente.
        const conCampos = conectores.find(c => (c.schema?.length ?? 0) > 0)
        test.skip(!conCampos, 'ningun conector con campos configurables')

        await dialog().getByText(conCampos!.label, { exact: true }).first()
            .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
            .locator('button[aria-label="Configure"]').first().click()

        const cfg = page.getByRole('dialog').filter({ hasText: `Configure: ${conCampos!.label}` })
        await expect(cfg).toBeVisible({ timeout: 20000 })
        // El interruptor es lo que permite dejar un IdP preparado y encenderlo el dia del corte.
        await expect(cfg.getByText('Enabled', { exact: true })).toBeVisible()
        await cfg.getByRole('button', { name: /cancel/i }).click()
    })
})
