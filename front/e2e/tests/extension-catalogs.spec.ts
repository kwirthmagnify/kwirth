import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

// Regresion de la migracion de los manager dialogs: antes cada uno bajaba su manifest de GitHub por su
// cuenta, ahora todos consumen /core/marketplace/<tipo> del back. Verifica que siguen listando catalogo.
//
// NO destructivo: solo abre dialogos y los cierra, no instala ni desinstala nada.

const CASES: { menu: string; dialog: RegExp }[] = [
    { menu: 'Plugins',    dialog: /Manage (channel )?plugins/i },
    { menu: 'Providers',  dialog: /Manage providers/i },
    { menu: 'Senders',    dialog: /Manage senders/i },
    { menu: 'Themes',     dialog: /Manage themes/i },
    { menu: 'Homepages',  dialog: /Manage homepages/i }
]

test('los manager dialogs siguen listando catalogo tras pasar por el back', async ({ page }) => {
    // si algun dialogo fallara al resolver, el back devolveria [] y el dialogo saldria vacio en silencio,
    // asi que se vigila tambien que no aparezca un error de carga
    const failures: string[] = []

    await login(page)
    await dismissOpenDialogs(page)

    for (const c of CASES) {
        await clickExtensionMenuItem(page, c.menu)
        const dialog = page.getByRole('dialog').filter({ hasText: c.dialog })
        await dialog.waitFor({ timeout: 10000 })

        // el catalogo tarda: se espera a que aparezca alguna tarjeta con version
        const hasEntries = await dialog.getByText(/^v\d+\.\d+\.\d+$/).first().isVisible({ timeout: 15000 }).catch(() => false)
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
