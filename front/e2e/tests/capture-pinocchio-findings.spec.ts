import { test, Page, expect } from '@playwright/test'
import { execFileSync } from 'child_process'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

// Captura la vista del canal CON FINDINGS REALES, que es la que faltaba en la guia: `ui-tab.png` es la
// pestaña recien arrancada —la propia guia la describe como "todavia sin analisis"— y 05-findings.md,
// que explica como leerlos, no tenia ni una imagen.
//
// Dispara una llamada REAL al LLM: sin analisis no hay findings. Solo corre con CAPTURES=1.
//
// Toca la configuracion del usuario lo MINIMO y lo deja como estaba: habilita la ultima version del
// trigger de Pod, captura, y la vuelve a deshabilitar en el finally —pase lo que pase—. El Pod que
// provoca el analisis tambien se borra siempre.

const IMG = 'C:/github/aisdkvercel/kwirth/plugins/pinocchio/docs/guide/images'
const NS = 'default'
const NAME = 'linkedin-capture-demo'
const KIND = 'pod'
const TRIGGER = 'newpod'
const VERSION_PREFIX = '7 '     // la version mas alta del trigger

test.use({ trace: 'off', screenshot: 'off', video: 'off' })
test.setTimeout(420_000)

// Un Pod con todo lo que un cluster acepta sin rechistar y nadie deberia desplegar: privilegiado,
// como root, con el filesystem del nodo montado y con el tag 'latest'. Es justo el ejemplo con el
// que abre la guia de pinocchio.
const POD_YAML = `apiVersion: v1
kind: Pod
metadata:
  name: ${NAME}
  namespace: ${NS}
  labels:
    app: ${NAME}
spec:
  containers:
    - name: app
      image: nginx:latest
      securityContext:
        privileged: true
        runAsUser: 0
        allowPrivilegeEscalation: true
        readOnlyRootFilesystem: false
      volumeMounts:
        - name: host-root
          mountPath: /host
  volumes:
    - name: host-root
      hostPath:
        path: /
        type: Directory
`

const kubectl = (args: string[], input?: string): string =>
    execFileSync('kubectl', args, { input, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })

const eventCount = async (page: Page): Promise<number> => {
    const txt = await page.locator('text=/Events:\\s*\\d+/').first().innerText()
    return parseInt(txt.replace(/\D+/g, ''), 10) || 0
}

// Abre Config → Trigger, selecciona el trigger y pone la version indicada en el estado pedido.
// Devuelve si hubo que cambiar algo. El interruptor se identifica por el TEXTO de su fila, no por
// indice: añadir una version no debe romper esto.
const setVersionEnabled = async (page: Page, trigger: string, prefix: string, enabled: boolean): Promise<boolean> => {
    await page.getByRole('button', { name: 'Config', exact: true }).click()
    await page.waitForTimeout(400)
    await page.getByRole('menuitem', { name: /^Trigger$/ }).click()
    await page.waitForTimeout(1200)

    const dlg = page.locator('.MuiDialog-root').last()
    await dlg.locator('.MuiListItemButton-root', { hasText: trigger }).first().click()
    await page.waitForTimeout(1000)

    const boxes = dlg.locator('input[type="checkbox"]')
    const filas = await boxes.evaluateAll(nodes => nodes.map(n => {
        let el: HTMLElement | null = n as HTMLElement
        for (let up = 0; up < 6 && el; up++) {
            el = el.parentElement
            const t = (el?.innerText ?? '').replace(/\s+/g, ' ').trim()
            if (t.length > 2) return t
        }
        return ''
    }))

    const idx = filas.findIndex(t => t.startsWith(prefix))
    if (idx < 0) throw new Error('no encuentro la version que empieza por "' + prefix + '" en ' + trigger)

    const ya = await boxes.nth(idx).isChecked()
    console.log('[capture] version "' + filas[idx].slice(0, 50) + '" estaba ' + (ya ? 'ON' : 'OFF') +
                ' → se quiere ' + (enabled ? 'ON' : 'OFF'))

    let cambiado = false
    if (ya !== enabled) {
        await boxes.nth(idx).click()
        await page.waitForTimeout(600)
        cambiado = true
    }

    await dlg.getByRole('button', { name: 'OK', exact: true }).click()
    await page.waitForTimeout(1500)
    return cambiado
}

test('captura de findings reales de pinocchio (dark)', async ({ page }) => {
    let podCreado = false
    let versionActivada = false

    try {
        await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
        await page.setViewportSize({ width: 1600, height: 900 })
        await login(page)
        await dismissOpenDialogs(page)

        // ── Abrir el canal y arrancarlo ─────────────────────────────────────────────────────────────
        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.waitForTimeout(800)
        await pickCombo(page, 0, 'inCluster')
        await pickCombo(page, 1, 'cluster')
        await pickLastCombo(page, 'pinocchio')
        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.waitForTimeout(1500)
        await page.locator('button:has(svg[data-testid="SettingsIcon"])').first().click()
        await page.getByRole('menuitem', { name: /^Start$/ }).click()
        await page.waitForTimeout(5000)

        // ── Habilitar la version mas alta del trigger de Pod ─────────────────────────────────────────
        versionActivada = await setVersionEnabled(page, TRIGGER, VERSION_PREFIX, true)

        const antes = await eventCount(page)
        console.log('[capture] eventos antes de provocar nada: ' + antes)

        // ── Provocar el analisis ────────────────────────────────────────────────────────────────────
        kubectl(['apply', '-f', '-'], POD_YAML)
        podCreado = true
        console.log('[capture] Pod ' + NS + '/' + NAME + ' creado')

        // El analisis es una llamada real al modelo: puede tardar.
        await expect.poll(async () => await eventCount(page), {
            timeout: 240_000,
            intervals: [3000],
            message: 'el canal no registro ningun evento nuevo tras crear el ' + KIND
        }).toBeGreaterThan(antes)

        await page.waitForTimeout(8000)     // margen para que termine de pintarse el analisis
        console.log('[capture] eventos despues: ' + await eventCount(page))

        // La lista crece hacia abajo y la vista se queda al final, donde solo se ven los pods que el
        // cluster va creando por su cuenta. El analisis que interesa —el del Pod privilegiado— es el
        // primero, asi que se sube al principio justo antes de disparar.
        await page.evaluate(() => {
            document.querySelectorAll('*').forEach(el => {
                if (el.scrollHeight > el.clientHeight + 10) el.scrollTop = 0
            })
        })
        await page.waitForTimeout(600)

        await page.screenshot({ path: `${IMG}/ui-findings.png` })
        console.log('[capture] guardada -> ' + IMG + '/ui-findings.png')
    }
    finally {
        if (podCreado) {
            try {
                kubectl(['delete', KIND, NAME, '-n', NS, '--ignore-not-found', '--force', '--grace-period=0'])
                console.log('[capture] Pod borrado')
            }
            catch (e) {
                console.log('[capture] ⚠ no se pudo borrar el Pod ' + NS + '/' + NAME + ': ' + (e as Error).message)
            }
        }
        if (versionActivada) {
            try {
                await setVersionEnabled(page, TRIGGER, VERSION_PREFIX, false)
                console.log('[capture] version del trigger devuelta a OFF')
            }
            catch (e) {
                console.log('[capture] ⚠ OJO: no se pudo deshabilitar la version del trigger ' + TRIGGER +
                            ', revisala a mano: ' + (e as Error).message)
            }
        }
        await page.goto('about:blank')
    }
})
