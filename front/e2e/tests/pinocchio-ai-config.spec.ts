// Pinocchio consume el AI config COMPARTIDO de Kwirth (menus AI Providers / AI Models): providers en
// 'kwirth-store-common-kwirth-ai-providers' y LLMs en 'kwirth-store-common-kwirth-ai-llms'. Este e2e
// verifica ese contrato de punta a punta, sin escribir nada: solo abre dialogos y cancela.
//
// El caso que motivo el test: pinocchio mandaba su propia lista de tipos de provider hardcodeada, sin
// 'openai-compat' ni 'anthropic'. Un provider openai-compat creado desde Kwirth se veia SIN tipo dentro
// del canal, y no habia forma de crear uno nuevo desde ahi.
import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

// Debe coincidir con PROVIDERS_AVAILABLE de @kwirthmagnify/kwirth-common-ai
const PROVIDERS_AVAILABLE = ['google', 'openai', 'openrouter', 'mistral', 'groq', 'deepseek', 'anthropic', 'openai-compat']

interface IProviderSeen { name: string; type?: string; models: number }
interface ILlmSeen { id: string; provider: string; model: string }

test.describe.configure({ mode: 'serial' })

test.describe('pinocchio: AI config compartido de Kwirth', () => {
    let page: Page
    let providersAvailable: string[] = []
    let providers: IProviderSeen[] = []
    let llms: ILlmSeen[] = []

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        page.on('websocket', ws => ws.on('framereceived', f => {
            const raw = typeof f.payload === 'string' ? f.payload : f.payload.toString()
            if (!raw.includes('pinocchio')) return
            try {
                const msg = JSON.parse(raw)
                if (msg.providersAvailable) providersAvailable = msg.providersAvailable
                if (msg.providers) providers = msg.providers.map((p: { name: string, type?: string, models?: unknown[] }) => ({ name: p.name, type: p.type, models: p.models?.length ?? 0 }))
                if (msg.config?.llms) llms = msg.config.llms.map((l: ILlmSeen) => ({ id: l.id, provider: l.provider, model: l.model }))
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
    })

    test.afterAll(async () => { await page?.close() })

    const openConfig = async (item: RegExp) => {
        await page.getByRole('button', { name: 'Config', exact: true }).click()
        await page.getByRole('menuitem', { name: item }).click()
        await page.waitForTimeout(1000)
        return page.getByRole('dialog')
    }

    test('el back anuncia los MISMOS tipos de provider que el core', async () => {
        expect(providersAvailable).toEqual(PROVIDERS_AVAILABLE)
    })

    test('el canal recibe los providers y los LLMs del AI config de Kwirth', async () => {
        expect(providers.length).toBeGreaterThan(0)
        expect(llms.length).toBeGreaterThan(0)
        for (const prov of providers) {
            // un provider sin tipo reconocible no lo puede construir buildModel()
            expect(PROVIDERS_AVAILABLE, `provider '${prov.name}'`).toContain(prov.type ?? prov.name)
            expect(prov.models, `provider '${prov.name}' sin modelos cargados`).toBeGreaterThan(0)
        }
        // cada LLM apunta a un provider que existe y a un modelo de ESE provider: si no, el trigger
        // fallaria en tiempo de ejecucion con 'Cannot build model'
        for (const llm of llms) {
            expect(providers.map(p => p.name), `llm '${llm.id}'`).toContain(llm.provider)
            expect(llm.model, `llm '${llm.id}' sin modelo`).toBeTruthy()
        }
    })

    test('el dialogo de providers pinta cada provider con su tipo y su contador de modelos', async () => {
        const dlg = await openConfig(/^Provider$/)
        await expect(dlg.getByText('AI — Provider config')).toBeVisible()
        for (const prov of providers) {
            await dlg.getByText(prov.name, { exact: true }).first().click()
            await page.waitForTimeout(300)
            // El combo 'Type' debe mostrar el tipo real (los legacy sin type caen al nombre)
            const shown = (await dlg.getByRole('combobox').first().innerText()).trim()
            expect(shown, `provider '${prov.name}'`).toBe(prov.type ?? prov.name)
        }
        await dlg.getByRole('button', { name: /^cancel$/i }).click()
        await page.waitForTimeout(400)
    })

    test('el dialogo de providers ofrece Load models (lo resuelve el core)', async () => {
        const dlg = await openConfig(/^Provider$/)
        await dlg.getByText(providers[0].name, { exact: true }).first().click()
        await expect(dlg.getByRole('button', { name: /load models/i })).toBeEnabled()
        await dlg.getByRole('button', { name: /^cancel$/i }).click()
        await page.waitForTimeout(400)
    })

    test('el dialogo de LLMs lista los LLMs del AI config con su provider', async () => {
        const dlg = await openConfig(/^LLM$/)
        await expect(dlg.getByText('AI — LLM config')).toBeVisible()
        const listText = await dlg.locator('.MuiList-root').first().innerText()
        for (const llm of llms) {
            expect(listText).toContain(llm.id)
            expect(listText).toContain(llm.provider)
        }
        await dlg.getByRole('button', { name: /^cancel$/i }).click()
        await page.waitForTimeout(400)
    })
})
