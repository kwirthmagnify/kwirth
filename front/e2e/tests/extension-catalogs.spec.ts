import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

// Regression for the manager dialogs' migration: each one used to download its manifest from GitHub on
// its own, and now they all consume /core/marketplace/<type> from the back end. It verifies they still
// list a catalogue.
//
// NON-destructive: it only opens dialogs and closes them, installing and uninstalling nothing.

const CASES: { menu: string; dialog: RegExp }[] = [
    { menu: 'Plugins',    dialog: /Manage (channel )?plugins/i },
    { menu: 'Providers',  dialog: /Manage providers/i },
    { menu: 'Senders',    dialog: /Manage senders/i },
    { menu: 'Themes',     dialog: /Manage themes/i },
    { menu: 'Homepages',  dialog: /Manage homepages/i },
    { menu: 'Login extensions', dialog: /Manage login extensions/i },
    { menu: 'Documentation',    dialog: /Manage documentation/i },
    { menu: 'Packs',            dialog: /Manage extension packs/i },
    { menu: 'Webhooks',         dialog: /Manage webhooks/i },
    { menu: 'Identity providers', dialog: /Identity providers/i },
    // The ones ExtensionManagerDialog already serves. They come in here so the catalogue regression
    // covers the generic dialog too, which is what will end up serving the rest.
    { menu: 'AI toolsets', dialog: /Manage AI toolsets/i }
]

test('los manager dialogs siguen listando catalogo tras pasar por el back', async ({ page }) => {
    // if a dialog failed to resolve, the back end would return [] and the dialog would come out empty in
    // silence, so a load error not appearing is watched for as well
    const failures: string[] = []

    await login(page)
    await dismissOpenDialogs(page)

    for (const c of CASES) {
        await clickExtensionMenuItem(page, c.menu)
        const dialog = page.getByRole('dialog').filter({ hasText: c.dialog })
        await dialog.waitFor({ timeout: 10000 })

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
        const hasEntries = await dialog.locator('span[aria-label$="nstall"] button').first()
            .waitFor({ state: 'visible', timeout: 60000 }).then(() => true).catch(() => false)
        if (!hasEntries) failures.push(`${c.menu}: no catalog entries`)

        const failedText = await dialog.getByText(/Failed to fetch/i).count()
        if (failedText > 0) failures.push(`${c.menu}: shows a fetch error`)

        await dismissOpenDialogs(page)
    }

    expect(failures, `dialogos con problemas: ${failures.join(' | ')}`).toEqual([])
})

test('el catalogo que llega al front viene resuelto por el back, no de GitHub', async ({ page }) => {
    const manifestCalls: string[] = []
    page.on('request', req => {
        if (req.url().includes('raw.githubusercontent.com')) manifestCalls.push(req.url())
    })

    await login(page)
    await dismissOpenDialogs(page)
    await clickExtensionMenuItem(page, 'Plugins')
    await page.getByRole('dialog').filter({ hasText: /Manage (channel )?plugins/i }).waitFor({ timeout: 10000 })
    await page.waitForTimeout(3000)
    await dismissOpenDialogs(page)

    expect(manifestCalls, 'el front ya no debe bajar manifests de GitHub por su cuenta').toEqual([])
})
