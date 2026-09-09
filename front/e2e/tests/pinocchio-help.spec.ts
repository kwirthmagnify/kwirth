// Cada dialogo de Pinocchio con seccion de guia debe llevar su boton de ayuda (?), y ese boton debe
// abrir LA SECCION QUE LE CORRESPONDE de la guia del plugin (regla de proyecto: dialog con ayuda →
// HelpButton a su seccion). El test no comprueba solo que el boton existe: comprueba la URL que abre.
import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo } from './helpers'

const DOCS = '/core/docs/plugin/pinocchio'

test.describe.configure({ mode: 'serial' })

test.describe('pinocchio: botones de ayuda de los dialogos', () => {
    let page: Page
    // Base ABSOLUTA de la guia, tal como la construye el plugin con channelObject.clusterUrl. No vale una
    // ruta relativa: el baseURL del e2e es el dev server del front, no el back de kwirth.
    let docsBase = ''

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
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

    // El HelpButton abre un popup con window.open: interceptamos la URL sin dejar que se abra.
    const urlOpenedBy = async (help: ReturnType<Page['locator']>): Promise<string> => {
        await page.evaluate(() => {
            const w = window as unknown as { __helpUrl?: string, open: typeof window.open }
            w.__helpUrl = undefined
            w.open = (url?: string | URL) => { w.__helpUrl = String(url ?? ''); return null }
        })
        await help.click()
        await page.waitForTimeout(200)
        return await page.evaluate(() => (window as unknown as { __helpUrl?: string }).__helpUrl ?? '')
    }

    const openConfig = async (item: RegExp) => {
        await page.getByRole('button', { name: 'Config', exact: true }).click()
        await page.getByRole('menuitem', { name: item }).click()
        await page.waitForTimeout(1000)
    }

    const closeDialog = async () => {
        const dlg = page.getByRole('dialog').first()
        for (const name of [/^cancel$/i, /^close$/i]) {
            const btn = dlg.getByRole('button', { name })
            if (await btn.count() > 0) { await btn.first().click(); break }
        }
        await page.waitForTimeout(500)
    }

    test('la cabecera del canal lleva ayuda al recorrido por la UI', async () => {
        const help = page.locator('button[aria-label="help"]').first()
        await expect(help).toBeVisible()
        const url = await urlOpenedBy(help)
        expect(url).toContain(`${DOCS}/#/user/02-ui-tour`)
        docsBase = url.split('/#/')[0]
        expect(docsBase, 'la URL de la guia debe ser absoluta (clusterUrl)').toMatch(/^https?:\/\//)
    })

    test('el dialogo Clear lleva ayuda al recorrido por la UI', async () => {
        await page.getByRole('button', { name: 'Clear', exact: true }).click()
        await page.waitForTimeout(600)
        const dlg = page.getByRole('dialog').first()
        const help = dlg.locator('button[aria-label="help"]').first()
        await expect(help).toBeVisible()
        expect(await urlOpenedBy(help)).toContain(`${DOCS}/#/user/02-ui-tour`)
        await closeDialog()
    })

    test('el dialogo Trigger Config lleva ayuda a Configurar triggers', async () => {
        await openConfig(/^Trigger$/)
        const dlg = page.getByRole('dialog').first()
        const help = dlg.locator('button[aria-label="help"]').first()
        await expect(help).toBeVisible()
        expect(await urlOpenedBy(help)).toContain(`${DOCS}/#/user/04-triggers`)
        await closeDialog()
    })

    test('el dialogo Import / Export lleva ayuda a su seccion', async () => {
        await openConfig(/Import \/ Export/)
        const dlg = page.getByRole('dialog').first()
        const help = dlg.locator('button[aria-label="help"]').first()
        await expect(help).toBeVisible()
        expect(await urlOpenedBy(help)).toContain(`${DOCS}/#/user/07-import-export`)
        await closeDialog()
    })

    test('el Playground lleva ayuda a su seccion', async () => {
        await page.getByRole('button', { name: 'Playground', exact: true }).click()
        await page.waitForTimeout(1200)
        const dlg = page.getByRole('dialog').first()
        const help = dlg.locator('button[aria-label="help"]').first()
        await expect(help).toBeVisible()
        expect(await urlOpenedBy(help)).toContain(`${DOCS}/#/user/06-playground`)
        await dlg.getByRole('button', { name: /^cancel$/i }).click()
        await page.waitForTimeout(600)
    })

    test('la guia responde en la URL que abren los botones', async () => {
        const res = await page.request.get(`${docsBase}/index.html`)
        expect(res.status(), 'la guia de pinocchio no esta instalada en el core').toBe(200)
        expect(await res.text()).toContain('Pinocchio — Guide')
        // y las secciones a las que apuntan los botones existen como ficheros
        for (const s of ['user/02-ui-tour', 'user/04-triggers', 'user/05-findings', 'user/06-playground', 'user/07-import-export']) {
            const r = await page.request.get(`${docsBase}/${s}.md`)
            expect(r.status(), `seccion ${s} no servida`).toBe(200)
        }
    })
})
