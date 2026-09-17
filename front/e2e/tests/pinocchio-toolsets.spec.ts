import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

/*
    Pinocchio deja de coger las 43 tools compiladas dentro de `common-ai` y las resuelve contra el
    REGISTRO de toolsets instalados (plan: plans/ai-tools/PLAN.md, S3).

    El cambio no se ve: la misma lista de tools, con los mismos nombres. Por eso el test no comprueba
    "que hay tools" —eso pasaba también antes— sino que la lista ES la de los toolsets instalados:

      · están las de los toolsets que SÍ están instalados (k8s-describe, k8s-observability…)
      · NO está `delete_pod`, que vive en `k8s-ops` y no está instalado
      · NO está `times_two`, que vive en `playground` y tampoco lo está

    Con el camino viejo las tres aparecían siempre, porque venían todas del mismo sitio. Si alguna
    reaparece, es que se ha vuelto a colar el catálogo compilado.

    NO destructivo: abre el canal, mira el selector y cancela. No guarda configuración.
*/

test.describe.configure({ mode: 'serial' })

test.describe('pinocchio: las tools salen del registro de toolsets', () => {
    let page: Page
    let herramientas: string[] = []
    let rotulo = ''

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)

        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.waitForTimeout(800)
        await pickCombo(page, 0, 'inCluster')
        await pickCombo(page, 1, 'cluster')
        await pickLastCombo(page, 'pinocchio')
        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.waitForTimeout(1500)

        // El canal tiene que ARRANCAR: la lista de tools se la pide al back al iniciarse.
        await page.locator('button:has(svg[data-testid="SettingsIcon"])').first().click()
        await page.getByRole('menuitem', { name: /^Start$/ }).click()
        await page.waitForTimeout(4000)

        // Config → Triggers, que es donde vive el selector de tools
        await page.getByRole('button', { name: 'Config', exact: true }).click()
        await page.getByRole('menuitem', { name: /trigger/i }).click()
        await page.waitForTimeout(1500)

        // ⚠️ El selector solo se habilita con un trigger Y una version elegidos: sin eso esta en gris y
        // no pinta nada, que fue lo que despisto la primera vez. Se pincha el PRIMERO de cada lista para
        // no depender de como se llamen los triggers de quien corra el test: son datos suyos.
        const dialog = page.getByRole('dialog').first()
        const item = dialog.locator('.MuiListItemButton-root')
        await item.first().click({ force: true })
        await page.waitForTimeout(800)
        // La lista de versiones aparece al elegir trigger: el segundo bloque de items es la primera version
        await item.nth(1).click({ force: true })
        await page.waitForTimeout(800)

        rotulo = (await dialog.locator('.MuiFormControl-root').filter({ hasText: 'Tools' }).locator('.MuiSelect-select').first().textContent().catch(() => '')) ?? ''

        // El catalogo esta DENTRO del desplegable: hay que abrirlo.
        await dialog.locator('.MuiFormControl-root').filter({ hasText: 'Tools' }).locator('.MuiSelect-select').first().click({ force: true })
        await page.waitForTimeout(800)
        herramientas = await page.locator('[role="listbox"] [role="option"]').allTextContents()
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page?.close()
    })

    test('el catalogo que ofrece no esta vacio', async () => {
        // Si el registro estuviera vacio, pinocchio se quedaria sin tools — que es exactamente el sintoma
        // de "un plugin sin toolsets no tiene tools", y hay que distinguirlo de un fallo al pintar.
        expect(herramientas.length, 'no hay ninguna tool disponible: ¿no hay toolsets instalados?').toBeGreaterThan(0)
        // Y el rotulo del selector existe (vacio si no hay ninguna marcada, 'all (N)' con autoTools)
        expect(typeof rotulo).toBe('string')
    })

    test('las tools que ofrece son las de los toolsets INSTALADOS', async () => {
        const texto = herramientas.join(' ')
        // De k8s-describe y de k8s-observability, los dos instalados en este entorno
        expect(texto, 'falta describe_pod (k8s-describe)').toContain('describe_pod')
        expect(texto, 'falta get_pod_logs (k8s-observability)').toContain('get_pod_logs')
    })

    test('NO ofrece las de los toolsets que no estan instalados', async () => {
        // delete_pod es de k8s-ops (privado, escritura) y times_two de playground. Con el camino viejo
        // salían las dos, porque venían compiladas dentro del core junto a las demás.
        const texto = herramientas.join(' ')
        expect(texto, 'delete_pod no deberia estar: k8s-ops no esta instalado').not.toContain('delete_pod')
        expect(texto, 'times_two no deberia estar: playground no esta instalado').not.toContain('times_two')
    })
})
