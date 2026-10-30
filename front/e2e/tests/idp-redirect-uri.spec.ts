// The 'Redirect URI' of an identity provider: the value the admin has to register at the provider.
//
// Why it exists: it must match what is registered BYTE FOR BYTE, and the back end cannot derive it
// reliably. Inside the pod the connection is plain HTTP, so a proxy that does not forward
// 'X-Forwarded-Proto' makes Kwirth send 'http://…' for a site the browser reached over HTTPS, and the
// provider answers 'invalid redirect uri'. The field lets the admin pin it; the form suggests the right
// value so nobody has to compose it by hand (and the suggestion is where the subpath — ROOTPATH — gets
// included, which is what the documentation used to leave out).
//
// NON-DESTRUCTIVE: it opens the dialog, reads the field and cancels. It saves NO IdP configuration —
// touching that is touching the way people get in.
import { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import { clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

const DIALOG = /Identity providers/i
/*
    The field is found by its NAME, which is the contract, and the label is read from each connector's
    own schema — `idpRedirectUriField(label?)` lets every connector name it after the form the admin is
    going to paste the value into, and github-cloud does exactly that ('Authorization callback URL',
    which is what GitHub's OAuth App form calls it). Asserting a fixed label here tested the opposite of
    what the contract promises.
*/
const REDIRECT_URI = 'redirectUri'

interface IConnector {
    id: string
    label: string
    schema: { name: string, label: string }[]
}

test.describe.configure({ mode: 'serial' })

test.describe('IdP: la Redirect URI se sugiere y se puede fijar', () => {
    let page: Page
    let connectors: IConnector[] = []
    // Where the back end lives, taken from the request the dialog itself makes. In dev the front is on
    // :3000 and the back on :3883, so the page's own URL is NOT the base the redirect is built from.
    let backendBase = ''

    test.beforeAll(async ({ kwirth }) => {
        page = kwirth
        await dismissOpenDialogs(page)
        const resp = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith('/core/idps'), { timeout: 60000 })
        await clickExtensionMenuItem(page, 'Identity providers')
        await page.getByRole('dialog').filter({ hasText: DIALOG }).waitFor({ timeout: 40000 })
        const r = await resp
        connectors = await r.json()
        backendBase = r.url().slice(0, r.url().indexOf('/core/idps'))
    })

    // La pagina es de la CORRIDA, no de este fichero: se deja limpia, no se cierra.
    test.afterAll(async () => {
        await dismissOpenDialogs(page).catch(() => {})
    })

    const dialog = () => page.getByRole('dialog').filter({ hasText: DIALOG })

    // The same rule the dialog applies: OAuth2 only accepts 'http' on loopback, so everywhere else the
    // suggestion is https even when the browser got there over http.
    const expectedFor = (connectorId: string): string => {
        const url = new URL(backendBase)
        if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) url.protocol = 'https:'
        const base = `${url.origin}${url.pathname}`.replace(/\/+$/, '')
        return `${base}/core/auth/${connectorId}/callback`
    }

    test('el back anuncia conectores con schema', async () => {
        expect(connectors.length, 'el back no devuelve ningun conector').toBeGreaterThan(0)
        expect(connectors.some(c => c.schema?.length > 0), 'ningun conector tiene campos configurables').toBe(true)
    })

    test('cada conector configurable ofrece el campo, ya relleno con la URI que hay que registrar', async () => {
        const configurables = connectors.filter(c => c.schema?.length > 0)
        // Until a connector ships the field in its getConfigSchema() there is nothing to assert: the
        // form only paints what the schema declares.
        const conCampo = configurables.filter(c => c.schema.some(f => f.name === REDIRECT_URI))
        test.skip(conCampo.length === 0, 'ningun conector declara todavia redirectUri en su schema')

        for (const c of conCampo) {
            /*
                The gear is reached from the NAME upwards, not from a row: the manager draws cards by
                default and only draws `tr` in list view, so a locator anchored on the table matches
                nothing. And the button carries its text in `aria-label`, not in `title` — MUI's Tooltip
                labels the button, it does not set the attribute. Both were written against a layout
                that is no longer the one on screen; the rest of the manager specs use this idiom.
            */
            const gear = dialog().getByText(c.label, { exact: true }).first()
                .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
                .locator('button[aria-label="Configure"]').first()
            await gear.click()
            const cfg = page.getByRole('dialog').filter({ hasText: /^Configure:/ })
            await cfg.waitFor({ timeout: 20000 })

            // Each connector's own wording for the field, which is what the form paints.
            const etiqueta = c.schema.find(f => f.name === REDIRECT_URI)!.label
            const campo = cfg.getByLabel(etiqueta, { exact: true })
            await expect(campo, `'${c.id}': falta el campo '${etiqueta}'`).toBeVisible()
            await expect(campo, `'${c.id}': la URI sugerida no es la que el IdP tiene que tener registrada`)
                .toHaveValue(expectedFor(c.id))

            await cfg.getByRole('button', { name: /^cancel$/i }).click()
            await page.waitForTimeout(400)
        }
    })
})
