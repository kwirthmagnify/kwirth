// Round-trip de un provider creado DESDE el canal pinocchio: name / type / endpoint deben sobrevivir a
// guardar → persistir en el almacen comun → releer al arrancar el canal.
//
// Motivo: con el pinocchio anterior, el desplegable 'Type' no ofrecia 'openai-compat', asi que un provider
// creado desde el canal se guardaba con el primer tipo de la lista ('google') y SIN Base URL — el name y el
// type quedaban mal y el proveedor no se podia construir.
//
// NO DESTRUCTIVO: usa un nombre con prefijo propio, y al terminar lo borra y comprueba que el resto de
// providers queda EXACTAMENTE como estaba.
import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

const E2E_PROVIDER = 'zz-e2e-compat'
const E2E_ENDPOINT = 'https://e2e.invalid/v1'
const E2E_KEY = 'zz-e2e-key-not-a-real-token'

interface IProviderSeen { name: string; type?: string; endpoint?: string; models: number }

test.describe.configure({ mode: 'serial' })

test.describe('pinocchio: round-trip de provider openai-compat', () => {
    let page: Page
    let providers: IProviderSeen[] = []
    let before: IProviderSeen[] = []

    const waitProviders = async (predicate: (p: IProviderSeen[]) => boolean, timeout = 20000) => {
        const deadline = Date.now() + timeout
        while (Date.now() < deadline) {
            if (predicate(providers)) return true
            await page.waitForTimeout(300)
        }
        return false
    }

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        page.on('websocket', ws => ws.on('framereceived', f => {
            const raw = typeof f.payload === 'string' ? f.payload : f.payload.toString()
            if (!raw.includes('"providers"')) return
            try {
                const msg = JSON.parse(raw)
                if (msg.providers) providers = msg.providers.map((p: { name: string, type?: string, endpoint?: string, models?: unknown[] }) =>
                    ({ name: p.name, type: p.type, endpoint: p.endpoint, models: p.models?.length ?? 0 }))
            }
            catch { /* frame no-json */ }
        }))

        await login(page)
        await dismissOpenDialogs(page)
        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.waitForTimeout(800)
        await pickCombo(page, 0, 'inCluster')
        await pickCombo(page, 1, 'cluster')
        await pickLastCombo(page, 'pinocchio')
        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.waitForTimeout(1500)
        await page.locator('button:has(svg[data-testid="SettingsIcon"])').first().click()
        await page.getByRole('menuitem', { name: /^Start$/ }).click()
        await page.waitForTimeout(4000)
        before = providers.filter(p => p.name !== E2E_PROVIDER)
        expect(before.length, 'el canal no ha recibido providers').toBeGreaterThan(0)
    })

    test.afterAll(async () => { await page?.close() })

    // 'AI providers' vive dentro del grupo PLEGABLE 'AI' del menu Config: hay que expandirlo primero.
    const openProviderDialog = async () => {
        await page.getByRole('button', { name: 'Config', exact: true }).click()
        await page.waitForTimeout(400)
        await page.getByRole('menuitem', { name: /^AI$/ }).click()
        await page.waitForTimeout(500)
        await page.getByRole('menuitem', { name: /^AI providers$/ }).click()
        await page.waitForTimeout(1000)
        return page.getByRole('dialog')
    }

    test('crear un provider openai-compat desde el canal guarda name, type y Base URL', async () => {
        const dlg = await openProviderDialog()
        await dlg.getByRole('button', { name: /^new$/i }).click()
        // El tipo se elige ANTES del nombre: el dialogo autorellena el nombre con el tipo si esta vacio,
        // y ademas el campo Base URL solo aparece cuando el tipo es openai-compat.
        await dlg.getByRole('combobox').first().click()
        await page.getByRole('option', { name: 'openai-compat', exact: true }).click()
        await dlg.getByLabel('Name', { exact: true }).fill(E2E_PROVIDER)
        await dlg.getByLabel('API Key / Token', { exact: true }).fill(E2E_KEY)
        await expect(dlg.getByLabel('Base URL', { exact: true })).toBeVisible()
        await dlg.getByLabel('Base URL', { exact: true }).fill(E2E_ENDPOINT)
        await dlg.getByRole('button', { name: /^add$/i }).click()
        await dlg.getByRole('button', { name: /^save$/i }).click()

        const arrived = await waitProviders(ps => ps.some(p => p.name === E2E_PROVIDER))
        expect(arrived, 'el back no devolvio el provider recien creado').toBe(true)

        const created = providers.find(p => p.name === E2E_PROVIDER)!
        expect(created.name).toBe(E2E_PROVIDER)
        expect(created.type).toBe('openai-compat')
        expect(created.endpoint).toBe(E2E_ENDPOINT)
    })

    test('al releerlo, el dialogo pinta name, type y Base URL tal cual se guardaron', async () => {
        const dlg = await openProviderDialog()
        await dlg.getByText(E2E_PROVIDER, { exact: true }).first().click()
        await page.waitForTimeout(400)
        expect(await dlg.getByLabel('Name', { exact: true }).inputValue()).toBe(E2E_PROVIDER)
        expect((await dlg.getByRole('combobox').first().innerText()).trim()).toBe('openai-compat')
        expect(await dlg.getByLabel('Base URL', { exact: true }).inputValue()).toBe(E2E_ENDPOINT)
        expect(await dlg.getByLabel('API Key / Token', { exact: true }).inputValue()).toBe(E2E_KEY)
        await dlg.getByRole('button', { name: /^cancel$/i }).click()
        await page.waitForTimeout(400)
    })

    test('limpieza: al borrarlo el resto de providers queda igual que antes', async () => {
        const dlg = await openProviderDialog()
        await dlg.getByText(E2E_PROVIDER, { exact: true }).first().click()
        await page.waitForTimeout(300)
        await dlg.getByRole('button', { name: /^remove$/i }).click()
        await dlg.getByRole('button', { name: /^save$/i }).click()

        const gone = await waitProviders(ps => !ps.some(p => p.name === E2E_PROVIDER))
        expect(gone, 'el provider de test no se ha borrado').toBe(true)

        // identidad de cada provider preservada (el numero de modelos SI puede variar: el back los recarga
        // del proveedor real en cada save)
        expect(providers.map(p => `${p.name}|${p.type ?? ''}|${p.endpoint ?? ''}`))
            .toEqual(before.map(p => `${p.name}|${p.type ?? ''}|${p.endpoint ?? ''}`))
    })
})
