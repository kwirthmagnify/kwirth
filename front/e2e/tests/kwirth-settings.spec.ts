import { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clickMenuItem, dismissOpenDialogs, CARGA } from './helpers'

// Verifies that "Kwirth Settings" really persists: what is saved is still there on reopening the dialog,
// which is exactly what did NOT happen before (the value lived only in the provider's memory).
//
// NON-destructive: the current value is read, another one is tried, and it is restored at the end.

const INTERVAL_LABEL = 'Cluster metrics read interval (seconds)'

/** Opens the dialog and waits until it has finished loading its data (the field enables when it is done). */
async function openSettings(page: import('@playwright/test').Page) {
    await clickMenuItem(page, 'Kwirth settings')
    const field = page.getByLabel(INTERVAL_LABEL)
    await expect(field).toBeEnabled({ timeout: CARGA })
    return field
}

async function saveSettings(page: import('@playwright/test').Page) {
    const ok = page.getByRole('button', { name: 'OK' })
    await expect(ok).toBeEnabled()
    await ok.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 })
}

/*
    🔴 UN LOGIN PARA EL FICHERO. Habia uno por test, y cada uno es un arranque completo de la
    aplicacion: ~45 s cada uno para comprobaciones que duran segundos con el dialogo ya abierto. Nada
    aqui deja estado —el valor se restaura al final— asi que no hay nada que una pagina compartida
    pueda arrastrar de un test al siguiente.
*/
test.describe.serial('Kwirth settings', () => {
let page: Page

test.beforeAll(async ({ kwirth }) => {
    page = kwirth
    await dismissOpenDialogs(page)
})

// La pagina es de la CORRIDA, no de este fichero: se deja limpia, no se cierra.
test.afterAll(async () => { await dismissOpenDialogs(page).catch(() => {}) })

test('Kwirth settings: el intervalo de metricas se persiste y sobrevive a reabrir el dialogo', async () => {

    // snapshot of the current value, to restore it at the end
    let field = await openSettings(page)
    const original = await field.inputValue()
    expect(Number(original)).toBeGreaterThan(0)

    // a value different from the current one, so the assert does not pass by chance
    const testValue = String(Number(original) === 37 ? 41 : 37)

    try {
        await field.fill(testValue)
        await saveSettings(page)

        // reopen: the dialog re-reads from the back end, so this checks real persistence, not local state
        field = await openSettings(page)
        expect(await field.inputValue()).toBe(testValue)
        await dismissOpenDialogs(page)
    }
    finally {
        // restore the value the environment had
        const restore = await openSettings(page)
        await restore.fill(original)
        await saveSettings(page)
    }

    // and confirm that it was restored
    const after = await openSettings(page)
    expect(await after.inputValue()).toBe(original)
    await dismissOpenDialogs(page)
})

test('Kwirth settings: no deja guardar un intervalo no positivo', async () => {
    await dismissOpenDialogs(page)

    const field = await openSettings(page)
    const original = await field.inputValue()

    await field.fill('0')
    await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled()

    // it exits without saving; the environment's value is left intact
    await dismissOpenDialogs(page)
    const reopened = await openSettings(page)
    expect(await reopened.inputValue()).toBe(original)
    await dismissOpenDialogs(page)
})

/*
    Login access (plans/login-ip-filter). NON-destructive by construction: nothing here is ever saved.
    The only save attempted is one the back end REFUSES — a filter switched on with an allow list that
    leaves the browser out (192.0.2.0/24 is TEST-NET-1, reserved for documentation: nobody comes from
    there) — so there is nothing to restore, and the test checks that nothing was persisted.
*/
const ALLOWED_FIELDS = /^Allowed address \d+$/
const RESTRICT_LABEL = 'Restrict login to the allowed addresses'

async function openLoginAccess(page: Page) {
    await openSettings(page)
    await page.getByRole('tab', { name: 'Login access' }).click()
    await expect(page.getByRole('button', { name: 'Add localhost' })).toBeVisible()
}

// the line that says how the core resolved this browser
const sees = (page: Page) => page.locator('p', { hasText: 'How Kwirth sees you:' })

test('Login access: la pestana dice como ve Kwirth al admin, con todo a la vista', async () => {
    await dismissOpenDialogs(page)
    await openLoginAccess(page)
    // the address the core resolved for this browser: some address, never 'unknown' once loaded
    await expect(sees(page)).toBeVisible()
    await expect(sees(page)).not.toContainText('unknown')
    await expect(page.getByText(/^X-Forwarded-For: /)).toBeVisible()
    // nothing appears or disappears: the button and both lists are there whether they apply or not
    await expect(page.getByRole('button', { name: 'Trust my proxy' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add allowed address' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Add trusted proxy' })).toBeEnabled()
    await dismissOpenDialogs(page)
})

test('Login access: una entrada que no es IP ni CIDR pone el campo en rojo y desactiva OK', async () => {
    await dismissOpenDialogs(page)
    await openLoginAccess(page)
    const before = await page.getByLabel(ALLOWED_FIELDS).count()
    await page.getByRole('button', { name: 'Add allowed address' }).click()
    const field = page.getByLabel(`Allowed address ${before + 1}`, { exact: true })
    await field.fill('office-network')
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('button', { name: 'OK' })).toBeDisabled()
    await field.fill('10.0.0.0/8')
    await expect(field).toHaveAttribute('aria-invalid', 'false')
    await expect(page.getByRole('button', { name: 'OK' })).toBeEnabled()
    await dismissOpenDialogs(page)   // Cancel: nothing saved
})

test('Login access: "Add localhost" anade 127.0.0.1 y ::1 una sola vez', async () => {
    await dismissOpenDialogs(page)
    await openLoginAccess(page)
    const before = await page.getByLabel(ALLOWED_FIELDS).count()
    test.skip(before > 0, 'the environment already has allowed addresses: this test only runs on a clean list')
    const addLocalhost = page.getByRole('button', { name: 'Add localhost' })
    await addLocalhost.click()
    await expect(page.getByLabel('Allowed address 1', { exact: true })).toHaveValue('127.0.0.1')
    await expect(page.getByLabel('Allowed address 2', { exact: true })).toHaveValue('::1')
    // each one arrives with a comment that says what it is
    await expect(page.getByLabel('Allowed address 1 comment', { exact: true })).toHaveValue('localhost IPv4')
    await expect(page.getByLabel('Allowed address 2 comment', { exact: true })).toHaveValue('localhost IPv6')
    // both are there: pressing it again would add nothing, so it is disabled
    await expect(addLocalhost).toBeDisabled()
    await dismissOpenDialogs(page)   // Cancel: nothing saved
})

test('Login access: cada entrada de las dos listas lleva su comentario, editable y que no invalida nada', async () => {
    await dismissOpenDialogs(page)
    await openLoginAccess(page)
    for (const label of ['Allowed address', 'Trusted proxy']) {
        const before = await page.getByLabel(new RegExp(`^${label} \\d+$`)).count()
        await page.getByRole('button', { name: `Add ${label.toLowerCase()}` }).click()
        const address = page.getByLabel(`${label} ${before + 1}`, { exact: true })
        const comment = page.getByLabel(`${label} ${before + 1} comment`, { exact: true })
        // a new row comes with both fields, empty
        await expect(address).toHaveValue('')
        await expect(comment).toHaveValue('')
        await address.fill('10.0.0.0/8')
        // any text is a valid comment: it is never checked as an address
        await comment.fill('office VPN / 10.x')
        await expect(comment).toHaveValue('office VPN / 10.x')
        await expect(address).toHaveAttribute('aria-invalid', 'false')
    }
    await expect(page.getByRole('button', { name: 'OK' })).toBeEnabled()
    await dismissOpenDialogs(page)   // Cancel: nothing saved
})

test('Login access: "Add my IP" anade la direccion con la que Kwirth ve al admin, una sola vez', async () => {
    await dismissOpenDialogs(page)
    await openLoginAccess(page)
    // the dev browser talks to the back end directly: no forwarded header, so the address shown is its own
    const seen = ((await sees(page).textContent()) ?? '').match(/How Kwirth sees you:\s*(\S+)/)?.[1] ?? ''
    expect(seen).not.toBe('')
    const fields = page.getByLabel(ALLOWED_FIELDS)
    const already = (await fields.evaluateAll((els: Element[]) => els.map(e => (e as HTMLInputElement).value.trim()))).includes(seen)
    test.skip(already, 'the environment already allows this address: nothing to add')
    const addMyIp = page.getByRole('button', { name: 'Add my IP' })
    await expect(addMyIp).toBeEnabled()
    const before = await fields.count()
    await addMyIp.click()
    await expect(fields).toHaveCount(before + 1)
    await expect(fields.last()).toHaveValue(seen)
    await expect(page.getByLabel(`Allowed address ${before + 1} comment`, { exact: true })).toHaveValue('my IP')
    await expect(addMyIp).toBeDisabled()
    await dismissOpenDialogs(page)   // Cancel: nothing saved
})

test('🔴 Login access: activar con una lista que deja fuera al admin se rechaza, el dialogo sigue editable y no se guarda nada', async () => {
    await dismissOpenDialogs(page)
    await openLoginAccess(page)
    const restrict = page.getByLabel(RESTRICT_LABEL)
    const wasEnabled = await restrict.isChecked()
    const before = await page.getByLabel(ALLOWED_FIELDS).count()

    // the browser has to end up OUTSIDE the list, and a live filter is never touched
    test.skip(wasEnabled || before > 0, 'the environment already has a login filter or allowed addresses: this test only runs on a clean one')
    await restrict.check()
    await page.getByRole('button', { name: 'Add allowed address' }).click()
    await page.getByLabel(`Allowed address ${before + 1}`, { exact: true }).fill('192.0.2.0/24')

    const ok = page.getByRole('button', { name: 'OK' })
    await ok.click()
    // refused by the back end: the reason is shown, the dialog stays open and can still be fixed
    await expect(page.getByText(/saving it would lock you out/)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(ok).toBeEnabled()
    await expect(restrict).toBeEnabled()
    await dismissOpenDialogs(page)

    // and nothing was persisted
    await openLoginAccess(page)
    await expect(page.getByLabel(RESTRICT_LABEL)).not.toBeChecked()
    await expect(page.getByLabel(ALLOWED_FIELDS)).toHaveCount(0)
    await dismissOpenDialogs(page)
})
})
