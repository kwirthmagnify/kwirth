import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Migracion del gestor de `sender` al diálogo generico (plan: plans/extension-managers-ui/PLAN.md).

    Es el ultimo de los once y el que mas traia. Lo que se vigila es lo que podria haberse quedado por el
    camino al tirar sus 1060 lineas:

      · el chip con las configuraciones que tiene puestas, que aqui son los DESTINOS
      · la configuracion BASE (los campos que el schema marca `common`): el servidor de correo es uno y
        los destinatarios son varios
      · exportar e importar configuraciones, que es como se lleva lo mismo de un Kwirth a otro
      · los que traen su propia UI (composite) abren la SUYA, no la lista del core

    ⚠️⚠️ NO se guarda NADA ni se pulsa nada que pueda mandar un aviso. Un sender manda correos y mensajes
    a personas reales: aqui se abre, se mira y se cancela. Tampoco se exporta: el fichero llevaria las
    credenciales de los destinos.
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
        // El endpoint va autenticado: se escucha la respuesta que pide el propio diálogo al abrirse.
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

    test('el chip cuenta los destinos que tiene puestos cada sender', async () => {
        // Un sender sin configuraciones no manda nada a ningun sitio, y eso se lee de un vistazo.
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

        // Cada destino, por su nombre: es lo que distingue este diálogo de un formulario suelto.
        for (const nombre of conVarios!.configNames) {
            await expect(cfg.getByText(nombre, { exact: true }).first(), `falta el destino '${nombre}'`).toBeVisible()
        }

        // Y se pueden llevar a otro Kwirth. NO se pulsa Export: el fichero lleva las credenciales.
        await expect(cfg.getByRole('button', { name: 'Export' })).toBeEnabled()
        await expect(cfg.getByRole('button', { name: 'Import' })).toBeVisible()
        await cfg.getByRole('button', { name: 'Close' }).click()
    })

    test('🔴 la configuracion BASE existe cuando el sender la declara, y se abre aparte', async () => {
        /*
            Los campos `common` del schema son de la extension, no de cada destino: el servidor de correo
            es uno y los destinatarios son varios. Se editan en su propia pantalla, y el acceso solo
            aparece en los senders que declaran alguno.

            Se abre y se CANCELA. Guardar aqui tocaria la configuracion real de envio.
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
        // ⚠️ .MuiDialog-root y no getByRole: con dos diálogos apilados MUI marca aria-hidden el de debajo.
        await expect(page.locator('.MuiDialog-root'), 'no se abrio la UI del sender').toHaveCount(2, { timeout: 30000 })
        await expect(page.getByText(`Configure: ${nombreDe(conFront!)}`), 'se abrio la lista del core en vez de su UI').toHaveCount(0)
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'Senders')
        await dialog().waitFor({ timeout: 40000 })
    })
})
