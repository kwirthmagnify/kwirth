import { test, expect, Page } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

// Regression for the manager dialogs' migration: each one used to download its manifest from GitHub on
// its own, and now they all consume /core/marketplace/<type> from the back end. It verifies each dialog
// paints exactly what the back end resolves for its type.
//
// NON-destructive: it only opens dialogs and closes them, installing and uninstalling nothing.

/*
    🔴 El TIPO, y no solo el menú. El test exigía catálogo a los once por igual, y eso da por hecho que
    todo tipo de extensión tiene al menos un artefacto PÚBLICO — que dejó de ser cierto: el manifest de
    `webhooks/` está a `[]`, legítimamente, porque los dos webhooks que existen son de pago y viven en el
    manifest privado. El diálogo salía vacío con razón y el test lo leía como una avería.

    Con el tipo se le puede preguntar al back qué resuelve para él, y entonces lo que se comprueba es más
    fuerte que antes: que el diálogo pinta LO QUE EL BACK RESUELVE. Hoy un back que devolviera `[]` por un
    fallo se ve igual que un manifest vacío de verdad; comparando, un catálogo que no llega al diálogo
    sigue siendo rojo, y un tipo sin artefactos públicos deja de serlo.
*/
const CASES: { menu: string; dialog: RegExp; type: string }[] = [
    { menu: 'Plugins',    dialog: /Manage (channel )?plugins/i, type: 'plugin' },
    { menu: 'Providers',  dialog: /Manage providers/i,          type: 'provider' },
    { menu: 'Senders',    dialog: /Manage senders/i,            type: 'sender' },
    { menu: 'Themes',     dialog: /Manage themes/i,             type: 'theme' },
    { menu: 'Homepages',  dialog: /Manage homepages/i,          type: 'homepage' },
    { menu: 'Login extensions', dialog: /Manage login extensions/i, type: 'login' },
    { menu: 'Documentation',    dialog: /Manage documentation/i,    type: 'docs' },
    { menu: 'Packs',            dialog: /Manage extension packs/i,  type: 'pack' },
    { menu: 'Webhooks',         dialog: /Manage webhooks/i,         type: 'webhook' },
    { menu: 'Identity providers', dialog: /Identity providers/i,    type: 'idp' },
    // The ones ExtensionManagerDialog already serves. They come in here so the catalogue regression
    // covers the generic dialog too, which is what will end up serving the rest.
    { menu: 'AI toolsets', dialog: /Manage AI toolsets/i, type: 'aitoolset' }
]

// La autorización, tomada prestada de la primera petición que el front hace a `/core/`: el test no
// fabrica credenciales. Se registra ANTES del login, que es cuando esas peticiones salen.
interface IBackAccess {
    base: string
    auth: string
}

/*
    🔴 UN LOGIN PARA EL FICHERO. Habia uno por test y cada uno es un arranque completo de la
    aplicacion, con el agravante de que este fichero abre SEIS dialogos de catalogo que tardan lo suyo.
    Es NO destructivo: solo abre y cierra, sin instalar ni desinstalar nada.

    ⚠️ El espia de peticiones a GitHub se registra AQUI, antes del login, y no dentro del segundo test:
    si se pusiera despues ya no veria las peticiones del arranque, que son justo las que importan. De
    paso, ahora vigila tambien lo que pase durante el primero.
*/
test.describe.serial('extension catalogs', () => {
let page: Page
const manifestCalls: string[] = []

const acceso: IBackAccess = { base: '', auth: '' }

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    page.on('request', req => {
        if (req.url().includes('raw.githubusercontent.com')) manifestCalls.push(req.url())
        if (acceso.auth) return
        const auth = req.headers()['authorization']
        const i = req.url().indexOf('/core/')
        if (auth && i > 0) {
            acceso.base = req.url().slice(0, i)
            acceso.auth = auth
        }
    })
    await login(page)
    await dismissOpenDialogs(page)
})

test.afterAll(async () => { await page?.close() })

test('los manager dialogs siguen listando catalogo tras pasar por el back', async () => {
    // if a dialog failed to resolve, the back end would return [] and the dialog would come out empty in
    // silence, so a load error not appearing is watched for as well
    const failures: string[] = []

    expect(acceso.auth, 'no se pudo tomar prestada la autorizacion del front').not.toEqual('')

    for (const c of CASES) {
        /*
            Lo que el back resuelve para ESTE tipo, que es la vara de medir de lo que el diálogo tiene
            que pintar. Si el back no contesta, eso es el fallo: `null` se distingue de `[]`, porque un
            catálogo vacío es una respuesta y un 500 no.
        */
        const res = await page.request.get(`${acceso.base}/core/marketplace/${c.type}`, { headers: { authorization: acceso.auth } })
        const resuelto: unknown[] | null = res.ok() ? await res.json().catch(() => null) : null
        if (resuelto === null) {
            failures.push(`${c.menu}: el back no resuelve su catálogo (HTTP ${res.status()})`)
            continue
        }

        await clickExtensionMenuItem(page, c.menu)
        const dialog = page.getByRole('dialog').filter({ hasText: c.dialog })
        /*
            60 s, no 10. Es el MISMO motivo que el comentario de abajo da para el espera del boton:
            abrir uno de estos dialogos no es pintar lo instalado, es resolver antes los manifests
            remotos. Con diez quedaba un flaky que no decia nada del producto — solo que la maquina
            estaba cargada — y que ademas aparecia en el primero de los seis, el que mas espera.
        */
        await dialog.waitFor({ timeout: 60000 })

        // The catalogue takes a while: the dialog does not only draw what is installed, it also resolves
        // the remote manifests (public + private) before it has cards to show. 15s was enough on an idle
        // machine and flaked on a loaded one, and a red that depends on that signals nothing. It was
        // raised back to 60s on 2026-09-16: with six dialogs in the same run (the generic one joined),
        // the senders one went past 40s on a loaded machine.
        // ⚠️ The install BUTTON is what is looked at, not a 'v0.0.0' chip: that chip belongs to what is
        // INSTALLED — in the catalogue the version goes in a Select. Looking for it passed an empty
        // catalogue as good whenever something was installed, and it fell over with packs, which in some
        // environments may have nothing set up.
        // ⚠️ isVisible() does NOT wait, however large a timeout it is given: it returns the state at THAT
        // instant and the timeout is decorative. With eleven dialogs in a row, the last ones were asked
        // on a loaded machine and answered that there was no catalogue when what was missing was a paint.
        // waitFor does wait, which is what the 60000 here meant to say.
        /*
            🔴 La tarjeta del catálogo se busca por su BOTÓN DE ACCIÓN, y el botón se reconoce por su
            ICONO, no por lo que dice su tooltip.

            El `aria-label` de ese botón es el tooltip, y el tooltip cambia con el estado de la entrada:
            'Install' si se puede instalar, 'Already installed (v…)' si ya está, y 'A dev version is
            already loaded' si viene montada desde `kwirth-dev.json`. Buscando un rótulo acabado en
            «nstall» se estaba midiendo si la entrada era INSTALABLE y leyéndolo como si fuera si el
            catálogo había llegado: con los dos webhooks montados desde dev, el diálogo pintaba sus
            tarjetas perfectamente y el test decía que no había catálogo.

            El icono sí describe el botón: descarga o actualización, esté habilitado o no. Se aceptan
            también los rótulos antiguos, porque no todos los gestores han migrado al diálogo genérico y
            los que no lo han hecho siguen pintando su botón a su manera.
        */
        const catalogButton = dialog.locator('button:has([data-testid="DownloadIcon"]), button:has([data-testid="UpgradeIcon"]), span[aria-label$="nstall"] button')
        const hasEntries = await catalogButton.first()
            .waitFor({ state: 'attached', timeout: 60000 }).then(() => true).catch(() => false)
        /*
            Contra lo que el back resolvió, no contra la suposición de que siempre hay algo. Un tipo sin
            una sola entrada resuelta tiene el catálogo vacío porque así es, y el diálogo hace lo correcto
            al no pintar nada. Lo que sigue siendo rojo es lo que importa: que el back resuelva entradas y
            el diálogo no las enseñe.
        */
        if (resuelto.length > 0 && !hasEntries) failures.push(`${c.menu}: el back resuelve ${resuelto.length} entradas y el diálogo no pinta ninguna`)
        if (resuelto.length === 0 && hasEntries) failures.push(`${c.menu}: el diálogo pinta catálogo que el back no resuelve`)

        const failedText = await dialog.getByText(/Failed to fetch/i).count()
        if (failedText > 0) failures.push(`${c.menu}: shows a fetch error`)

        await dismissOpenDialogs(page)
    }

    expect(failures, `dialogos con problemas: ${failures.join(' | ')}`).toEqual([])
})

test('el catalogo que llega al front viene resuelto por el back, no de GitHub', async () => {
    await dismissOpenDialogs(page)
    await clickExtensionMenuItem(page, 'Plugins')
    await page.getByRole('dialog').filter({ hasText: /Manage (channel )?plugins/i }).waitFor({ timeout: 10000 })
    await page.waitForTimeout(3000)
    await dismissOpenDialogs(page)

    expect(manifestCalls, 'el front ya no debe bajar manifests de GitHub por su cuenta').toEqual([])
})
})
