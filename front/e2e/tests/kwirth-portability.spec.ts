import { test, expect, Page } from '@playwright/test'
import { readFileSync } from 'fs'
import { login, clickMenuItem, dismissOpenDialogs, openMenu } from './helpers'

/*
    Kwirth portability: the configuration bundle, from its own dialog.

    It replaces 'kwirth-settings-portability', which tested the export/import that used to hang off the
    settings dialog with a second format of its own. That format is gone — the bundle does the same and
    also carries what the EXTENSIONS store — and the operation now lives in two dialogs of its own, each
    with its menu entry: 'Kwirth export' and 'Kwirth import' (it was a single 'Kwirth portability' dialog
    for a while, which is what these tests went on looking for after it was split).

    NON destructive by construction: it exports (which only downloads) and it opens the import to see the
    PREVIEW, which applies nothing. Import is never pressed: doing so would write configuration over the
    user's Kwirth. The last test checks that nothing was persisted.

    🔴 ONE LOGIN AND TWO EXPORTS FOR THE WHOLE FILE, in the beforeAll. Every test used to log in on its
    own page and export again: ten logins of ~40 s each, 15 minutes a run, and the slowness was itself
    the bug — half the failures were `openMenu` timing out on a front that was still settling, in tests
    that never got as far as looking at what they measure. The bundle does not change between tests
    (nothing here writes), so it is fetched once without credentials and once with them, and each test
    reads the one it needs. The project rule says it plainly: the app comes up ONCE per run.
*/

const INTERVAL_LABEL = 'Cluster metrics read interval (seconds)'

interface IBundle {
    kind: string
    formatVersion: number
    meta: { includesCredentials: boolean, kwirthVersion: string }
    core: {
        settings?: {
            metricsInterval?: number
            log?: { levels?: Record<string, string>, ansi?: boolean }
            marketplaces?: { id: string, manifestAuth?: { token?: string } }[]
            packageRegistries?: { id: string, auth?: { token?: string, password?: string } }[]
        }
        sharedAi?: {
            llms?: { id: string, useProviderKey: boolean, key?: string }[]
            providers?: { name: string, type: string, key?: string, endpoint?: string }[]
        }
    }
    /*
        🔴 TWO FIELDS PER ENTRY, and that is the format 2 contract. `coreConfig` is what the CORE keeps
        about the extension —its installation configuration, a sender's configurations, an IdP's
        instances— and `config` what the EXTENSION keeps on its own account. Either can be missing on its
        own, which is why they are not merged: until format 1 both travelled inside `config` and in two
        different shapes depending on who implemented what, so a file exported before the extensions
        adopted the contract was read back as if its only part were theirs, and the installation
        configuration was lost without a word.
    */
    extensions: { type: string, id: string, coreConfig?: unknown, config?: unknown }[]
}

const openExport = async (page: Page) => {
    await clickMenuItem(page, 'Kwirth export')
    const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth export' })
    await expect(dialog).toBeVisible()
    // wait until it has read what can be exported: otherwise the spinner is what gets clicked. The list comes
    // in collapsed blocks (Kwirth, Plugins, Providers…), and the 'Kwirth' block only shows once it has loaded
    await expect(dialog.getByRole('checkbox', { name: 'Kwirth', exact: true })).toBeVisible({ timeout: 15000 })
    return dialog
}

/*
    The dialog's own Close, in its actions. After exporting, the result Alert brings an X that is ALSO
    named 'Close', so a page-wide lookup finds two and strict mode waits for ever.
*/
const closeExport = async (page: Page) => {
    await page.getByRole('dialog').filter({ hasText: 'Kwirth export' })
        .locator('.MuiDialogActions-root').getByRole('button', { name: 'Close', exact: true }).click()
}

const exportBundle = async (page: Page, withCredentials: boolean): Promise<IBundle> => {
    const dialog = await openExport(page)
    if (withCredentials) await dialog.getByLabel(/Include credentials/).check()
    const download = page.waitForEvent('download')
    await dialog.getByRole('button', { name: 'Export', exact: true }).click()
    const file = await download
    const path = await file.path()
    const bundle = JSON.parse(readFileSync(path!, 'utf8')) as IBundle
    await closeExport(page)
    await dismissOpenDialogs(page)
    return bundle
}

test.describe.serial('Kwirth portability', () => {
    let page: Page
    /** Sin credenciales: el caso por defecto y el que más fácil se rompe. */
    let sinCredenciales: IBundle
    /** Y con ellas, porque el usuario es soberano. */
    let conCredenciales: IBundle

    test.beforeAll(async ({ browser }) => {
        test.setTimeout(300_000)
        page = await browser.newPage()
        await login(page)
        /*
            Se espera a que el front termine de cargar. 'networkidle' dice que no hay peticiones, no que
            haya pintado: con el hilo ocupado la animación del menú se queda a medias, Playwright la ve
            visible pero nunca 'stable', y el click muere en un sitio que no es el que se está midiendo.
            Con MÁS margen que el actionTimeout de 15 s, que es lo que se agotaba.
        */
        await page.waitForLoadState('networkidle')
        await expect(page.locator('header button').first()).toBeVisible({ timeout: 60_000 })
        await dismissOpenDialogs(page)

        sinCredenciales = await exportBundle(page, false)
        conCredenciales = await exportBundle(page, true)
    })

    test.afterAll(async () => { await page?.close() })

    test('el export baja un bundle con la forma del contrato', () => {
        expect(sinCredenciales.kind).toBe('kwirth-config-bundle')
        expect(sinCredenciales.formatVersion).toBe(2)
        expect(sinCredenciales.meta.kwirthVersion.length).toBeGreaterThan(0)
        expect(Array.isArray(sinCredenciales.extensions)).toBe(true)
    })

    test('🔴 cada entrada separa lo que guarda el core de lo que guarda la extension', () => {
        /*
            El formato 2. Mientras las dos partes iban mezcladas dentro de `config`, la forma de una
            entrada dependía de quién implementara qué, y nadie leyendo el fichero podía saber cuál de
            las dos faltaba. Lo que se fija aquí es que están separadas y que ninguna entrada viaja
            vacía: una entrada sin ninguna de las dos partes es ruido, y en el destino se lee como una
            configuración que alguien vació a propósito.
        */
        expect(sinCredenciales.extensions.length, 'algo instalado tiene que viajar').toBeGreaterThan(0)
        for (const entry of sinCredenciales.extensions) {
            expect(entry.coreConfig !== undefined || entry.config !== undefined,
                `${entry.type}/${entry.id} viaja sin nada dentro`).toBe(true)
            // Y nunca la forma vieja: `{core, own}` dentro de `config` es justo lo que el formato 2 deshizo.
            const propio = (entry.config ?? {}) as Record<string, unknown>
            expect('core' in propio || 'own' in propio,
                `${entry.type}/${entry.id} lleva el envoltorio del formato 1 dentro de config`).toBe(false)
        }
    })

    test('🔴 la configuracion del LOG viaja dentro del bundle', () => {
        /*
            It is what makes the log settings portable, and it comes for free — the core exports
            IKwirthSettings whole — which is exactly why it is worth pinning down: nobody would notice it
            stopping to travel until they imported a file and found their levels back at the defaults.
        */
        expect(sinCredenciales.core.settings).toBeDefined()
        const levels = sinCredenciales.core.settings?.log?.levels ?? {}
        // The six components come out, because the back end answers with what is IN FORCE and not with
        // what is stored: with nothing configured, the stored value would be nothing at all.
        for (const component of ['core', 'chan', 'prov', 'send', 'auth', 'stor']) {
            expect(levels[component], `el componente '${component}' no viaja en el bundle`).toBeDefined()
        }
        expect(typeof sinCredenciales.core.settings?.log?.ansi).toBe('boolean')
    })

    test('🔴 sin marcar credenciales no viaja ni un secreto', () => {
        expect(sinCredenciales.meta.includesCredentials).toBe(false)
        // Not one token and not one password in the whole file: a bundle ends up in somebody's downloads folder.
        for (const m of sinCredenciales.core.settings?.marketplaces ?? []) expect(m.manifestAuth?.token ?? '').toBe('')
        for (const r of sinCredenciales.core.settings?.packageRegistries ?? []) {
            expect(r.auth?.token ?? '').toBe('')
            expect(r.auth?.password ?? '').toBe('')
        }
    })

    test('🔴 los AI providers VIAJAN sin credenciales, con la key VACIA', () => {
        /*
            The regression this pins down: the core used to drop the providers entirely when credentials
            were not asked for, so leaving the tick off did not hide the keys, it lost the providers —
            names, types, endpoints, default prices and limits — and at the other end nothing was
            written, because nothing arrived. The rule of the bundle is the opposite one: a secret
            travels EMPTY, never omitted, so that the destination knows it has to be filled in.
        */
        expect(sinCredenciales.core.sharedAi, 'la IA no viaja en el bundle').toBeDefined()
        const providers = sinCredenciales.core.sharedAi?.providers
        expect(Array.isArray(providers), 'los providers se han omitido en vez de viajar sin key').toBe(true)
        for (const p of providers ?? []) {
            expect(p.key, `el provider '${p.name}' se lleva la key sin que se hayan pedido credenciales`).toBe('')
            expect(p.name.length, 'el provider viaja sin nombre').toBeGreaterThan(0)
            expect(typeof p.type, 'el provider viaja sin tipo').toBe('string')
        }
    })

    test('🔴 sin credenciales ningun modelo se lleva su key en claro', () => {
        /*
            The models live in a configmap and used to go out raw, so a model with a key of its own
            shipped it in clear inside a file whose author had deliberately left credentials unticked.
        */
        const llms = sinCredenciales.core.sharedAi?.llms
        expect(Array.isArray(llms), 'los modelos no viajan en el bundle').toBe(true)
        for (const l of llms ?? []) {
            expect(l.key ?? '', `el modelo '${l.id}' se lleva su key sin que se hayan pedido credenciales`).toBe('')
        }
    })

    test('con credenciales marcadas la IA viaja entera: el usuario es soberano', () => {
        expect(conCredenciales.meta.includesCredentials).toBe(true)
        expect(Array.isArray(conCredenciales.core.sharedAi?.providers)).toBe(true)
        expect(Array.isArray(conCredenciales.core.sharedAi?.llms)).toBe(true)
    })

    test('🔴 lo que no se puede preguntar entero se exporta AVISANDO de que va a medias', async () => {
        /*
            Sin instancia viva el core devuelve igualmente su interlocutor, así que la extensión entra en
            el fichero con su configuración de instalación y nada más. Eso se exporta —dejarla fuera
            perdería también lo del core— pero tiene que DECIRSE antes, porque después no hay nada en el
            JSON que distinga "no guarda nada propio" de "no se le pudo preguntar".

            ⚠️ Los canales se instancian al ARRANCAR el back, no al abrir su pestaña, así que en un
            Kwirth normal no hay ninguna a medias y este caso salta. Lo que quedaría a medias es un canal
            hospedado por otro Kwirth y un provider que nadie requiere.
        */
        const dialog = await openExport(page)
        // Los dos bloques que pueden tener instancia propia. Se despliegan por su chevron: pulsar la
        // etiqueta DESMARCA el bloque entero.
        for (const nombre of ['Plugins', 'Providers']) {
            const bloque = dialog.locator('div').filter({ hasText: new RegExp(`^${nombre}$`) }).first()
            await bloque.getByRole('button').first().click()
        }

        const aviso = dialog.getByText('only its installation configuration will travel')
        const cuantos = await aviso.count()
        if (cuantos > 0) await expect(aviso.first(), 'el aviso tiene que verse, no solo estar en el DOM').toBeVisible()

        await closeExport(page)
        await dismissOpenDialogs(page)
        test.skip(cuantos === 0, 'ninguna extension esta a medias en este Kwirth: todas tienen su instancia viva')
    })

    test('🔴 los diálogos de IA ya NO llevan Import ni Export', async () => {
        /*
            They were a second door onto the very same configmap and secret the bundle writes, and it had
            already diverged: the local export emitted a hand-written subset of the provider, so the
            prices and the limits added on 2026-10-26 were dropped without a word, and the local import
            replaced the whole list from an unvalidated file. Both lists travel in the bundle, under
            'AI providers and models'.
        */
        // 'AI Providers' and 'AI Models' hang off the COLLAPSIBLE 'AI Config' group of the drawer.
        const openAiConfig = async (item: RegExp) => {
            await dismissOpenDialogs(page)
            await openMenu(page)
            await page.getByRole('menuitem', { name: /AI Config/i }).click()
            await page.waitForTimeout(300)
            await page.getByRole('menuitem', { name: item }).click()
            await page.waitForTimeout(600)
        }

        for (const item of [/^AI Providers$/, /^AI Models$/]) {
            await openAiConfig(item)
            const dialog = page.getByRole('dialog')
            await expect(dialog).toBeVisible()
            await expect(dialog.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0)
            await expect(dialog.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0)
            await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
            await page.waitForTimeout(300)
        }

        await dismissOpenDialogs(page)
    })

    test('el diálogo de settings ya NO lleva Export ni Import', async () => {
        /*
            They were the same two buttons for two different things, and that is what made the bundle
            disappear when the old format was removed. Pinned down so nobody puts them back there.
        */
        await clickMenuItem(page, 'Kwirth settings')
        const dialog = page.getByRole('dialog').filter({ hasText: 'Kwirth settings' })
        await expect(dialog.getByLabel(INTERVAL_LABEL)).toBeEnabled({ timeout: 10000 })

        await expect(dialog.getByRole('button', { name: 'Export' })).toHaveCount(0)
        await expect(dialog.getByRole('button', { name: 'Import' })).toHaveCount(0)

        await dialog.getByRole('button', { name: 'Cancel' }).click()
        await dismissOpenDialogs(page)
    })
})
