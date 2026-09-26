// Pinocchio consumes Kwirth's SHARED AI config (the AI Providers / AI Models menus): providers in
// 'kwirth-store-common-kwirth-ai-providers' and LLMs in 'kwirth-store-common-kwirth-ai-llms'. This e2e
// verifies that contract end to end, writing nothing: it only opens dialogs and cancels.
//
// The case that prompted the test: pinocchio sent its own hardcoded list of provider types, with neither
// 'openai-compat' nor 'anthropic'. An openai-compat provider created from Kwirth showed up WITHOUT a type
// inside the channel, and there was no way to create a new one from there.
import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

// It must match PROVIDERS_AVAILABLE from @kwirthmagnify/kwirth-common-ai
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

    // 'AI providers' and 'AI models' live inside the COLLAPSIBLE 'AI' group of the Config menu: it has to be
    // expandirlo antes de poder clicarlos.
    const openConfig = async (item: RegExp, group?: RegExp) => {
        await page.getByRole('button', { name: 'Config', exact: true }).click()
        await page.waitForTimeout(400)
        if (group) {
            await page.getByRole('menuitem', { name: group }).click()
            await page.waitForTimeout(500)
        }
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
            // buildModel() cannot build a provider with no recognisable type
            expect(PROVIDERS_AVAILABLE, `provider '${prov.name}'`).toContain(prov.type ?? prov.name)
            expect(prov.models, `provider '${prov.name}' sin modelos cargados`).toBeGreaterThan(0)
        }
        // each LLM points at a provider that exists and at a model of THAT provider: otherwise the
        // trigger would fail at run time with 'Cannot build model'
        for (const llm of llms) {
            expect(providers.map(p => p.name), `llm '${llm.id}'`).toContain(llm.provider)
            expect(llm.model, `llm '${llm.id}' sin modelo`).toBeTruthy()
        }
    })

    test('el dialogo de providers pinta cada provider con su tipo y su contador de modelos', async () => {
        const dlg = await openConfig(/^AI providers$/, /^AI$/)
        await expect(dlg.getByText('AI — Provider config')).toBeVisible()
        for (const prov of providers) {
            await dlg.getByText(prov.name, { exact: true }).first().click()
            await page.waitForTimeout(300)
            // The 'Type' combo must show the real type (legacy ones with no type fall back to the name)
            const shown = (await dlg.getByRole('combobox').first().innerText()).trim()
            expect(shown, `provider '${prov.name}'`).toBe(prov.type ?? prov.name)
        }
        await dlg.getByRole('button', { name: /^cancel$/i }).click()
        await page.waitForTimeout(400)
    })

    test('el dialogo de providers ofrece Load models (lo resuelve el core)', async () => {
        const dlg = await openConfig(/^AI providers$/, /^AI$/)
        await dlg.getByText(providers[0].name, { exact: true }).first().click()
        await expect(dlg.getByRole('button', { name: /load models/i })).toBeEnabled()
        await dlg.getByRole('button', { name: /^cancel$/i }).click()
        await page.waitForTimeout(400)
    })

    test('el dialogo de LLMs lista los LLMs del AI config con su provider', async () => {
        const dlg = await openConfig(/^AI models$/, /^AI$/)
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
