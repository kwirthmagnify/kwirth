import { test, Page, Locator } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

// Capturas de la guia de Pinocchio (plugins/pinocchio/docs/guide/images). Tema oscuro.
// Ejecutar a mano: playwright test --config playwright.capture.config.ts capture-pinocchio-guide.spec.ts
//
// NO DESTRUCTIVO: todos los dialogos se cierran con Cancel. Nada de OK, Save, Download ni Clear back —
// la config de pinocchio del usuario no se toca. Los triggers de ejemplo se crean dentro del dialogo
// (que trabaja sobre una copia local) y mueren con el Cancel.

const IMG = 'C:/github/aisdkvercel/kwirth/plugins/pinocchio/docs/guide/images'
const PAUSE = 800   // margen para la animacion de los dialogos de MUI

test.use({ trace: 'off', screenshot: 'off', video: 'off' })
test.setTimeout(240_000)

// El menu Config tiene 'AI' como grupo PLEGABLE (providers/modelos dentro) y luego Trigger e
// Import / Export sueltos. `group` expande el grupo antes de clicar la entrada.
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

// Los Select de MUI con InputLabel no responden a getByLabel (la etiqueta no queda asociada al
// combobox), asi que localizamos el FormControl por el texto EXACTO de su label y clicamos su combo.
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

    // ── Abrir el canal ──────────────────────────────────────────────────────────────────────────────
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

    // 1) La pestaña del canal
    await page.screenshot({ path: `${IMG}/ui-tab.png` })

    // 2) El menú Config con el grupo 'AI' desplegado (plegado esconde providers y modelos)
    await page.getByRole('button', { name: 'Config', exact: true }).click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^AI$/ }).click()
    await page.waitForTimeout(PAUSE)
    await page.screenshot({ path: `${IMG}/ui-config-menu.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // 3) El diálogo Clear (¡sólo capturar, jamás pulsar Clear back!)
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

    // 7) El editor de triggers. Creamos SIEMPRE un trigger de ejemplo dentro del dialogo (que trabaja
    //    sobre una copia local): sale una captura didactica en vez del trigger real del dev, y muere con
    //    el Cancel sin tocar la config del usuario.
    const trgDlg = await openConfig(page, /^Trigger$/)
    // Ojo: hay DOS inputs con placeholder 'Trigger id' — el de creacion (panel izquierdo) y el campo
    // 'Trigger ID' del editor. El de creacion es el primero en el DOM.
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

    // 7b) El selector de tools desplegado, con el catálogo y sus descripciones. Ojo: hay que apuntar al
    //     combo 'Tools' por su label — el ultimo combobox del dialogo es el de 'Prompt type'.
    await trgDlg.locator('.MuiFormControl-root:has(> label:text-is("Tools")) [role="combobox"]').first().click()
    await page.waitForTimeout(PAUSE)
    await page.screenshot({ path: `${IMG}/tool-selector.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await cancel(page)

    // 8) El Playground: pestañas LLM y Call. Se cierra con Cancel: no persiste estado ni historiales.
    await page.getByRole('button', { name: 'Playground', exact: true }).click()
    await page.waitForTimeout(1500)
    const pg = page.getByRole('dialog').first()

    // El payload es un Deployment: que el combo 'Artifact Kind' concuerde con el.
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
    // El campo Prompt esta deshabilitado mientras 'Prompt type' sea 'artifact' (asi lo hace el plugin),
    // asi que primero pasamos a 'jinja' para poder escribir la plantilla.
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

// Ejecucion REAL en el Playground para capturar las pestañas IN y OUT con contenido. Gasta UNA llamada
// al LLM configurado (steps=1, sin tools). No toca el cluster ni la config persistida: 'Apply Config'
// solo fija el playgroundTrigger en memoria del back, y el dialogo se cierra con Cancel.
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

    // Pestaña LLM: modelo barato, 1 paso, y el artefacto de ejemplo
    await pickByLabel(page, pg, 'LLM', llms[0].id)
    await pg.locator('input[type="number"]').first().fill('1')
    await pickByLabel(page, pg, 'Artifact Kind', 'Deployment')
    await pg.locator('textarea').first().fill(JSON.stringify({
        kind: 'Deployment',
        metadata: { name: 'api-gateway', namespace: 'demo' },
        spec: { replicas: 2, template: { spec: { containers: [{ name: 'api', image: 'nginx:latest', securityContext: { privileged: true } }] } } }
    }, null, 2))
    await page.waitForTimeout(400)

    // Pestaña Call: sin tools, prompt jinja corto
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

    // Esperar a que la respuesta del modelo llegue por el websocket
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
