import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// Verifica la UX acordada para los campos secreto de un marketplace: el valor guardado VUELVE al
// formulario ya relleno y enmascarado, y el ojo lo revela. Antes el back solo decia si existia
// (hasPassword/hasToken), el campo salia vacio con la etiqueta 'already set' y el ojo no ensenaba nada.
//
// NO destructivo: crea SU PROPIA fila, reconocible por el nombre, y la borra al terminar pase lo que
// pase. La limpieza va por API en vez de por el dialogo, para que no dependa de que la UI coopere.
// No toca los marketplaces que ya hubiera configurados.

const TEST_LABEL = 'e2e-secret-check'
const TEST_URL = 'https://e2e-secret-check.invalid/manifest.json'
const TEST_USER = 'e2e-user'
const TEST_PASS = 'e2e-s3cr3t-pass'
const TEST_TOKEN = 'glpat-e2e-t0ken'

/** El DOM de Kwirth es compartido: sin acotar al dialogo, getByLabel alcanza workspaces y tabs. */
const dlg = (page: Page) => page.locator('[role="dialog"]').last()

interface ISession { auth: string; backend: string }

async function captureSession(page: Page): Promise<ISession> {
    const found: ISession = { auth: '', backend: '' }
    page.on('request', req => {
        const h = req.headers()['authorization']
        if (h && !found.auth && req.url().includes('/config/')) {
            found.auth = h
            found.backend = new URL(req.url()).origin
        }
    })
    await login(page)
    await dismissOpenDialogs(page)
    await expect.poll(() => found.auth, { timeout: 15000 }).not.toBe('')
    return found
}

async function openMarketplaces(page: Page) {
    await clickMenuItem(page, 'Kwirth Settings')
    await expect(dlg(page).getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: 10000 })
    await page.getByRole('tab', { name: 'Marketplaces' }).click()
}

async function saveSettings(page: Page) {
    const ok = page.getByRole('button', { name: 'OK' })
    await expect(ok).toBeEnabled()
    await ok.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 10000 })
}

// Cada fila aporta exactamente un campo de cada etiqueta, asi que el indice del 'Name' identifica la fila.
async function rowIndexOf(page: Page, label: string): Promise<number> {
    const names = dlg(page).getByLabel('Name')
    for (let i = 0; i < await names.count(); i++) {
        if (await names.nth(i).inputValue() === label) return i
    }
    return -1
}

/** Deja los marketplaces sin la fila de prueba, hable con el dialogo o no. */
async function cleanUp(page: Page, s: ISession) {
    await page.evaluate(async ([backend, a, label]) => {
        const settings = await (await fetch(`${backend}/core/settings`, { headers: { Authorization: a } })).json()
        const kept = (settings.marketplaces ?? []).filter((m: { label: string }) => m.label !== label)
        if (kept.length === (settings.marketplaces ?? []).length) return
        await fetch(`${backend}/core/settings`, {
            method: 'PUT',
            headers: { Authorization: a, 'Content-Type': 'application/json' },
            body: JSON.stringify({ marketplaces: kept })
        })
    }, [s.backend, s.auth, TEST_LABEL])
}

test('el secreto de un marketplace vuelve relleno y enmascarado, y el ojo lo revela', async ({ page }) => {
    const s = await captureSession(page)

    try {
        // --- crear la fila de prueba con sus dos secretos ---
        await openMarketplaces(page)
        const before = await dlg(page).getByLabel('Manifest URL').count()
        await page.getByRole('button', { name: 'Add marketplace' }).click()
        await expect(dlg(page).getByLabel('Manifest URL')).toHaveCount(before + 1)

        const i = before   // la fila recien anadida es la ultima
        await dlg(page).getByLabel('Name').nth(i).fill(TEST_LABEL)
        await dlg(page).getByLabel('Manifest URL').nth(i).fill(TEST_URL)
        await dlg(page).getByLabel('Manifest needs a token').nth(i).check()
        await dlg(page).getByLabel('Token').nth(i).fill(TEST_TOKEN)
        await dlg(page).getByLabel('Package registry needs credentials').nth(i).check()
        await dlg(page).getByLabel('User').nth(i).fill(TEST_USER)
        await dlg(page).getByLabel('Password').nth(i).fill(TEST_PASS)

        await saveSettings(page)

        // --- reabrir: el dialogo relee del back, asi que esto es persistencia real ---
        await openMarketplaces(page)
        const j = await rowIndexOf(page, TEST_LABEL)
        expect(j, 'la fila de prueba deberia haberse guardado').toBeGreaterThanOrEqual(0)

        const password = dlg(page).getByLabel('Password').nth(j)
        const token = dlg(page).getByLabel('Token').nth(j)
        const user = dlg(page).getByLabel('User').nth(j)

        // 1. el secreto VUELVE, relleno (antes el campo salia vacio)
        await expect(password).toHaveValue(TEST_PASS)
        await expect(token).toHaveValue(TEST_TOKEN)
        await expect(user).toHaveValue(TEST_USER)

        // 2. y enmascarado
        await expect(password).toHaveAttribute('type', 'password')
        await expect(token).toHaveAttribute('type', 'password')

        // 3. el ojo lo revela — y sin ir al back, que ya no hay endpoint de revelado.
        // El ojo vive en el adorno del propio campo, asi que se busca desde el input y no por indice
        // global: contar ojos de todas las filas es fragil.
        const eyeOf = (field: typeof token) => field.locator('xpath=..').getByRole('button')
        const requests: string[] = []
        page.on('request', r => requests.push(r.url()))

        await eyeOf(token).click()
        await expect(token).toHaveAttribute('type', 'text')
        await expect(token).toHaveValue(TEST_TOKEN)
        expect(requests.some(u => u.includes('/secrets')), 'el ojo no debe llamar al back').toBe(false)

        await eyeOf(password).click()
        await expect(password).toHaveAttribute('type', 'text')
        await expect(password).toHaveValue(TEST_PASS)

        // 4. y vuelven a ocultarse, cada uno por su cuenta
        await eyeOf(token).click()
        await expect(token).toHaveAttribute('type', 'password')
        await expect(password).toHaveAttribute('type', 'text', { timeout: 2000 })

        // 5. la etiqueta ya no miente con 'already set'
        await expect(dlg(page).getByLabel('Password (already set)')).toHaveCount(0)
        await expect(dlg(page).getByLabel('Token (already set)')).toHaveCount(0)

        await dismissOpenDialogs(page)
    }
    finally {
        await cleanUp(page, s)
    }

    // --- el entorno queda como estaba ---
    await openMarketplaces(page)
    expect(await rowIndexOf(page, TEST_LABEL), 'la fila de prueba no debe quedarse').toBe(-1)
    await dismissOpenDialogs(page)
})
