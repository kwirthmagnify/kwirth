import { APIRequestContext, Page } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect } from './fixtures'
import { clickExtensionMenuItem, dismissOpenDialogs, USER, PASS } from './helpers'

/*
    What the checks need —a sender with several destinations and a BASE configuration— is not assumed from
    the environment: a fixture sender that sends nothing anywhere is uploaded with two configurations and a
    base, and afterAll removes it with its configuration. No real sender is touched.
*/
const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const FIXTURE_ID = 'e2e-senders-manager'
const FIXTURE_JS = `module.exports.default = class {
    constructor() { this.id = '${FIXTURE_ID}'; this.c = new Map() }
    getConfigSchema() { return [
        { name: 'name', label: 'Name', required: true },
        { name: 'host', label: 'Host', common: true },
        { name: 'to', label: 'To' }
    ] }
    addConfig(c) { this.c.set(c.name, c) }
    removeConfig(n) { this.c.delete(n) }
    hasConfig(n) { return this.c.has(n) }
    getConfigNames() { return [...this.c.keys()] }
    async startSender() {}
    async stopSender() {}
    async send() {}
}`

// A sender that brings its OWN dialog, from the public catalogue, for the check that it opens that one
const OWN_UI_ID = 'regex'

interface IAccessKey { id: string, type: string, resources: string }
interface IManifestEntry { id: string, url: string }

const fixtureTgz = (): Buffer => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kwirth-e2e-${FIXTURE_ID}-`))
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ id: FIXTURE_ID, name: `@e2e/kwirth-sender-${FIXTURE_ID}`, displayName: 'E2E Senders Manager', version: '0.1.0', description: 'e2e sender: sends nothing' }))
    fs.writeFileSync(path.join(dir, 'back.js'), FIXTURE_JS)
    const tgz = `${dir}.tgz`
    execFileSync('tar', ['-czf', tgz, '-C', dir, '.'])
    return fs.readFileSync(tgz)
}

/*
    Migration of the `sender` manager to the generic dialog (plan: plans/completed/extension-managers-ui/PLAN.md).

    It is the last of the eleven and the one that brought the most. What is watched is what could have
    been left behind when throwing away its 1060 lines:

      · the chip with the configurations it has in place, which here are the DESTINATIONS
      · the BASE configuration (the fields the schema marks as `common`): the mail server is one and the
        recipients are many
      · exporting and importing configurations, which is how the same thing is taken from one Kwirth to
        another
      · those bringing their own UI (composite) open THEIRS, not the core's list

    ⚠️⚠️ NOTHING is saved and nothing that could send an alert is pressed. A sender sends emails and
    messages to real people: here it is opened, looked at and cancelled. Nothing is exported either: the
    file would carry the destinations' credentials.
*/

const DIALOG = /Manage senders/i

test.describe.configure({ mode: 'serial' })

interface ISenderRef {
    id: string
    displayName?: string
    name?: string
    hasFront?: boolean
    configNames: string[]
}

const nombreDe = (s: ISenderRef) => s.displayName || s.name || s.id

test.describe('gestor generico de extensiones: senders', () => {
    let page: Page
    let senders: ISenderRef[] = []
    let api: APIRequestContext
    let auth: Record<string, string> = {}
    let ownUiInstalledHere = false

    test.beforeAll(async ({ kwirth, playwright }) => {
        test.setTimeout(120000)
        api = await playwright.request.newContext({ baseURL: BACK })
        const login = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(login.status(), 'login against the back end').toBe(200)
        const key = (await login.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }
        const there = await (await api.get('/core/senders', { headers: auth })).json() as ISenderRef[]
        expect(there.some(s => s.id === FIXTURE_ID), `'${FIXTURE_ID}' is already installed: a previous run did not clean up`).toBe(false)
        if (!there.some(s => s.hasFront) && !there.some(s => s.id === OWN_UI_ID)) {
            const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../senders/manifest.json'), 'utf-8')) as IManifestEntry[]
            const entry = manifest.find(e => e.id === OWN_UI_ID)
            expect(entry, `'${OWN_UI_ID}' is not in the public senders catalogue`).toBeTruthy()
            const inst = await api.post('/core/senders/install', { headers: auth, data: { url: entry!.url } })
            expect(inst.status(), `installing '${OWN_UI_ID}': ${await inst.text()}`).toBe(200)
            ownUiInstalledHere = true
        }
        const up = await api.post('/core/senders/upload', { headers: { ...auth, 'content-type': 'application/octet-stream' }, data: fixtureTgz() })
        expect(up.status(), await up.text()).toBe(200)
        const put = await api.put(`/core/senders/${FIXTURE_ID}/configs`, { headers: auth, data: { host: 'smtp.e2e.invalid', configs: [{ name: 'qa-a', to: 'a@e2e.invalid' }, { name: 'qa-b', to: 'b@e2e.invalid' }] } })
        expect(put.status(), await put.text()).toBe(200)

        page = kwirth
        await dismissOpenDialogs(page)
        // The endpoint is authenticated: the response the dialog itself asks for on opening is listened to.
        const respuesta = page.waitForResponse(r => r.url().endsWith('/core/senders'), { timeout: 60000 })
        await clickExtensionMenuItem(page, 'Senders')
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
        senders = await (await respuesta).json()
    })

    // La pagina es de la CORRIDA, no de este fichero: se deja limpia, no se cierra.
    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        await api?.delete(`/core/senders/${FIXTURE_ID}?deleteConfig=true`, { headers: auth }).catch(() => undefined)
        if (ownUiInstalledHere) await api?.delete(`/core/senders/${OWN_UI_ID}?deleteConfig=true`, { headers: auth }).catch(() => undefined)
        await api?.dispose()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    const gearDe = (nombre: string) => dialog().getByText(nombre, { exact: true }).first()
        .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
        .locator('button[aria-label="Configure"]').first()

    test('todos los senders salen, con su nombre', async () => {
        expect(senders.length, 'el back no devuelve ningun sender').toBeGreaterThan(0)
        await expect(dialog().getByText(/^v\d+\.\d+\.\d+$/).first()).toBeVisible({ timeout: 60000 })
        for (const s of senders) {
            await expect(dialog().getByText(nombreDe(s), { exact: true }).first(), `'${s.id}' no aparece`).toBeVisible()
        }
    })

    /*
        A sender mounted from dev REPLACES the installed one with the same id, it is not added to it.

        The filter was missing in `SenderManager.listInstalled()` —which concatenates the installed index
        with the dev metadata— and in a development environment, where the normal thing is to have an
        extension installed AND also mounted from its dist, the same sender came out TWICE: here in the
        manager, and in any consumer of '/core/senders'. The sender-debug plugin's e2e caught it, its
        dropdown painting 'console' twice.

        The endpoint's RESPONSE is looked at and not the cards: the manager paints the installed ones and
        also those available in the marketplace, so an installed sender that is also published shows up
        twice quite rightly. Counting cards by name would give a red that says nothing about the bug —
        it was checked, and that was exactly what happened with 'email-resend'.
    */
    test('ningun sender sale repetido, aunque este instalado y ademas montado desde dev', async () => {
        const ids = senders.map(s => s.id)
        const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i)
        expect(repetidos, `'/core/senders' devuelve ids repetidos: ${repetidos.join(', ')}`).toEqual([])
    })

    test('el chip cuenta los destinos que tiene puestos cada sender', async () => {
        // A sender with no configurations sends nothing anywhere, and that reads at a glance.
        const conConfigs = senders.filter(s => s.configNames.length > 0)
        expect(conConfigs.length, 'ningun sender tiene configuraciones en este entorno').toBeGreaterThan(0)

        for (const s of conConfigs) {
            const n = s.configNames.length
            await expect(dialog().getByText(`${n} config${n > 1 ? 's' : ''}`).first(),
                `'${s.id}' tiene ${n} y la tarjeta no lo dice`).toBeVisible()
        }
    })

    test('la configuracion lista los destinos por nombre, y ya NO ofrece llevarselos', async () => {
        const conVarios = senders.find(s => !s.hasFront && s.configNames.length > 1) ?? senders.find(s => !s.hasFront && s.configNames.length > 0)
        test.skip(!conVarios, 'ningun sender del core con configuraciones')

        await gearDe(nombreDe(conVarios!)).click()
        const cfg = page.getByRole('dialog').filter({ hasText: `Configure: ${nombreDe(conVarios!)}` })
        await expect(cfg).toBeVisible({ timeout: 20000 })

        // Each destination, by its name: it is what tells this dialog from a loose form.
        for (const nombre of conVarios!.configNames) {
            await expect(cfg.getByText(nombre, { exact: true }).first(), `falta el destino '${nombre}'`).toBeVisible()
        }

        /*
            🔴 Y este diálogo ya NO lleva Export ni Import. Los tenía, y hacían dos cosas mal: el export
            serializaba las configuraciones tal cual, así que las CONTRASEÑAS salían en claro a un
            fichero sin casilla ni aviso; y el import fusionaba mientras el bundle reemplaza, así que el
            mismo contenido dejaba el sistema de dos formas según por dónde entrara.

            Las configuraciones de un sender viajan por ☰ Kwirth export, que las vacía por esquema.
        */
        await expect(cfg.getByRole('button', { name: 'Export' })).toHaveCount(0)
        await expect(cfg.getByRole('button', { name: 'Import' })).toHaveCount(0)
        await cfg.getByRole('button', { name: 'Close' }).click()
    })

    test('🔴 la configuracion BASE existe cuando el sender la declara, y se abre aparte', async () => {
        /*
            The schema's `common` fields belong to the extension, not to each destination: the mail
            server is one and the recipients are many. They are edited on their own screen, and the way
            in only appears on the senders that declare any.

            It is opened and CANCELLED. Saving here would touch the real sending configuration.
        */
        const candidatos = senders.filter(s => !s.hasFront && s.configNames.length > 0)
        let encontrado = false

        for (const s of candidatos) {
            await gearDe(nombreDe(s)).click()
            const cfg = page.getByRole('dialog').filter({ hasText: `Configure: ${nombreDe(s)}` })
            await expect(cfg).toBeVisible({ timeout: 20000 })

            const base = cfg.locator('button[aria-label="Edit base configuration"]')
            if (await base.count() > 0) {
                await base.click()
                await expect(page.getByRole('dialog').filter({ hasText: 'Base configuration' })).toBeVisible({ timeout: 10000 })
                await page.getByRole('button', { name: /cancel/i }).last().click()
                encontrado = true
            }
            await cfg.getByRole('button', { name: 'Close' }).click()
            if (encontrado) break
        }
        test.skip(!encontrado, 'ningun sender de este entorno declara configuracion base')
    })

    test('un sender con su propia UI abre esa, no la lista del core', async () => {
        const conFront = senders.find(s => s.hasFront)
        test.skip(!conFront, 'ningun sender con front propio en este entorno')

        await gearDe(nombreDe(conFront!)).click()
        // ⚠️ .MuiDialog-root and not getByRole: with two stacked dialogs MUI marks the lower one aria-hidden.
        await expect(page.locator('.MuiDialog-root'), 'no se abrio la UI del sender').toHaveCount(2, { timeout: 30000 })
        // Not by the title: a sender's own dialog may be titled 'Configure: <name>' too (regex is). The core
        // list is told by its own empty-state line, which no sender's dialog has.
        await expect(page.getByText('Select a config to edit or click New.'), 'se abrio la lista del core en vez de su UI').toHaveCount(0)
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'Senders')
        await dialog().waitFor({ timeout: 40000 })
    })
})
