/*
    The resource selector: the views and the channel gate.

    This file exists because while wiring up the 'none' view (see plans/completed/instance-view-none/PLAN.md) it
    was found that the ResourceSelector had NO e2e of its own, being the component EVERY channel uses to
    start. Pinocchio's specs touch it in passing (the 'cluster' view), but nobody checked that the five
    resource views are still there nor that the dropdowns get enabled as they should.

    It is NON-DESTRUCTIVE on purpose: it only opens the ADD dialog, walks the View dropdown and cancels
    it. It creates not a single tab, so it does not touch the user's workspace.
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
        The 'none' view's reason for being: an autonomous channel does not touch the cluster, so
        choosing the view must not either. Before the change, onChangeView called /config/namespace on
        every branch, which besides being a useless request popped an error dialog at anybody without
        permission to list namespaces.
    */
    const calls: string[] = []
    const record = (url: string) => { if (url.includes('/config/')) calls.push(url) }
    page.on('request', request => record(request.url()))

    await pickCombo(page, COMBO_VIEW, 'namespace')   // start from a view that does query
    await page.waitForTimeout(500)
    calls.length = 0

    await pickCombo(page, COMBO_VIEW, 'none')
    await page.waitForTimeout(1000)

    page.removeAllListeners('request')
    expect(calls, `la view 'none' no debe consultar el cluster, y ha pedido: ${calls.join(', ')}`).toHaveLength(0)
})

test('with the none view, channels that need the cluster are not selectable', async () => {
    /*
        It is checked from the side that does not depend on an autonomous channel being installed: the
        channels that DO need the cluster have to be left out. Naming 'log' and 'metrics' is safe
        because they belong to the core and are always there.

        That a particular autonomous channel is enabled is deliberately not asserted: this is a CORE
        e2e, and it must not demand a particular plugin be installed in order to pass.
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
        The filter field lost focus ON EVERY LETTER, in all four dropdowns: MenuList clones the ACTIVE
        item with autoFocus and recomputes it on every render, so when the filtered list changed another
        MenuItem mounted with focus and took it away from the field. Only the first letter got in.

        That is why the test types SEVERAL letters in a row without clicking again and looks at the
        VALUE: the field existing proves nothing.
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
        The rule per view: 'cluster' offers the cluster-wide ones PLUS the autonomous ones, 'none' only
        the autonomous ones, and the four resource ones only those declaring resourced.

        That last branch DID NOT EXIST: with view 'namespace' (or pod, or…) every channel was offered,
        including one that does not know how to start per resource, and addable() did not stop it either
        because it only looks at whether resources have been chosen.

        It is asserted with two core channels of opposite flags, which are always there: 'magnify' is
        cluster-wide and NOT resourced, 'metrics' is resourced and not cluster-wide.
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
