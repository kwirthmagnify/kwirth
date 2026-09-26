import { test, Page, Locator } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

// Screenshots for Pinocchio's guide (plugins/pinocchio/docs/guide/images). Dark theme.
// Ejecutar a mano: playwright test --config playwright.capture.config.ts capture-pinocchio-guide.spec.ts
//
// NON-DESTRUCTIVE: every dialog is closed with Cancel. No OK, no Save, no Download, no Clear back —
// the user's pinocchio config is not touched. The example triggers are created inside the dialog (which
// works on a local copy) and die with the Cancel.

const IMG = 'C:/github/aisdkvercel/kwirth/plugins/pinocchio/docs/guide/images'
const PAUSE = 800   // margen para la animacion de los dialogos de MUI

test.use({ trace: 'off', screenshot: 'off', video: 'off' })
test.setTimeout(240_000)

// The Config menu has 'AI' as a COLLAPSIBLE group (providers/models inside) and then Trigger and
// Import / Export loose. `group` expands the group before clicking the entry.
const openConfig = async (page: Page, item: RegExp, group?: RegExp) => {
    await page.getByRole('button', { name: 'Config', exact: true }).click()
    await page.waitForTimeout(400)
    if (group) {
        await page.getByRole('menuitem', { name: group }).click()
        await page.waitForTimeout(500)
    }
    await page.getByRole('menuitem', { name: item }).click()
    await page.waitForTimeout(1200)
    return page.getByRole('dialog').first()
}

// MUI Selects with an InputLabel do not respond to getByLabel (the label is not associated with the
// combobox), so we locate the FormControl by the EXACT text of its label and click its combo.
const pickByLabel = async (page: Page, scope: Locator, label: string, option: string) => {
    await scope.locator(`.MuiFormControl-root:has(> label:text-is("${label}")) [role="combobox"]`).first().click()
    await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
    await page.getByRole('option', { name: option, exact: true }).click()
    await page.waitForTimeout(400)
}

const cancel = async (page: Page) => {
    const dlg = page.getByRole('dialog').first()
    for (const name of [/^cancel$/i, /^close$/i]) {
        const btn = dlg.getByRole('button', { name })
        if (await btn.count() > 0) { await btn.first().click(); break }
    }
    await page.waitForTimeout(600)
}

test('capturas de la guia de pinocchio (dark)', async ({ page }) => {
    let llms: { id: string }[] = []
    let triggers: { id: string }[] = []

    page.on('websocket', ws => ws.on('framereceived', f => {
        const raw = typeof f.payload === 'string' ? f.payload : f.payload.toString()
        if (!raw.includes('pinocchio')) return
        try {
            const msg = JSON.parse(raw)
            if (msg.config?.llms) llms = msg.config.llms
            if (msg.config?.triggers) triggers = msg.config.triggers
        }
        catch { /* frame no-json */ }
    }))

    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await page.setViewportSize({ width: 1600, height: 900 })
    await login(page)
    await dismissOpenDialogs(page)

    // ── Open the channel ────────────────────────────────────────────────────────────────────────────
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

    console.log(`[capture] LLMs: ${llms.map(l => l.id).join(', ') || '(ninguno)'}`)
    console.log(`[capture] triggers: ${triggers.map(t => t.id).join(', ') || '(ninguno)'}`)

    // 1) The channel's tab
    await page.screenshot({ path: `${IMG}/ui-tab.png` })

    // 2) The Config menu with the 'AI' group expanded (collapsed it hides providers and models)
    await page.getByRole('button', { name: 'Config', exact: true }).click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^AI$/ }).click()
    await page.waitForTimeout(PAUSE)
    await page.screenshot({ path: `${IMG}/ui-config-menu.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // 3) The Clear dialog (capture only, never press Clear back!)
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await page.waitForTimeout(PAUSE)
    await page.screenshot({ path: `${IMG}/ui-clear-dialog.png` })
    await cancel(page)

    // 4) Providers de IA
    const provDlg = await openConfig(page, /^AI providers$/, /^AI$/)
    const firstProv = provDlg.locator('.MuiListItemButton-root').first()
    if (await firstProv.count() > 0) { await firstProv.click(); await page.waitForTimeout(PAUSE) }
    await page.screenshot({ path: `${IMG}/admin-ai-provider.png` })
    await cancel(page)

    // 5) LLMs
    const llmDlg = await openConfig(page, /^AI models$/, /^AI$/)
    const firstLlm = llmDlg.locator('.MuiListItemButton-root').first()
    if (await firstLlm.count() > 0) { await firstLlm.click(); await page.waitForTimeout(PAUSE) }
    await page.screenshot({ path: `${IMG}/admin-ai-llm.png` })
    await cancel(page)

    // 6) Import / Export de triggers
    await openConfig(page, /Import \/ Export/)
    await page.screenshot({ path: `${IMG}/import-export.png` })
    await cancel(page)

    // 7) The trigger editor. We ALWAYS create an example trigger inside the dialog (which works on a
    //    local copy): the result is an instructive screenshot rather than the dev's real trigger, and it
    //    dies with the Cancel without touching the user's config.
    const trgDlg = await openConfig(page, /^Trigger$/)
    // Careful: there are TWO inputs with the placeholder 'Trigger id' — the creation one (left panel)
    // and the editor's 'Trigger ID' field. The creation one comes first in the DOM.
    await trgDlg.getByPlaceholder('Trigger id').first().fill('pss-deployments')
    await trgDlg.locator('button:has(svg[data-testid="AddIcon"])').first().click()
    await page.waitForTimeout(800)

    await pickByLabel(page, trgDlg, 'Kind', 'Deployment')
    await pickByLabel(page, trgDlg, 'K8s Event', 'ADDED')

    await trgDlg.getByPlaceholder('Version id').fill('v1')
    await trgDlg.getByPlaceholder('Short description').fill('PSS restricted + contexto de eventos')
    await pickByLabel(page, trgDlg, 'LLM', llms[0].id)
    await trgDlg.locator('input[type="number"]').first().fill('5')
    await trgDlg.getByPlaceholder('System prompt').fill(
        'Eres un auditor de seguridad de Kubernetes. Evalúa el recurso contra los Pod Security Standards\n' +
        '(baseline y restricted). Cada finding DEBE citar en `evidence` el fragmento literal del\n' +
        'manifiesto que lo prueba. Si no puedes probarlo, añádelo a `not_visible`.')
    await trgDlg.getByPlaceholder('Prompt', { exact: true }).fill(
        'Audita el Deployment {{ metadata.name }} del namespace {{ metadata.namespace }}.')
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${IMG}/triggers-dialog.png` })

    // 7b) The tool selector expanded, with the catalogue and its descriptions. Careful: the 'Tools'
    //     combo has to be targeted by its label — the dialog's last combobox is 'Prompt type'.
    await trgDlg.locator('.MuiFormControl-root:has(> label:text-is("Tools")) [role="combobox"]').first().click()
    await page.waitForTimeout(PAUSE)
    await page.screenshot({ path: `${IMG}/tool-selector.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await cancel(page)

    // 8) The Playground: the LLM and Call tabs. Closed with Cancel: it persists no state and no history.
    await page.getByRole('button', { name: 'Playground', exact: true }).click()
    await page.waitForTimeout(1500)
    const pg = page.getByRole('dialog').first()

    // The payload is a Deployment: the 'Artifact Kind' combo should agree with it.
    await pickByLabel(page, pg, 'Artifact Kind', 'Deployment')
    await pg.locator('textarea').first().fill(JSON.stringify({
        kind: 'Deployment',
        metadata: { name: 'api-gateway', namespace: 'demo' },
        spec: { replicas: 2, template: { spec: { containers: [{ name: 'api', image: 'nginx:latest', securityContext: { privileged: true } }] } } }
    }, null, 2))
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${IMG}/playground-llm.png` })

    await pg.getByRole('tab', { name: 'Call' }).click()
    await page.waitForTimeout(PAUSE)
    // The Prompt field is disabled while 'Prompt type' is 'artifact' (that is how the plugin does it),
    // so we first switch to 'jinja' in order to be able to write the template.
    await pickByLabel(page, pg, 'Prompt type', 'jinja')
    const areas = pg.locator('textarea')
    await areas.nth(0).fill('Eres un auditor de seguridad de Kubernetes. Responde en español, con evidencia concreta del manifiesto.')
    await areas.nth(1).fill('Audita el Deployment {{ metadata.name }} del namespace {{ metadata.namespace }}.')
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${IMG}/playground-call.png` })

    await pg.getByRole('tab', { name: /^IN / }).click()
    await page.waitForTimeout(PAUSE)
    await page.screenshot({ path: `${IMG}/playground-in.png` })

    await pg.getByRole('button', { name: /^cancel$/i }).click()
    await page.waitForTimeout(800)

    await page.goto('about:blank')
})

// A REAL run in the Playground, to capture the IN and OUT tabs with content. It spends ONE call to the
// configured LLM (steps=1, no tools). It touches neither the cluster nor the persisted config: 'Apply
// Config' only sets the playgroundTrigger in the back end's memory, and the dialog closes with Cancel.
test('capturas IN/OUT del playground con una ejecucion real (dark)', async ({ page }) => {
    let llms: { id: string }[] = []
    page.on('websocket', ws => ws.on('framereceived', f => {
        const raw = typeof f.payload === 'string' ? f.payload : f.payload.toString()
        if (!raw.includes('pinocchio')) return
        try { const m = JSON.parse(raw); if (m.config?.llms) llms = m.config.llms } catch { /* */ }
    }))

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

    await page.getByRole('button', { name: 'Playground', exact: true }).click()
    await page.waitForTimeout(1500)
    const pg = page.getByRole('dialog').first()

    // LLM tab: a cheap model, 1 step, and the example artifact
    await pickByLabel(page, pg, 'LLM', llms[0].id)
    await pg.locator('input[type="number"]').first().fill('1')
    await pickByLabel(page, pg, 'Artifact Kind', 'Deployment')
    await pg.locator('textarea').first().fill(JSON.stringify({
        kind: 'Deployment',
        metadata: { name: 'api-gateway', namespace: 'demo' },
        spec: { replicas: 2, template: { spec: { containers: [{ name: 'api', image: 'nginx:latest', securityContext: { privileged: true } }] } } }
    }, null, 2))
    await page.waitForTimeout(400)

    // Call tab: no tools, a short jinja prompt
    await pg.getByRole('tab', { name: 'Call' }).click()
    await page.waitForTimeout(PAUSE)
    await pickByLabel(page, pg, 'Prompt type', 'jinja')
    const areas = pg.locator('textarea')
    await areas.nth(0).fill('Eres un auditor de seguridad de Kubernetes. Responde en español, breve y con evidencia concreta del manifiesto.')
    await areas.nth(1).fill('Audita el Deployment {{ metadata.name }} del namespace {{ metadata.namespace }}. Máximo 5 líneas.')
    await page.waitForTimeout(400)

    await pg.getByRole('button', { name: /apply config/i }).click()
    await page.waitForTimeout(1500)
    await pg.getByRole('button', { name: /^fire$/i }).click()

    // Wait for the model's reply to arrive over the websocket
    await pg.getByRole('tab', { name: /^OUT \([1-9]/ }).waitFor({ timeout: 120_000 })
    await page.waitForTimeout(2000)

    await pg.getByRole('tab', { name: /^IN / }).click()
    await page.waitForTimeout(PAUSE)
    await page.screenshot({ path: `${IMG}/playground-in.png` })

    await pg.getByRole('tab', { name: /^OUT / }).click()
    await page.waitForTimeout(PAUSE)
    await page.screenshot({ path: `${IMG}/playground-out.png` })

    await pg.getByRole('button', { name: /^cancel$/i }).click()
    await page.waitForTimeout(800)
    await page.goto('about:blank')
})
