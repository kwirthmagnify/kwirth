import { test } from '@playwright/test'
import { login, dismissOpenDialogs, openMenu, GUIDE_MEDIA } from './helpers'

// Screenshots of the guide's AI config images (docs/_media/guide). Theme oscuro. Ejecutar a mano:
// CAPTURES=1 playwright test tests/capture-pinocchio-ai.spec.ts
//
// It needs the dev environment with at least one openai-compat provider in Kwirth's AI config: the
// screenshot of the providers dialog documents exactly that (Name / Type / Base URL / Load models).
//
// 🔴 The dialogs are opened from the DRAWER, not from a pinocchio channel. They belong to the core and
// are shared by every AI plugin, so going through a channel tied this capture to a plugin that need not
// even be registered: on 2026-10-26 it failed outright because 'pinocchio' is not in kwirth-dev.json.

// The screenshots go to the LIVE documentation: see GUIDE_MEDIA in helpers.ts.
const MEDIA = GUIDE_MEDIA
const COMPAT_PROVIDER = 'HUAWEI'

test.use({ trace: 'off', screenshot: 'off', video: 'off' })

test('capture ai-provider-config + ai-llm-config (dark)', async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await page.setViewportSize({ width: 1600, height: 900 })
    await login(page)
    await dismissOpenDialogs(page)

    // 'AI Providers' and 'AI Models' live inside the COLLAPSIBLE 'AI Config' group of the drawer: it has
    // to be expanded before they can be clicked.
    const openAiConfig = async (item: RegExp) => {
        await dismissOpenDialogs(page)
        await openMenu(page)
        await page.getByRole('menuitem', { name: /AI Config/i }).click()
        await page.waitForTimeout(400)
        await page.getByRole('menuitem', { name: item }).click()
        await page.waitForTimeout(1000)
    }

    // A snackbar from the environment —a cluster that is down, say— lands on top of the dialog and ends
    // up in the guide as if it were part of it. Closing them one by one does not work: the front keeps
    // retrying the dead clusters and a new one arrives while the shot is being taken. Hidden by CSS for
    // the whole capture, which does not depend on timing.
    const dismissSnackbars = async () => {
        await page.addStyleTag({ content: '.MuiSnackbar-root { display: none !important; }' })
    }

    // 1) Providers: with an openai-compat selected, so Type + Base URL + Load models are visible.
    await openAiConfig(/^AI Providers$/)
    const provDialog = page.getByRole('dialog')
    // The whole list row, not the <p> inside it: with a snackbar sliding in and out over the page the
    // click on the text times out waiting for the element to be stable.
    await provDialog.locator('.MuiListItemButton-root', { hasText: COMPAT_PROVIDER }).first().click({ force: true })
    await page.waitForTimeout(800)   // margen para la animacion del dialogo
    await dismissSnackbars()
    await page.screenshot({ path: `${MEDIA}/ai-provider-config.png` })
    await provDialog.getByRole('button', { name: /^cancel$/i }).click()
    await page.waitForTimeout(600)

    // 2) LLMs, with one selected: that is the state the form is in while it is being edited, and the
    // one where the two columns — identity on the left, usage limits on the right — are both filled.
    await openAiConfig(/^AI Models$/)
    const llmDialog = page.getByRole('dialog')
    await llmDialog.locator('.MuiListItemButton-root').first().click()
    await page.waitForTimeout(800)
    await dismissSnackbars()
    await page.screenshot({ path: `${MEDIA}/ai-llm-config.png` })
    await page.getByRole('dialog').getByRole('button', { name: /^cancel$/i }).click()
    await page.waitForTimeout(400)

    await page.goto('about:blank')
})
