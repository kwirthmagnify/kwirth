import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, pickLastCombo, CARGA } from './helpers'

/*
    Pinocchio stops taking the 43 tools compiled inside `common-ai` and resolves them against the
    REGISTRY of installed toolsets (plan: plans/ai-tools/PLAN.md, S3).

    The change is invisible: the same list of tools, with the same names. That is why the test does not
    check "that there are tools" —that was true before as well— but that the list IS that of the toolsets
    Pinocchio has within reach:

      · the ones from the toolsets granted to `pinocchio` are there (k8s-describe, k8s-observability)
      · `delete_pod` is NOT, which lives in `k8s-ops` and is NOT granted to it
      · `times_two` is NOT, which lives in `playground` and is not even installed

    With the old path all three always showed up, because they all came from the same place. If any of
    them reappears, the compiled catalogue has crept back in.

    ⚠️ **The grant is given by the test itself, and given back as it was.** The selector's list comes from
    `resolveTools(…, 'pinocchio')`, so without a grant it arrives EMPTY even though the toolsets are
    installed and everything works. The test's first version assumed the environment's state, and the day
    the toolsets were granted to another plugin —to `agora`— it went red without anything having broken:
    the symptom was "0 tools" and the message blamed the registry, which was perfectly fine. A test
    cannot depend on how whoever runs it has their dev configured.

    NON-destructive: it snapshots the grants, grants just what is needed, and restores when it finishes.
    It opens the channel, looks at the selector and cancels. It saves no channel configuration.
*/

test.describe.configure({ mode: 'serial' })

/** What the test needs to see. `k8s-ops` is deliberately LEFT OUT: it is the negative half of the test. */
const NECESARIOS = ['k8s-describe', 'k8s-observability']
const PINOCCHIO = 'pinocchio'

type TGrants = Record<string, string[]>

/*
    The front end signs every call to the back end with its accessString, and the test has no way of
    manufacturing one: it borrows it from the first request that goes out to `/core/`. Registering this
    BEFORE the login is what makes it reliable — the app starts calling the back end as soon as it is in.
*/
interface IBackAccess {
    base: string
    auth: string
}

const espiarAcceso = (page: Page): IBackAccess => {
    const acceso: IBackAccess = { base: '', auth: '' }
    page.on('request', req => {
        if (acceso.auth) return
        const auth = req.headers()['authorization']
        const i = req.url().indexOf('/core/')
        if (auth && i > 0) {
            acceso.base = req.url().slice(0, i)
            acceso.auth = auth
        }
    })
    return acceso
}

const leerGrants = async (api: APIRequestContext, acc: IBackAccess): Promise<TGrants> => {
    const res = await api.get(`${acc.base}/core/aitoolsets/grants`, { headers: { authorization: acc.auth } })
    expect(res.ok(), `no se pudieron leer las concesiones (${res.status()})`).toBeTruthy()
    return await res.json() as TGrants
}

const escribirGrant = async (api: APIRequestContext, acc: IBackAccess, toolsetId: string, plugins: string[]): Promise<void> => {
    const res = await api.put(`${acc.base}/core/aitoolsets/grants/${toolsetId}`, {
        headers: { authorization: acc.auth, 'content-type': 'application/json' },
        data: { plugins }
    })
    // Granting demands the admin scope: if the e2e's user lacks it, better to say so than to give 0 tools.
    expect(res.ok(), `no se pudo conceder '${toolsetId}' (${res.status()}): ¿el usuario del e2e es admin?`).toBeTruthy()
}

/*
    🔴 Los NOMBRES de las tools ofrecidas, no el texto corrido de la lista.

    Cada opción del desplegable es el nombre seguido de su descripción, y las descripciones se citan unas
    a otras: `get_rollout_history` acaba diciendo «use get_workload_config_refs for that». Buscando un
    nombre en el texto entero se encontraba dentro de la explicación de otra, y el test denunciaba como
    ofrecida una tool que no lo estaba. El nombre es lo que va delante del todo.
*/
const nombresDe = (opciones: string[]): Set<string> =>
    new Set(opciones.map(o => o.trim().match(/^[a-z0-9_]+/)?.[0] ?? ''))

test.describe('pinocchio: las tools salen del registro de toolsets', () => {
    let page: Page
    let herramientas: string[] = []
    let rotulo = ''
    /** What was there before touching anything, so it can be left the same. */
    let original: TGrants = {}
    let tocados: string[] = []
    /** The borrowed authorization, captured at login and valid for the whole session. */
    let acceso: IBackAccess

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        acceso = espiarAcceso(page)
        await login(page)
        await dismissOpenDialogs(page)
        expect(acceso.auth, 'no se pudo tomar prestada la autorizacion del front').not.toEqual('')

        // ── the grant, before opening anything: the channel asks for its tool list on start ──
        original = await leerGrants(page.request, acceso)
        for (const id of NECESARIOS) {
            const actuales = original[id] ?? []
            if (actuales.includes(PINOCCHIO)) continue
            await escribirGrant(page.request, acceso, id, [...actuales, PINOCCHIO])
            tocados.push(id)
        }

        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.waitForTimeout(800)
        await pickCombo(page, 0, 'inCluster')
        await pickCombo(page, 1, 'cluster')
        await pickLastCombo(page, 'pinocchio')
        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.waitForTimeout(1500)

        // The channel has to START: it asks the back end for the tool list when it does.
        await page.locator('button:has(svg[data-testid="SettingsIcon"])').first().click()
        await page.getByRole('menuitem', { name: /^Start$/ }).click()
        await page.waitForTimeout(4000)

        // Config → Triggers, which is where the tool selector lives
        await page.getByRole('button', { name: 'Config', exact: true }).click()
        await page.getByRole('menuitem', { name: /trigger/i }).click()

        /*
            🔴 Waited for, not slept through. There was a fixed 1.5 s here, and when the dialog took
            longer the test carried on against a page that had none: it died fifteen seconds later on
            `.MuiListItemButton-root`, with an error that said the list of triggers was empty when what
            was missing was the dialog itself. A wait that states what it is waiting for is also the one
            that names the failure.
        */
        const dialog = page.getByRole('dialog').first()
        await dialog.waitFor({ state: 'visible', timeout: CARGA })

        /*
            🔴 The trigger is made BY THE TEST. Triggers are channel configuration, and a channel that
            has just been added has none: the file took for granted that whoever ran it already had
            theirs, so what it really measured was the environment — and the day the dev configuration
            was reset it went red without a word about the product.

            An id is typed and the + BUTTON is pressed, which is what a person does. The field also
            offers Enter, and that is what was tried first: the id got written and the list stayed empty,
            so the key never reached `onTriggerAdd`. It all lives in the dialog's state until Save, and
            this file leaves through Cancel, so nothing is written. Choosing the trigger is enough: the
            tool selector hangs on `selectedTriggerIndex`, not on a version.
        */
        const item = dialog.locator('.MuiListItemButton-root')
        if (await item.count() === 0) {
            await dialog.getByPlaceholder('Trigger id').first().fill('e2e-toolsets')
            // The first + of the dialog is the triggers one: the versions panel comes after it in the DOM.
            await dialog.locator('button:has([data-testid="AddIcon"])').first().click()
        }
        await expect(item.first(), 'el diálogo de triggers no ofrece ningún trigger, ni siquiera tras crear uno').toBeVisible({ timeout: CARGA })
        await item.first().click({ force: true })
        await page.waitForTimeout(800)

        rotulo = (await dialog.locator('.MuiFormControl-root').filter({ hasText: 'Tools' }).locator('.MuiSelect-select').first().textContent().catch(() => '')) ?? ''

        // The catalogue is INSIDE the dropdown: it has to be opened.
        await dialog.locator('.MuiFormControl-root').filter({ hasText: 'Tools' }).locator('.MuiSelect-select').first().click({ force: true })
        await page.waitForTimeout(800)
        herramientas = await page.locator('[role="listbox"] [role="option"]').allTextContents()
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
    })

    test.afterAll(async () => {
        // The grants go back EXACTLY to how they were, even if the test blew up halfway: they are the
        // user's config, not the test's.
        for (const id of tocados) {
            await escribirGrant(page.request, acceso, id, original[id] ?? []).catch(() => {})
        }
        await dismissOpenDialogs(page).catch(() => {})
        await page?.close()
    })

    test('el catalogo que ofrece no esta vacio', async () => {
        // Two different causes for the same symptom, and the message has to tell them apart: with no
        // registry there are no tools, and with a registry but no grant there are none either — but they
        // are fixed in different places.
        expect(herramientas.length, `no hay ninguna tool disponible: los toolsets ${NECESARIOS.join(', ')} estan instalados pero ¿llego la concesion a '${PINOCCHIO}'?`).toBeGreaterThan(0)
        // And the selector's label exists (empty when none is ticked, 'all (N)' with autoTools)
        expect(typeof rotulo).toBe('string')
    })

    test('las tools que ofrece son las de los toolsets CONCEDIDOS', async () => {
        const ofrecidas = nombresDe(herramientas)
        // From k8s-describe and k8s-observability, the two the test grants itself
        expect(ofrecidas.has('describe_pod'), 'falta describe_pod (k8s-describe)').toBe(true)
        expect(ofrecidas.has('get_pod_logs'), 'falta get_pod_logs (k8s-observability)').toBe(true)
    })

    /*
        The invariant is the GRANT, and it is asked of the environment instead of assumed.

        This used to name `times_two` and justify it with "playground is not even installed". The day
        playground WAS installed — and granted to pinocchio — the test went red while the product was
        doing exactly the right thing: offering the tools of a toolset somebody had granted. A test that
        depends on what this particular Kwirth happens to have installed reports its own premise as a bug.

        So the toolsets NOT granted to pinocchio are worked out from the registry, and what is checked is
        that none of their tools got in. If everything is granted there is nothing to check, and it says
        so with a skip rather than passing without having tested anything.
    */
    test('NO ofrece las de los toolsets que no estan a su alcance', async () => {
        const res = await page.request.get(`${acceso.base}/core/aitoolsets/catalog`, { headers: { authorization: acceso.auth } })
        expect(res.ok(), `no se pudo leer el catalogo de toolsets (${res.status()})`).toBeTruthy()
        const catalogo = await res.json() as { id: string, tools?: { name: string }[] }[]

        const concedidosAhora = await leerGrants(page.request, acceso)
        const sinConceder = catalogo.filter(t => !(concedidosAhora[t.id] ?? []).includes(PINOCCHIO))
        test.skip(sinConceder.length === 0, 'todos los toolsets instalados estan concedidos a pinocchio: no hay nada fuera de alcance que comprobar')

        const ofrecidas = nombresDe(herramientas)
        for (const t of sinConceder) {
            for (const tool of t.tools ?? []) {
                expect(ofrecidas.has(tool.name), `'${tool.name}' no deberia estar: el toolset '${t.id}' no esta concedido a ${PINOCCHIO}`).toBe(false)
            }
        }
    })
})
