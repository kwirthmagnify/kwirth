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

// The bottleneck is reloading the SPA, not Playwright: a single session for the whole file.
test.describe.configure({ mode: 'serial' })

// Order and position of the ADD dialog's dropdowns. They stay mounted at all times (they are disabled,
// not unmounted), so the indices are stable whichever view is chosen.
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
    // The dialog is cancelled: this file must leave nothing created.
    await dismissOpenDialogs(page).catch(() => {})
    await page.close()
})

test('the View dropdown offers the five resource views plus none', async () => {
    await openAddDialog(page)
    const names = await viewOptionNames(page)

    // The usual five have to still be there: removing one would break every channel.
    expect(names).toContain('cluster')
    expect(names).toContain('namespace')
    expect(names).toContain('controller')
    expect(names).toContain('pod')
    expect(names).toContain('container')
    // And the new one, for channels that do not need the cluster.
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
    // The same reason as in 'cluster': there are no resources to choose. It is what stops the user from
    // believing they have to select something.
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
    // The counter-check of the above: the 'cluster' view still offers channels, so the new gate has not
    // taken the previous behaviour down with it.
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
    // the field has focus as soon as it opens, without clicking on it
    await expect(filter).toBeFocused()

    await page.keyboard.type('kube', { delay: 60 })

    await expect(filter).toHaveValue('kube')
    await expect(filter).toBeFocused()

    // and it filters: what stays listed contains what was typed
    // MUI slips in an empty option (just a zero-width space) as the slot for the unchosen value; it is
    // not a namespace, so out it goes before checking anything. trim() does not remove it: U+200B is not
    // a space.
    const listed = (await page.getByRole('option').allInnerTexts()).map(t => t.replace(/​/g, '').trim()).filter(t => t !== '')
    expect(listed.length, 'el filtro no deberia dejar la lista vacia en un cluster con namespaces de sistema').toBeGreaterThan(0)
    expect(listed.filter(n => !n.toLowerCase().includes('kube')), `listados sin 'kube': ${listed.join(', ')}`).toHaveLength(0)

    // Escape closes the dropdown even while focus stays in the field
    await page.keyboard.press('Escape')
    await expect(filter).not.toBeVisible()
})

test('a resource view only offers channels that support per-resource invocation', async () => {
    /*
        La regla por view: 'cluster' ofrece los cluster-wide MAS los autonomos, 'none' solo los
        autonomos, y las cuatro de recurso solo los que declaran resourced.

        Esa ultima rama NO EXISTIA: con view 'namespace' (o pod, o…) se ofrecian todos los canales,
        incluido uno que no sabe arrancar por recurso, y addable() tampoco lo paraba porque solo mira
        que haya recursos elegidos.

        Se asierta con dos canales del core de bandera opuesta, que siempre estan: 'magnify' es
        cluster-wide y NO resourced, 'metrics' es resourced y no cluster-wide.
    */
    await pickCombo(page, COMBO_VIEW, 'namespace')

    const count = await page.getByRole('combobox').count()
    await page.getByRole('combobox').nth(count - 1).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })

    const estado = async (nombre: string): Promise<string | null> =>
        await page.getByRole('option').filter({ hasText: new RegExp(`^${nombre}$`) }).first().getAttribute('aria-disabled')

    expect(await estado('magnify'), 'magnify no soporta invocacion por recurso: con view namespace no deberia ser elegible').toBe('true')
    expect(await estado('metrics'), 'metrics si soporta invocacion por recurso: con view namespace tiene que ser elegible').not.toBe('true')

    await page.keyboard.press('Escape')
})

test('the cluster view also offers autonomous channels', async () => {
    // 'cluster' already offered the cluster-wide ones; what was missing is that a self-contained channel
    // should fit too, because if it needs nothing from the cluster, the view being cluster does not hurt it.
    await pickCombo(page, COMBO_VIEW, 'cluster')

    const count = await page.getByRole('combobox').count()
    await page.getByRole('combobox').nth(count - 1).click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })

    const magnify = await page.getByRole('option').filter({ hasText: /^magnify$/ }).first().getAttribute('aria-disabled')
    const metrics = await page.getByRole('option').filter({ hasText: /^metrics$/ }).first().getAttribute('aria-disabled')

    expect(magnify, 'magnify es cluster-wide: tiene que ser elegible con view cluster').not.toBe('true')
    expect(metrics, 'metrics no es cluster-wide ni autonomo: no deberia ser elegible con view cluster').toBe('true')

    await page.keyboard.press('Escape')
})
