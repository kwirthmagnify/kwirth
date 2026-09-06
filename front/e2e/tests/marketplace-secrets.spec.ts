import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// Verifica la UX acordada para los campos secreto de un marketplace: el valor guardado VUELVE al
// formulario ya relleno y enmascarado, y el ojo lo revela. Antes el back solo decia si existia
// (hasPassword/hasToken), el campo salia vacio con la etiqueta 'already set' y el ojo no ensenaba nada.
//
// ─── POR QUE ESTE TEST ES TAN DESCONFIADO ────────────────────────────────────────────────────────
// Una version anterior escribio su token de prueba ENCIMA del marketplace real del usuario y le dejo
// el catalogo privado sin autenticar durante un rato.
//
// La causa: getByLabel casa por SUBSTRING, no por igualdad. 'Token' casa tambien el checkbox 'Manifest
// needs a token', que en el DOM va ANTES del campo, asi que con N filas hay 2N coincidencias y el
// .nth(i) por fila apunta a otra cosa: con una fila guardada y otra nueva, .nth(1) es el campo Token de
// la PRIMERA fila. De ahi que el token de prueba acabara en el marketplace del usuario.
//
// Por eso ahora, y hay que mantenerlo asi:
//   1. TODOS los getByLabel llevan { exact: true } — sin eso los indices por fila no significan nada;
//   2. snapshot COMPLETO de los settings por API antes de tocar nada, y restauracion literal al final;
//   3. no se escribe en una fila hasta comprobar que esta VACIA (una fila con datos no es la nueva);
//   4. se asserta explicitamente que las filas preexistentes salen intactas, justo tras guardar.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

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

/** Los settings tal cual los sirve el back, secretos incluidos. Se usan para snapshot y restauracion. */
async function readSettings(page: Page, s: ISession): Promise<Record<string, unknown>> {
    return await page.evaluate(async ([backend, a]) =>
        await (await fetch(`${backend}/core/settings`, { headers: { Authorization: a } })).json(),
    [s.backend, s.auth])
}

async function writeMarketplaces(page: Page, s: ISession, marketplaces: unknown): Promise<void> {
    await page.evaluate(async ([backend, a, mkps]) => {
        await fetch(`${backend}/core/settings`, {
            method: 'PUT',
            headers: { Authorization: a as string, 'Content-Type': 'application/json' },
            body: JSON.stringify({ marketplaces: mkps })
        })
    }, [s.backend, s.auth, marketplaces] as [string, string, unknown])
}

/** Huella comparable de un marketplace, para detectar si el test le ha tocado algo. */
const fingerprint = (m: Record<string, any>) =>
    JSON.stringify({ id: m.id, label: m.label, url: m.url, enabled: m.enabled, auth: m.auth, manifestAuth: m.manifestAuth })

async function openMarketplaces(page: Page) {
    await clickMenuItem(page, 'Kwirth Settings')
    await expect(dlg(page).getByLabel('Cluster metrics read interval (seconds)', { exact: true })).toBeEnabled({ timeout: 10000 })
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
    const names = dlg(page).getByLabel('Name', { exact: true })
    for (let i = 0; i < await names.count(); i++) {
        if (await names.nth(i).inputValue() === label) return i
    }
    return -1
}

test('el secreto de un marketplace vuelve relleno y enmascarado, y el ojo lo revela', async ({ page }) => {
    const s = await captureSession(page)

    // SNAPSHOT: lo que habia antes de tocar nada. Se restaura literalmente en el finally.
    const original = await readSettings(page, s)
    const originalMkps = (original.marketplaces ?? []) as Record<string, any>[]
    const originalPrints = originalMkps.map(fingerprint)

    try {
        // --- crear la fila de prueba con sus dos secretos ---
        await openMarketplaces(page)

        // esperar a que el dialogo haya pintado las filas YA guardadas antes de contar: si se cuenta
        // demasiado pronto, el indice de la fila nueva cae sobre una existente y se sobrescribe
        await expect(dlg(page).getByLabel('Manifest URL', { exact: true })).toHaveCount(originalMkps.length)

        await page.getByRole('button', { name: 'Add marketplace' }).click()
        await expect(dlg(page).getByLabel('Manifest URL', { exact: true })).toHaveCount(originalMkps.length + 1)

        const i = originalMkps.length   // la fila recien anadida es la ultima

        // GUARDA: la fila destino tiene que estar vacia. Si trae datos, no es la nueva y escribir ahi
        // destruiria un marketplace del usuario.
        expect(await dlg(page).getByLabel('Name', { exact: true }).nth(i).inputValue(), 'la fila destino no esta vacia').toBe('')
        expect(await dlg(page).getByLabel('Manifest URL', { exact: true }).nth(i).inputValue(), 'la fila destino no esta vacia').toBe('')

        await dlg(page).getByLabel('Name', { exact: true }).nth(i).fill(TEST_LABEL)
        await dlg(page).getByLabel('Manifest URL', { exact: true }).nth(i).fill(TEST_URL)
        await dlg(page).getByLabel('Manifest needs a token', { exact: true }).nth(i).check()
        await dlg(page).getByLabel('Token', { exact: true }).nth(i).fill(TEST_TOKEN)
        await dlg(page).getByLabel('Package registry needs credentials', { exact: true }).nth(i).check()
        await dlg(page).getByLabel('User', { exact: true }).nth(i).fill(TEST_USER)
        await dlg(page).getByLabel('Password', { exact: true }).nth(i).fill(TEST_PASS)

        await saveSettings(page)

        // --- lo primero tras guardar: comprobar que no se ha tocado nada ajeno ---
        const afterSave = (await readSettings(page, s)).marketplaces as Record<string, any>[]
        for (const before of originalMkps) {
            const now = afterSave.find(m => m.id === before.id)
            expect(now, `el marketplace '${before.label}' ha desaparecido`).toBeTruthy()
            expect(fingerprint(now!), `el test ha modificado el marketplace '${before.label}'`).toBe(fingerprint(before))
        }

        // --- reabrir: el dialogo relee del back, asi que esto es persistencia real ---
        await openMarketplaces(page)
        const j = await rowIndexOf(page, TEST_LABEL)
        expect(j, 'la fila de prueba deberia haberse guardado').toBeGreaterThanOrEqual(0)

        const password = dlg(page).getByLabel('Password', { exact: true }).nth(j)
        const token = dlg(page).getByLabel('Token', { exact: true }).nth(j)
        const user = dlg(page).getByLabel('User', { exact: true }).nth(j)

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
        await expect(dlg(page).getByLabel('Password (already set)', { exact: true })).toHaveCount(0)
        await expect(dlg(page).getByLabel('Token (already set)', { exact: true })).toHaveCount(0)

        await dismissOpenDialogs(page)
    }
    finally {
        // RESTAURACION: se reescribe el snapshot literal, no se "quita lo mio". Asi el entorno vuelve a
        // como estaba aunque el test haya fallado a mitad o haya tocado algo que no debia.
        await writeMarketplaces(page, s, originalMkps)
    }

    // --- y se comprueba que quedo restaurado, huella a huella ---
    const restored = (await readSettings(page, s)).marketplaces as Record<string, any>[]
    expect(restored.map(fingerprint), 'los marketplaces no han quedado como estaban').toEqual(originalPrints)
})
