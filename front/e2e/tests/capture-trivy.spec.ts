import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, pickCombo, GUIDE_MEDIA, capturePedida } from './helpers'

/*
    Regenerates the Trivy channel's screenshots for the guide (docs/<version>/_media/guide).

    🔴 WHY THIS SPEC EXISTS. Trivy's images were the only ones in the guide taken BY HAND, and it showed:
    three rounds of changes went out without them being touched, so the guide kept showing a toolbar with
    a 'Manage' button that no longer exists, cards without the kind chip, and the same object split into
    two cards — the very thing that was fixed. A screenshot nobody can regenerate is a screenshot that
    rots.

    Run by hand, like every capture-*: they are excluded from the normal run precisely because they
    OVERWRITE the guide's images.

        CAPTURES=1 npx playwright test tests/capture-trivy.spec.ts

    And one at a time with CAPTURE_ONLY: `CAPTURE_ONLY=cards`.

    ⚠️ IT NEEDS A CLUSTER WITH THE TRIVY OPERATOR AND ITS REPORTS. Without reports the cards view is
    empty and the images would be worse than the old ones, so it SKIPS instead of writing a blank screen:
    a capture of nothing is not a capture.

    🔴 AND IT ONLY SHOOTS THE LOCAL CLUSTER. The first version took "the first cluster that offers the
    channel" and landed on a CUSTOMER's: the image came out full of their workload names
    (`anonimizador-clinico`, `sensitive-content-...`, `gravitee-apim-...`) on their way into a PUBLIC
    guide. It also showed that cluster's installed plugin, not the build being documented, so the kind
    chip — the very thing the capture was for — was missing. Both problems have the same cause and the
    same fix: shoot where the development build runs. KWIRTH_CAPTURE_CLUSTER overrides the name.

    Workload names are relabelled in the DOM anyway, as capture-managers does: the local cluster is the
    developer's and nobody promised it has no real names in it.

    NON-destructive: it opens a tab, looks and closes. It installs nothing and removes nothing — note
    that managing the operator is no longer even reachable from here (it moved to the provider's gear in
    provider/trivy@0.4.0).
*/

const CHANNEL = 'trivy'
const MEDIA = GUIDE_MEDIA
const pedida = capturePedida

/*
    The cluster to shoot: the LOCAL one, which the core names 'inCluster' when it runs against its own
    kubeconfig. It is the only one running the build being documented, and the only one whose workload
    names are ours. KWIRTH_CAPTURE_CLUSTER overrides it.
*/
const CLUSTER = process.env.KWIRTH_CAPTURE_CLUSTER ?? 'inCluster'

/*
    Names that must not appear in a PUBLIC guide, replaced in the DOM right before each shot. The same
    device capture-managers uses: nothing is renamed in the cluster, only in the pixels. Add pairs here
    as the environment grows; what is NOT here goes out as it is, so look at the image before committing.
*/
const RELABEL: Record<string, string> = {}

const relabel = (pairs: Record<string, string>) => {
    if (!Object.keys(pairs).length) return
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (tw.nextNode()) nodes.push(tw.currentNode as Text)
    for (const n of nodes) {
        let v = n.nodeValue ?? ''
        for (const [real, alias] of Object.entries(pairs)) v = v.split(real).join(alias)
        if (v !== n.nodeValue) n.nodeValue = v
    }
}

test.describe.configure({ mode: 'serial' })

test.describe('capturas de la guia: canal Trivy', () => {
    let page: Page
    let abierto = false

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        await page?.close()
    })

    /** The channel's toolbar: it is the anchor of every capture, and what says the tab is up. */
    const toolbar = () => page.getByPlaceholder('Search asset, ns...')

    test('abre el canal en vista de cluster', async () => {
        /*
            🔴 THE NAMED CLUSTER, and nothing else. It does NOT walk the list looking for one that offers
            the channel: doing that landed the capture on a customer's cluster, with their workload names
            headed for a public guide and the wrong build on screen.
        */
        await page.getByRole('combobox').first().click()
        await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
        const clusters = (await page.getByRole('option').allInnerTexts()).map(n => n.trim()).filter(Boolean)
        await page.keyboard.press('Escape')

        const target = clusters.find(c => c.toLowerCase() === CLUSTER.toLowerCase())
        test.skip(!target, `no hay cluster '${CLUSTER}' (hay: ${clusters.join(', ')}). KWIRTH_CAPTURE_CLUSTER lo cambia`)

        await pickCombo(page, 0, target!)
        await page.waitForTimeout(600)
        await pickCombo(page, 1, 'cluster')
        await page.waitForTimeout(600)
        const combos = await page.getByRole('combobox').count()
        await page.getByRole('combobox').nth(combos - 1).click()
        await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 5000 })
        const option = page.getByRole('option', { name: CHANNEL, exact: true })
        test.skip(await option.count() === 0, `el cluster '${target}' no ofrece el canal '${CHANNEL}'`)
        await option.click()

        await page.waitForTimeout(400)
        await page.getByRole('button', { name: 'ADD' }).click()
        await page.waitForTimeout(2500)

        // Adding the tab does not start the channel: Start is pressed, as a user would
        await page.locator('[data-testid="SettingsIcon"]').first().click({ force: true })
        await page.waitForTimeout(500)
        const start = page.getByText('Start', { exact: true })
        if (await start.isVisible().catch(() => false)) await start.click()
        else await page.keyboard.press('Escape')

        await expect(toolbar()).toBeVisible({ timeout: 40000 })
        abierto = true
    })

    test('cards: la vista de tarjetas con el chip de kind', async () => {
        test.skip(!abierto, 'el canal no llego a abrirse')
        test.skip(!pedida('cards'), 'no pedida')

        /*
            The reports arrive over the websocket as the operator has them, so it waits for CARDS and not
            for a fixed time. Without any, the image would be an empty screen and the old one — outdated
            as it is — says more.
        */
        const tarjetas = page.locator('.MuiCard-root')
        await expect.poll(async () => await tarjetas.count(), { timeout: 60000, message: 'no llego ningun informe' })
            .toBeGreaterThan(1)
        await page.waitForTimeout(2500)   // lets the bars and counts settle before the shot
        await page.evaluate(relabel, RELABEL)
        await page.screenshot({ path: `${MEDIA}/channel-trivy-cards.png` })
    })

    test('menu: el filtro de texto y el menu de una tarjeta', async () => {
        test.skip(!abierto, 'el canal no llego a abrirse')
        test.skip(!pedida('menu'), 'no pedida')

        // The guide's example: typing a fragment narrows the view live
        await toolbar().fill('kwirth')
        await page.waitForTimeout(1200)
        const masOpciones = page.locator('.MuiCard-root [data-testid="MoreVertIcon"]').first()
        test.skip(await masOpciones.count() === 0, 'el filtro no dejo ninguna tarjeta que enseñar')
        await masOpciones.click()
        await page.waitForTimeout(800)
        await page.evaluate(relabel, RELABEL)
        await page.screenshot({ path: `${MEDIA}/channel-trivy-menu.png` })
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
        await toolbar().fill('')
        await page.waitForTimeout(1000)
    })

    test('order: el menu de ordenacion', async () => {
        test.skip(!abierto, 'el canal no llego a abrirse')
        test.skip(!pedida('order'), 'no pedida')

        await page.getByRole('button', { name: 'Order', exact: true }).click()
        await page.waitForTimeout(800)
        await page.evaluate(relabel, RELABEL)
        await page.screenshot({ path: `${MEDIA}/channel-trivy-order.png` })
        await page.keyboard.press('Escape')
        await page.waitForTimeout(400)
    })

    test('list: la vista de lista', async () => {
        test.skip(!abierto, 'el canal no llego a abrirse')
        test.skip(!pedida('list'), 'no pedida')

        await page.getByRole('button', { name: 'List', exact: true }).click()
        await page.waitForTimeout(1500)
        await page.evaluate(relabel, RELABEL)
        await page.screenshot({ path: `${MEDIA}/channel-trivy-list.png` })
        // left as it was found: card is the default the rest of the guide shows
        await page.getByRole('button', { name: 'Card', exact: true }).click()
        await page.waitForTimeout(800)
    })
})
