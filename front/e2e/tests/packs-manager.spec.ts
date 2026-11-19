import { APIRequestContext, Page } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { test, expect } from './fixtures'
import { clickExtensionMenuItem, dismissOpenDialogs, USER, PASS } from './helpers'

/*
    Migration of the `pack` manager to the generic dialog (plan: plans/completed/extension-managers-ui/PLAN.md).

    The plan marked packs as a candidate NOT to migrate: it is the only type that CONTAINS other
    extensions and installing it means loading each member's front. What is watched here is exactly what
    raised the doubt:

      · the MEMBERS LINE ('plugin, login' in the catalogue; '1 plugin, 1 login' when installed), which no
        other type has and which the generic one gained as `subtitle` on migrating it
      · that installing a pack REALLY installs what it brings, and uninstalling it takes it away
      · that the uninstall button warns about that, instead of the generic 'Uninstall'

    The full cycle is tested with the PUBLIC pack from the catalogue, and the environment is left as it
    was: if anything is left installed, the next run would see it and the result would stop meaning
    anything.
*/

const DIALOG = /Manage extension packs/i

test.describe.configure({ mode: 'serial' })

/** What a pack brings: 'Includes: 2 plugins, 1 theme' when installed, 'Includes: plugin, theme' in the catalogue.
    The prefix goes into the check: without it, the line fell below a truncated description and read as
    its continuation. */
const TIPOS = '(plugin|theme|homepage|sender|provider|webhook|login|docs|aitoolset|idp)'
const MIEMBROS = new RegExp(`^Includes: (\\d+ )?${TIPOS}s?(, (\\d+ )?${TIPOS}s?)*$`)

/*
    The cycle is run with the PUBLIC 'censor' pack, named: the catalogue may also list private packs, and
    "the first one installable" made the test depend on which marketplaces this Kwirth has.

    Its members require providers ('business', 'events'), and a pack does not bring its members'
    providers. The test does not assume them: it reads the requirements from the pack's own tgz, installs
    from the public catalogue the providers missing, and afterAll uninstalls exactly those, config
    included — the environment is left as it was found.
*/
const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const PACK_ID = 'censor'
const PACK_LABEL = 'Censor'
const REPO = path.resolve(__dirname, '../../..')

interface IAccessKey { id: string, type: string, resources: string }
interface IManifestEntry { extensionType: string, id: string, version: string, url: string }
interface IRequirement { extensionType: string, id: string }

// the highest version of an id in a public catalogue: it is the one the dialog's card offers by default
const latest = (manifestFile: string, id: string): IManifestEntry | undefined => {
    const entries = (JSON.parse(fs.readFileSync(path.join(REPO, manifestFile), 'utf-8')) as IManifestEntry[]).filter(e => e.id === id)
    const num = (v: string) => v.split('.').map(Number)
    return entries.sort((a, b) => {
        const [x, y] = [num(a.version), num(b.version)]
        for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]
        return 0
    })[0]
}

// what the pack's members require, read from the pack itself (pack.json → each member's package.json)
const packRequirements = async (api: APIRequestContext, url: string): Promise<IRequirement[]> => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kwirth-e2e-pack-'))
    const tgz = path.join(dir, 'pack.tgz')
    const res = await api.get(url)
    expect(res.status(), `downloading the pack from ${url}`).toBe(200)
    fs.writeFileSync(tgz, await res.body())
    execFileSync('tar', ['-xzf', tgz, '-C', dir])
    const base = path.join(dir, 'package')
    const pack = JSON.parse(fs.readFileSync(path.join(base, 'pack.json'), 'utf-8')) as { extensions: { tgz: string }[] }
    const reqs: IRequirement[] = []
    for (const member of pack.extensions) {
        const pkg = JSON.parse(execFileSync('tar', ['-xzOf', path.join(base, member.tgz), 'package/package.json']).toString()) as { requiresExtension?: IRequirement[] }
        reqs.push(...(pkg.requiresExtension ?? []))
    }
    fs.rmSync(dir, { recursive: true, force: true })
    return reqs
}

test.describe('gestor generico de extensiones: packs', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string> = {}
    const providersInstalledHere: string[] = []

    test.beforeAll(async ({ kwirth, playwright }) => {
        test.setTimeout(180000)
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as IAccessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }

        const pack = latest('packs/manifest.json', PACK_ID)
        expect(pack, `'${PACK_ID}' is not in the public packs catalogue`).toBeTruthy()
        const installed = await (await api.get('/core/providers', { headers: auth })).json() as { id: string }[]
        for (const req of await packRequirements(api, pack!.url)) {
            if (req.extensionType !== 'provider' || installed.some(p => p.id === req.id) || providersInstalledHere.includes(req.id)) continue
            const entry = latest('providers/manifest.json', req.id)
            expect(entry, `provider '${req.id}' (required by the pack) is not in the public catalogue`).toBeTruthy()
            const inst = await api.post('/core/providers/install', { headers: auth, data: { url: entry!.url } })
            expect(inst.status(), `installing provider '${req.id}': ${await inst.text()}`).toBe(200)
            providersInstalledHere.push(req.id)
        }

        page = kwirth
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'Packs')
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
    })

    // La pagina es de la CORRIDA, no de este fichero: se deja limpia, no se cierra.
    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
        for (const id of providersInstalledHere) await api?.delete(`/core/providers/${id}?deleteConfig=true`, { headers: auth }).catch(() => undefined)
        await api?.dispose()
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    test('el tipo pack abre el gestor generico con sus dos secciones', async () => {
        await expect(dialog().getByText('Installed packs')).toBeVisible()
        await expect(dialog().getByText('Available packs')).toBeVisible()
    })

    test('el catalogo dice QUE trae cada pack, no solo su nombre', async () => {
        // It is the only line the type has of its own. Without it a pack is indistinguishable from any
        // other extension and there is no way to know what gets installed on pressing.
        // ⚠️ In the catalogue the version goes in a Select, not in a 'v0.0.0' chip: the button is awaited.
        await expect(dialog().locator('span[aria-label="Install"] button').first()).toBeVisible({ timeout: 60000 })
        expect(await dialog().getByText(MIEMBROS).count(), 'ningun pack del catalogo dice que trae').toBeGreaterThan(0)
    })

    test('instalar un pack instala lo que trae, y desinstalarlo se lo lleva', async () => {
        test.setTimeout(240000)

        // the named pack's card, not the first installable one (see PACK_ID)
        const instalable = dialog().getByText(PACK_LABEL, { exact: true })
            .locator('xpath=ancestor::*[.//span[@aria-label="Install"]][1]')
            .locator('span[aria-label="Install"] button:not([disabled])')
        test.skip(await instalable.count() === 0, `el pack '${PACK_ID}' no esta en el catalogo sin instalar`)

        /*
            🔴 A pack REFUSES to install when one of its members is already installed on its own, and
            that is deliberate: it does not take over an extension somebody put there by hand. So in an
            environment where `plugin:censor` is installed separately — a normal state on a developer's
            machine — this cycle cannot be exercised AT ALL, and the test used to fail with a bare
            'received 0', 90 seconds of waiting and nothing saying why.

            The refusal is read from the back's own answer and the test is SKIPPED with it: a red that
            depends on what else happens to be installed is not a signal, and silencing it with a
            hardcoded condition would hide a real failure of the install the day there is one.
        */
        const [respuesta] = await Promise.all([
            page.waitForResponse(r => r.url().includes('/core/packs/install'), { timeout: 60000 }),
            instalable.first().click()
        ])
        const motivo = respuesta.status() === 200 ? '' : await respuesta.text().catch(() => '')
        test.skip(/already installed/i.test(motivo), `un miembro del pack ya esta instalado por separado: ${motivo.slice(0, 200)}`)
        expect(respuesta.status(), `la instalacion del pack fallo: ${motivo.slice(0, 200)}`).toBe(200)

        // Installed = the generic dialog draws it at the top with ITS OWN uninstall warning, not the generic one.
        const desinstalar = dialog().locator('span[aria-label="Uninstall pack (removes all member extensions)"] button')
        await expect(desinstalar).toHaveCount(1, { timeout: 90000 })
        expect(await dialog().locator('span[aria-label="Uninstall"] button').count(), 'usa el tooltip generico: no avisa de lo que borra').toBe(0)

        // And what is installed counts what is INSIDE, which differs from what the catalogue promises.
        await expect(dialog().getByText(/^Includes: \d+ \w+(s)?(, \d+ \w+(s)?)*$/).first()).toBeVisible()

        // The members really are installed, not just the pack: it is what made migrating it doubtful.
        const miembros = await page.evaluate(async () => {
            const base = window.location.origin.replace(':3000', ':3883')
            const packs = await (await fetch(`${base}/core/packs`)).json() as { extensions: { extensionType: string, id: string }[] }[]
            const dentro = packs.flatMap(p => p.extensions)
            const plugins = await (await fetch(`${base}/core/plugins`)).json() as { id: string }[]
            const logins = await (await fetch(`${base}/core/logins`)).json() as { id: string }[]
            return dentro.map(e => ({
                ...e,
                presente: e.extensionType === 'plugin' ? plugins.some(p => p.id === e.id)
                    : e.extensionType === 'login' ? logins.some(l => l.id === e.id)
                    : true
            }))
        })
        expect(miembros.length, 'el pack instalado no declara ningun miembro').toBeGreaterThan(0)
        for (const m of miembros) expect(m.presente, `${m.extensionType} '${m.id}' no quedo instalado`).toBe(true)

        // ── and now removing it, which is how the environment is left as it was ─────────────────────
        await desinstalar.click()
        // uninstalling asks first; the pack's members' config goes too, because this test brought them
        const confirmar = page.getByRole('dialog').filter({ hasText: /Are you sure you want to uninstall/ })
        await expect(confirmar).toBeVisible({ timeout: 20000 })
        await confirmar.getByLabel('Also delete the configuration of its extensions').check()
        await confirmar.getByRole('button', { name: 'yes' }).click()
        await expect(desinstalar).toHaveCount(0, { timeout: 90000 })

        const quedan = await page.evaluate(async (ids: string[]) => {
            const base = window.location.origin.replace(':3000', ':3883')
            const plugins = await (await fetch(`${base}/core/plugins`)).json() as { id: string }[]
            const logins = await (await fetch(`${base}/core/logins`)).json() as { id: string }[]
            return [...plugins, ...logins].filter(e => ids.includes(e.id)).map(e => e.id)
        }, miembros.map(m => m.id))
        expect(quedan, 'quitar el pack dejo miembros sueltos detras').toEqual([])
    })

    test('la linea de miembros tambien esta en la vista de lista', async () => {
        // On migrating, the subtitle has to be drawn in BOTH views: the list one only had a name.
        await dialog().getByRole('button', { name: 'List view' }).click()
        expect(await dialog().getByText(MIEMBROS).count(), 'la vista de lista pierde lo que trae el pack').toBeGreaterThan(0)
        await dialog().getByRole('button', { name: 'Card view' }).click()
    })
})
