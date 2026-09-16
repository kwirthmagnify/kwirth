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

    NO destructivo: solo abre el dialogo, filtra y cambia de vista. No instala ni desinstala nada. El
    toolset `playground` que se espera encontrar viene declarado en kwirth-dev.json.
*/

const TOOLSET = 'Playground'
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

    test('el tipo aitoolset tiene su entrada de menu y abre el gestor generico', async () => {
        await expect(dialog()).toBeVisible()
        // Las dos secciones del generico, con el nombre del tipo interpolado desde el descriptor
        await expect(dialog().getByText('Installed AI toolsets')).toBeVisible()
        await expect(dialog().getByText('Available AI toolsets')).toBeVisible()
    })

    test('lo instalado sale con su version y el numero REAL de tools', async () => {
        await expect(dialog().getByText(TOOLSET).first()).toBeVisible({ timeout: 20000 })
        await expect(dialog().getByText('v0.1.0').first()).toBeVisible()
        // El contador no lo dice el paquete: lo cuenta el back sobre el REGISTRO, asi que un back.js que
        // no cargue se veria sin chip en vez de mentir con el numero que traia el manifest.
        await expect(dialog().getByText(/^2 tools$/)).toBeVisible()
    })

    test('el catalogo publico sirve el toolset y no deja reinstalarlo', async () => {
        // Esta en dev, asi que el catalogo tiene que decirlo y el boton de instalar tiene que estar muerto.
        // ⚠️ El aria-label lo lleva el <span> que envuelve al IconButton (MUI no puede etiquetar un boton
        // deshabilitado), asi que se busca por ahi y no por el nombre accesible del boton.
        await expect(dialog().getByText('dev active')).toBeVisible({ timeout: 40000 })
        await expect(dialog().locator('span[aria-label^="Already installed"] button')).toBeDisabled()
    })

    test('el veredicto de canUninstall se ve y bloquea el boton', async () => {
        // Un toolset de dev lo gobierna kwirth-dev.json: desinstalarlo desde aqui dejaria el indice
        // diciendo una cosa y el arranque volviendolo a poner. El descriptor lo prohibe y el generico
        // tiene que enseñar el MOTIVO, no solo desactivar el boton.
        await expect(dialog().locator('span[aria-label="Dev toolsets cannot be uninstalled"] button')).toBeDisabled()
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

        await filters.first().fill('no-existe-este-toolset')
        await expect(dialog().getByText('No AI toolsets installed.')).toBeVisible()
        // el catalogo sigue entero: el filtro de arriba no es global
        await expect(dialog().getByText('dev active')).toBeVisible()

        await filters.first().fill('')
        await expect(dialog().getByText(/^2 tools$/)).toBeVisible()
    })

    test('la vista de lista enseña lo mismo que la de tarjetas', async () => {
        await dialog().getByRole('button', { name: 'List view' }).click()
        await expect(dialog().getByText(TOOLSET).first()).toBeVisible()
        await expect(dialog().getByText(/^2 tools$/)).toBeVisible()
        await expect(dialog().getByText('v0.1.0').first()).toBeVisible()

        await dialog().getByRole('button', { name: 'Card view' }).click()
        await expect(dialog().getByText(TOOLSET).first()).toBeVisible()
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
        await expect(dialog().getByText('K8s Inventory').first()).toBeVisible({ timeout: 40000 })

        const columnXs = await dialog().locator('.MuiSelect-select').evaluateAll(els => els.map(e => ({
            version: (e.textContent ?? '').replace(/​/g, '').trim(),
            left: Math.round(e.getBoundingClientRect().left)
        })))

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
