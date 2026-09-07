import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    Regenera la captura del dialogo del provider http-pull-push para la guia (docs/_media/guide).

    Excluida de la corrida normal (la config del repo ignora 'capture-*.spec.ts'): se pide a mano al
    actualizar la guia, porque escribe en las imagenes de la documentacion.

    NO destructivo: guarda las conexiones que hubiera, monta una de ejemplo solo para la foto y restaura
    el estado original al terminar.
*/

const MEDIA = 'C:/github/aisdkvercel/kwirth/docs/0.5.287/_media/guide'
const CONFIG_PATH = '/core/providerconfig/http-pull-push/configs'

// Conexion de ejemplo para la captura: nombres y urls neutros, sin datos del entorno real.
const SAMPLE = [
    {
        name: 'stocks',
        enabled: true,
        url: 'https://api.example.com/v1/quotes?symbol=ACME',
        method: 'GET',
        headers: { Accept: 'application/json' },
        intervalSeconds: 60,
        timeoutMs: 5000,
        auth: { type: 'bearer', token: 'not-a-real-token' },
        responseType: 'json',
        emitMode: 'always',
        retries: 1,
        allowInsecureTls: false
    },
    {
        name: 'rss',
        enabled: true,
        url: 'https://example.com/blog/feed.xml',
        method: 'GET',
        headers: {},
        intervalSeconds: 300,
        timeoutMs: 5000,
        auth: { type: 'none' },
        responseType: 'text',
        emitMode: 'onChange',
        retries: 0,
        allowInsecureTls: false
    },
    {
        name: 'news',
        enabled: false,
        url: 'https://api.example.com/v1/news',
        method: 'GET',
        headers: {},
        intervalSeconds: 900,
        timeoutMs: 5000,
        auth: { type: 'none' },
        responseType: 'json',
        emitMode: 'always',
        retries: 0,
        allowInsecureTls: false
    }
]

test('capture the http-pull-push connections dialog (dark)', async ({ page }) => {
    let bearer = ''
    let backend = ''
    page.on('request', req => {
        const auth = req.headers()['authorization']
        if (!bearer && auth?.startsWith('Bearer ')) {
            bearer = auth.slice(7)
            backend = new URL(req.url()).origin
        }
    })

    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)

    const api = (method: string, body?: unknown) => page.evaluate(async ({ method, body, path, bearer, backend }) => {
        const res = await fetch(`${backend}${path}`, {
            method,
            headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json', 'X-Kwirth-App': 'true' },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        })
        return { status: res.status, text: await res.text() }
    }, { method, body, path: CONFIG_PATH, bearer, backend })

    await clickExtensionMenuItem(page, 'Providers')
    await page.getByRole('dialog').filter({ hasText: /Manage providers/i }).waitFor({ timeout: 10000 })
    expect(bearer, 'no se capturo el accessKey de la sesion').not.toBe('')

    const original = JSON.parse((await api('GET')).text)

    try {
        expect((await api('PUT', SAMPLE)).status).toBe(200)

        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'Providers')
        const manager = page.getByRole('dialog').filter({ hasText: /Manage providers/i })
        await manager.getByPlaceholder('Filter…').first().fill('http-pull-push')
        await page.waitForTimeout(500)
        await manager.locator('[aria-label="Configure"]').getByRole('button').click()

        const dialog = page.getByRole('dialog').filter({ hasText: /HTTP Pull-Push Provider — Connections/i })
        await expect(dialog).toBeVisible({ timeout: 15000 })

        // se abre una conexion para que la foto muestre el formulario, no el panel vacio
        await dialog.getByText('stocks', { exact: true }).click()
        await expect(dialog.getByText('Editing: stocks')).toBeVisible()

        // margen para que terminen las animaciones de MUI
        await page.waitForTimeout(2500)
        await dialog.screenshot({ path: `${MEDIA}/provider-config-http-pull-push.png` })
    }
    finally {
        await dismissOpenDialogs(page)
        expect((await api('PUT', original)).status, 'hay que dejar las conexiones como estaban').toBe(200)
    }
})
