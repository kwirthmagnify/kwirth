import { test } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo, GUIDE_MEDIA } from './helpers'

// Screenshots of the guide's AI config images (docs/_media/guide), from the pinocchio channel. Theme
// oscuro. Ejecutar a mano: playwright test capture-pinocchio-ai.spec.ts
//
// It needs the dev environment with at least one openai-compat provider in Kwirth's AI config: the
// screenshot of the providers dialog documents exactly that (Name / Type / Base URL / Load models).

// The screenshots go to the LIVE documentation: see GUIDE_MEDIA in helpers.ts.
const MEDIA = GUIDE_MEDIA
const COMPAT_PROVIDER = 'HUAWEI'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

test('capture ai-provider-config + ai-llm-config (dark)', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await page.setViewportSize({ width: 1600, height: 900 })
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

    // 'AI providers' and 'AI models' live inside the COLLAPSIBLE 'AI' group of the channel's Config
    // menu: it has to be expanded before they can be clicked.
    const openAiConfig = async (item: RegExp) => {
        await page.getByRole('button', { name: 'Config', exact: true }).click()
        await page.waitForTimeout(400)
        await page.getByRole('menuitem', { name: /^AI$/ }).click()
        await page.waitForTimeout(500)
        await page.getByRole('menuitem', { name: item }).click()
        await page.waitForTimeout(1000)
    }

    // 1) Providers: with an openai-compat selected, so Type + Base URL + Load models are visible.
    await openAiConfig(/^AI providers$/)
    const provDialog = page.getByRole('dialog')
    await provDialog.getByText(COMPAT_PROVIDER, { exact: true }).first().click()
    await page.waitForTimeout(800)   // margen para la animacion del dialogo
    await page.screenshot({ path: `${MEDIA}/ai-provider-config.png` })
    await provDialog.getByRole('button', { name: /^cancel$/i }).click()
    await page.waitForTimeout(600)

    // 2) LLMs, with one selected: that is the state the form is in while it is being edited, and the
    // one where the two columns — identity on the left, usage limits on the right — are both filled.
    await openAiConfig(/^AI models$/)
    const llmDialog = page.getByRole('dialog')
    await llmDialog.locator('.MuiListItemButton-root').first().click()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${MEDIA}/ai-llm-config.png` })
    await page.getByRole('dialog').getByRole('button', { name: /^cancel$/i }).click()
    await page.waitForTimeout(400)

    await page.goto('about:blank')
})
