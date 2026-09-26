import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Gestor GENERICO de extensiones (ExtensionManagerDialog) estrenado por el tipo `aitoolset`
    (plan: plans/ai-tools/PLAN.md, S1). Lo que se vigila aqui no es "que se pinte algo", sino las
    decisiones que el generico tiene que respetar para poder sustituir a los diez dialogos a medida:

      · lo instalado y el catalogo son DOS secciones distintas, cada una con su filtro
      · una extension ya instalada no se puede volver a instalar desde el catalogo
      · un tipo que NO declara dialogo de configuracion no enseña engranaje
      · los chips de una tarjeta comparten tamaño (mezclar tamaños se ve desordenado)

    NO destructivo: solo abre el dialogo, filtra y cambia de vista. No instala ni desinstala nada.

    ⚠️ El spec NO nombra ningun toolset concreto, y eso es deliberado: la primera version daba por hecho
    que el instalado era `playground` y se puso roja el dia que el entorno paso a tener los de Kubernetes.
    Lo que se comprueba es el COMPORTAMIENTO del gestor con lo que haya instalado, sea lo que sea.
*/

const DIALOG = /Manage AI toolsets/i

interface IChipSeen { text: string, height: number, font: string }

test.describe.configure({ mode: 'serial' })

test.describe('gestor generico de extensiones: aitoolsets', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        await login(page)
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'AI toolsets')
        // El catalogo no es instantaneo: el back resuelve los manifests remotos antes de responder, y con
        // la maquina cargada eso pasa de largo de los timeouts cortos.
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await page.close()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    /*
        Whether ANY toolset in this environment is loaded from `kwirth-dev.json`.

        It used to be a given —every toolset was a dev one— so two tests below asserted the dev
        wording unconditionally. The day the toolsets were installed from the marketplace instead,
        both went red without a single thing being broken. What this manager promises does not
        depend on where an extension came from, so the checks that DO depend on it are guarded.
    */
    const anyDevLoaded = async (): Promise<boolean> => await dialog().getByText('dev active').count() > 0

    test('el tipo aitoolset tiene su entrada de menu y abre el gestor generico', async () => {
        await expect(dialog()).toBeVisible()
        // Las dos secciones del generico, con el nombre del tipo interpolado desde el descriptor
        await expect(dialog().getByText('Installed AI toolsets')).toBeVisible()
        await expect(dialog().getByText('Available AI toolsets')).toBeVisible()
    })

    test('lo instalado sale con su version y el numero REAL de tools', async () => {
        // El contador no lo dice el paquete: lo cuenta el back sobre el REGISTRO, asi que un back.js que
        // no cargue se veria SIN chip en vez de mentir con el numero que traia el manifest. Por eso se
        // exige que haya chip y que el numero sea > 0.
        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 20000 })
        const chips = await dialog().getByText(/^\d+ tools?$/).allTextContents()
        expect(chips.length, 'ningun toolset instalado enseña su contador de tools').toBeGreaterThan(0)
        for (const c of chips) expect(Number(c.replace(/\D/g, '')), `contador vacio: ${c}`).toBeGreaterThan(0)
    })

    test('el catalogo publico sirve el toolset y no deja reinstalarlo', async () => {
        // Esta en dev, asi que el catalogo tiene que decirlo y el boton de instalar tiene que estar muerto.
        // ⚠️ El aria-label lo lleva el <span> que envuelve al IconButton (MUI no puede etiquetar un boton
        // deshabilitado), asi que se busca por ahi y no por el nombre accesible del boton.
        // Puede haber varios en el catalogo: unos instalados y otros no. Basta con que los que SI lo
        // estan tengan el boton muerto — y que haya al menos uno, o el test no probaria nada.
        //
        // ⚠️ El motivo distingue quien lo carga: a una extension de DEV no se le puede decir "desinstala
        // primero" porque no se desinstala — se quita de kwirth-dev.json. Lo traia ThemeManagerDialog y lo
        // heredo el generico al migrarlo, asi que aqui se aceptan los dos motivos.
        const yaInstalados = dialog().locator('span[aria-label^="Already installed"] button, span[aria-label^="A dev version"] button')
        // The catalogue is not instant: the back resolves the remote manifests before answering.
        await expect(yaInstalados.first()).toBeVisible({ timeout: 40000 })
        expect(await yaInstalados.count(), 'ningun toolset del catalogo consta como instalado').toBeGreaterThan(0)
        for (let i = 0; i < await yaInstalados.count(); i++) await expect(yaInstalados.nth(i)).toBeDisabled()

        // A dev extension cannot be told "uninstall first" — it is not uninstalled, it is taken out
        // of kwirth-dev.json — so when one IS loaded the manager must say it with its own reason.
        if (await anyDevLoaded()) {
            await expect(dialog().locator('span[aria-label="A dev version is already loaded"]').first()).toBeVisible()
        }
    })

    test('el veredicto de canUninstall se ve y bloquea el boton', async () => {
        // Un toolset de dev lo gobierna kwirth-dev.json: desinstalarlo desde aqui dejaria el indice
        // diciendo una cosa y el arranque volviendolo a poner. El descriptor lo prohibe y el generico
        // tiene que enseñar el MOTIVO, no solo desactivar el boton.
        if (await anyDevLoaded()) {
            await expect(dialog().locator('span[aria-label="Dev toolsets cannot be uninstalled"] button').first()).toBeDisabled()
            return
        }

        // With no dev toolset around, the other half of the same rule is what can be checked: one
        // installed from a marketplace CAN be uninstalled, so its button must be alive and say so.
        // Nothing is clicked — this spec is read-only, and uninstalling would take the user's toolset.
        const desinstalar = dialog().locator('span[aria-label="Uninstall"] button')
        expect(await desinstalar.count(), 'ningun toolset instalado ofrece desinstalar').toBeGreaterThan(0)
        await expect(desinstalar.first()).toBeEnabled()
    })

    test('un tipo sin dialogo de configuracion no enseña engranaje', async () => {
        // aitoolset no declara renderConfigDialog: el generico NO debe inventarse la accion. Si algun dia
        // se le da configuracion, este test cae y hay que decidirlo a conciencia.
        await expect(dialog().locator('span[aria-label="Configure"]')).toHaveCount(0)
        await expect(dialog().getByText(/\d+ configs?$/)).toHaveCount(0)
    })

    test('los dos filtros son independientes: el de instalados no toca el catalogo', async () => {
        const filters = dialog().getByPlaceholder('Filter…')
        await expect(filters).toHaveCount(2)

        // What the catalogue holds, counted BEFORE filtering: the entries themselves, not the dev wording,
        // which only exists when a toolset is loaded from kwirth-dev.json.
        const enCatalogo = dialog().locator('span[aria-label^="Already installed"] button, span[aria-label^="A dev version"] button')
        const antes = await enCatalogo.count()

        await filters.first().fill('no-existe-este-toolset')
        await expect(dialog().getByText('No AI toolsets installed.')).toBeVisible()
        // el catalogo sigue entero: el filtro de arriba no es global
        expect(await enCatalogo.count(), 'el filtro de instalados se ha llevado por delante el catalogo').toBe(antes)

        await filters.first().fill('')
        await expect(dialog().getByText(/^\d+ tools?$/).first()).toBeVisible()
    })

    test('la vista de lista enseña lo mismo que la de tarjetas', async () => {
        const enTarjetas = await dialog().getByText(/^\d+ tools?$/).allTextContents()

        await dialog().getByRole('button', { name: 'List view' }).click()
        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible()
        expect(await dialog().getByText(/^\d+ tools?$/).allTextContents()).toEqual(enTarjetas)

        await dialog().getByRole('button', { name: 'Card view' }).click()
        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible()
    })

    test('en la lista, las columnas de filas distintas quedan alineadas', async () => {
        // La regla 6 del criterio de UI (plans/extension-managers-ui/PLAN.md) solo se puede comprobar con
        // VARIAS filas: `extensionRowCells` devuelve celdas sueltas —no un contenedor por fila— justo para
        // que compartan la rejilla. Con una sola fila cualquier maquetacion parece correcta, y por eso
        // esto quedo anotado como pendiente hasta que hubo un segundo toolset en el catalogo.
        //
        // ⚠️ Se mide DENTRO del catalogo: lo instalado y lo disponible son dos rejillas distintas, y sus
        // columnas no tienen por que coincidir entre si. Y las filas del catalogo traen distinto numero de
        // chips ('dev active' solo en una), que es justo lo que descuadraria una maquetacion por fila.
        await dialog().getByRole('button', { name: 'List view' }).click()
        await expect(dialog().locator('.MuiSelect-select').first()).toBeVisible({ timeout: 40000 })

        // ⚠️ Solo los Select de VERSION. En la seccion de instalados hay otro Select —el de concesion— que
        // vive en otra columna: meterlos en el mismo saco hacia fallar la medida por comparar peras con
        // manzanas. Se distinguen por su contenido, que es un numero de version.
        const columnXs = await dialog().locator('.MuiSelect-select').evaluateAll(els => els
            .map(e => ({ version: (e.textContent ?? '').replace(/​/g, '').trim(), left: Math.round(e.getBoundingClientRect().left) }))
            .filter(c => /^\d+\.\d+\.\d+$/.test(c.version)))

        expect(columnXs.length, 'el catalogo deberia traer dos toolsets').toBeGreaterThan(1)
        expect([...new Set(columnXs.map(c => c.left))], `columna de version desalineada: ${JSON.stringify(columnXs)}`).toHaveLength(1)

        await dialog().getByRole('button', { name: 'Card view' }).click()
    })

    test('todos los chips de una tarjeta miden lo mismo', async () => {
        // compactChip (MarketplaceBadge) es el tamaño comun de TODOS los chips de una tarjeta de
        // extension. Se comprueba de verdad porque a ojo no se distingue: un chip con mas contraste
        // parece mas grande aunque mida igual, y al reves un descuadre real pasa desapercibido.
        const chips: IChipSeen[] = await dialog().locator('.MuiChip-root').evaluateAll(els => els.map(el => ({
            text: (el.textContent ?? '').trim(),
            height: el.getBoundingClientRect().height,
            font: getComputedStyle(el).fontSize
        })))

        expect(chips.length, 'la tarjeta deberia traer chips').toBeGreaterThan(2)
        const heights = [...new Set(chips.map(c => c.height))]
        const fonts = [...new Set(chips.map(c => c.font))]
        expect(heights, `alturas distintas: ${JSON.stringify(chips)}`).toEqual([20])
        expect(fonts, `tamaños de letra distintos: ${JSON.stringify(chips)}`).toHaveLength(1)
    })
})
