import { test } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

// Captura de las imagenes de AI config de la guia (docs/_media/guide), desde el canal pinocchio. Tema
// oscuro. Ejecutar a mano: playwright test capture-pinocchio-ai.spec.ts
//
// Requiere el dev con al menos un provider de tipo openai-compat en el AI config de Kwirth: la captura
// del dialogo de providers documenta justo eso (Name / Type / Base URL / Load models).

const MEDIA = 'C:/github/aisdkvercel/kwirth/docs/0.5.287/_media/guide'
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

    // 1) Providers: con un openai-compat seleccionado, para que se vea Type + Base URL + Load models.
    await page.getByRole('button', { name: 'Config', exact: true }).click()
    await page.getByRole('menuitem', { name: /^Provider$/ }).click()
    await page.waitForTimeout(1000)
    const provDialog = page.getByRole('dialog')
    await provDialog.getByText(COMPAT_PROVIDER, { exact: true }).first().click()
    await page.waitForTimeout(800)   // margen para la animacion del dialogo
    await page.screenshot({ path: `${MEDIA}/ai-provider-config.png` })
    await provDialog.getByRole('button', { name: /^cancel$/i }).click()
    await page.waitForTimeout(600)

    // 2) LLMs.
    await page.getByRole('button', { name: 'Config', exact: true }).click()
    await page.getByRole('menuitem', { name: /^LLM$/ }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${MEDIA}/ai-llm-config.png` })
    await page.getByRole('dialog').getByRole('button', { name: /^cancel$/i }).click()
    await page.waitForTimeout(400)

    await page.goto('about:blank')
})
