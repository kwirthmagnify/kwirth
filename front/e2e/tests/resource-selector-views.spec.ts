/*
    Selector de recursos: las views y el gate de canales.

    Este fichero existe porque al cablear la view 'none' (ver plans/instance-view-none/PLAN.md) se
    constato que el ResourceSelector NO tenia ningun e2e propio, siendo el componente que usan TODOS
    los canales para arrancar. Los specs de pinocchio lo tocan de refilon (view 'cluster'), pero nadie
    comprobaba que las cinco views de recursos sigan ahi ni que los desplegables se habiliten como
    deben.

    Es NO DESTRUCTIVO a proposito: solo abre el dialogo ADD, recorre el desplegable de View y lo
    cancela. No crea ni una pestaña, asi que no toca el espacio de trabajo del usuario.
*/
import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, assertFrontCompiles, pickCombo } from './helpers'

// El cuello de botella es recargar la SPA, no Playwright: una sola sesion para todo el fichero.
test.describe.configure({ mode: 'serial' })

// Orden y posicion de los desplegables del dialogo ADD. Se mantienen montados siempre (se deshabilitan,
// no se desmontan), asi que los indices son estables sea cual sea la view elegida.
const COMBO_CLUSTER = 0
const COMBO_VIEW = 1
const COMBO_NAMESPACE = 2

const openAddDialog = async (page: Page): Promise<void> => {
    await dismissOpenDialogs(page)
    await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
    await pickCombo(page, COMBO_CLUSTER, 'inCluster')
}

const viewOptionNames = async (page: Page): Promise<string[]> => {
    await page.getByRole('combobox').nth(COMBO_VIEW).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
    const names = await page.getByRole('option').allInnerTexts()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    return names.map(n => n.trim())
}

const isComboDisabled = async (page: Page, index: number): Promise<boolean> => {
    const combo = page.getByRole('combobox').nth(index)
    const ariaDisabled = await combo.getAttribute('aria-disabled')
    if (ariaDisabled === 'true') return true
    const cls = await combo.getAttribute('class')
    return (cls ?? '').includes('Mui-disabled')
}

let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    await assertFrontCompiles(page)
})

test.afterAll(async () => {
    // Se cancela el dialogo: este fichero no debe dejar nada creado.
    await dismissOpenDialogs(page).catch(() => {})
    await page.close()
})

test('the View dropdown offers the five resource views plus none', async () => {
    await openAddDialog(page)
    const names = await viewOptionNames(page)

    // Las cinco de siempre tienen que seguir estando: quitar una romperia todos los canales.
    expect(names).toContain('cluster')
    expect(names).toContain('namespace')
    expect(names).toContain('controller')
    expect(names).toContain('pod')
    expect(names).toContain('container')
    // Y la nueva, para canales que no necesitan el cluster.
    expect(names).toContain('none')
    expect(names).toHaveLength(6)
})

test('a resource view enables the namespace dropdown', async () => {
    await pickCombo(page, COMBO_VIEW, 'namespace')
    expect(await isComboDisabled(page, COMBO_NAMESPACE)).toBe(false)
})

test('the cluster view disables the namespace dropdown', async () => {
    await pickCombo(page, COMBO_VIEW, 'cluster')
    expect(await isComboDisabled(page, COMBO_NAMESPACE)).toBe(true)
})

test('the none view disables the namespace dropdown too', async () => {
    // Misma razon que en 'cluster': no hay recursos que elegir. Es lo que evita que el usuario crea
    // que tiene que seleccionar algo.
    await pickCombo(page, COMBO_VIEW, 'none')
    expect(await isComboDisabled(page, COMBO_NAMESPACE)).toBe(true)
})

test('selecting the none view does not query the cluster', async () => {
    /*
        El motivo de ser de la view 'none': un canal autonomo no toca el cluster, asi que elegir la
        view tampoco debe hacerlo. Antes del cambio, onChangeView llamaba a /config/namespace en todas
        las ramas, lo que ademas de ser una peticion inutil le saltaba un dialogo de error a quien no
        tuviera permiso para listar namespaces.
    */
    const calls: string[] = []
    const record = (url: string) => { if (url.includes('/config/')) calls.push(url) }
    page.on('request', request => record(request.url()))

    await pickCombo(page, COMBO_VIEW, 'namespace')   // parte de una view que si consulta
    await page.waitForTimeout(500)
    calls.length = 0

    await pickCombo(page, COMBO_VIEW, 'none')
    await page.waitForTimeout(1000)

    page.removeAllListeners('request')
    expect(calls, `la view 'none' no debe consultar el cluster, y ha pedido: ${calls.join(', ')}`).toHaveLength(0)
})

test('with the none view, channels that need the cluster are not selectable', async () => {
    /*
        Se comprueba por el lado que no depende de que haya un canal autonomo instalado: los canales
        que SI necesitan el cluster tienen que quedar fuera. Nombrar 'log' y 'metrics' es seguro
        porque son del core y siempre estan.

        No se asierta que un canal autonomo concreto este habilitado a proposito: este es un e2e del CORE, y no debe
        exigir que un plugin concreto este instalado para pasar.
    */
    await pickCombo(page, COMBO_VIEW, 'none')

    const count = await page.getByRole('combobox').count()
    await page.getByRole('combobox').nth(count - 1).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })

    const options = page.getByRole('option')
    const total = await options.count()
    expect(total, 'el desplegable de canales no deberia estar vacio').toBeGreaterThan(0)

    let checked = 0
    for (let index = 0; index < total; index++) {
        const option = options.nth(index)
        const name = (await option.innerText()).trim()
        if (name !== 'log' && name !== 'metrics') continue
        checked++
        const disabled = await option.getAttribute('aria-disabled')
        expect(disabled, `el canal '${name}' necesita recursos del cluster, no deberia ser elegible con la view 'none'`).toBe('true')
    }

    expect(checked, 'no se ha encontrado ningun canal del core en la lista: la asercion no ha probado nada').toBeGreaterThan(0)
    await page.keyboard.press('Escape')
})

test('with the cluster view, only cluster-capable channels are selectable', async () => {
    // Contraprueba de lo anterior: la view 'cluster' sigue ofreciendo canales, asi que el gate nuevo
    // no se ha llevado por delante el comportamiento anterior.
    await pickCombo(page, COMBO_VIEW, 'cluster')

    const count = await page.getByRole('combobox').count()
    await page.getByRole('combobox').nth(count - 1).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })

    const options = page.getByRole('option')
    const total = await options.count()
    let selectable = 0
    for (let index = 0; index < total; index++) {
        if (await options.nth(index).getAttribute('aria-disabled') !== 'true') selectable++
    }

    expect(selectable, 'la view cluster tiene que seguir ofreciendo canales elegibles').toBeGreaterThan(0)
    await page.keyboard.press('Escape')
})

test('the filter field of a dropdown keeps the focus while you type', async () => {
    /*
        El campo de filtro perdia el foco A CADA LETRA, en los cuatro desplegables: MenuList clona el
        item ACTIVO con autoFocus y lo recalcula en cada render, asi que al cambiar la lista filtrada
        otro MenuItem montaba con foco y se lo quitaba al campo. Solo entraba la primera letra.

        Por eso el test teclea VARIAS letras seguidas sin volver a pinchar y mira el VALOR: que el
        campo exista no prueba nada.
    */
    await pickCombo(page, COMBO_VIEW, 'namespace')
    await page.getByRole('combobox').nth(COMBO_NAMESPACE).click()

    const filter = page.getByPlaceholder('Filter...')
    await expect(filter).toBeVisible()
    // el foco lo tiene el campo nada mas abrir, sin pinchar en el
    await expect(filter).toBeFocused()

    await page.keyboard.type('kube', { delay: 60 })

    await expect(filter).toHaveValue('kube')
    await expect(filter).toBeFocused()

    // y filtra: lo que queda listado contiene lo tecleado
    // MUI cuela un option vacio (solo un espacio de ancho cero) como hueco del valor sin elegir; no es
    // un namespace, asi que fuera antes de comprobar nada. trim() no lo quita: U+200B no es espacio.
    const listed = (await page.getByRole('option').allInnerTexts()).map(t => t.replace(/​/g, '').trim()).filter(t => t !== '')
    expect(listed.length, 'el filtro no deberia dejar la lista vacia en un cluster con namespaces de sistema').toBeGreaterThan(0)
    expect(listed.filter(n => !n.toLowerCase().includes('kube')), `listados sin 'kube': ${listed.join(', ')}`).toHaveLength(0)

    // Escape cierra el desplegable aunque el foco siga en el campo
    await page.keyboard.press('Escape')
    await expect(filter).not.toBeVisible()
})
