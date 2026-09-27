import { test, expect } from '@playwright/test'
import { login, clickExtensionMenuItem, dismissOpenDialogs, GUIDE_MEDIA } from './helpers'

/*
    Regenerates the screenshot of the http-pull-push provider's dialog for the guide (docs/_media/guide).

    Excluded from the normal run (the repo's config ignores 'capture-*.spec.ts'): it is asked for by hand
    when updating the guide, because it writes into the documentation's images.

    NON-destructive: it saves whatever connections were there, sets up an example one just for the
    picture and restores the original state when it finishes.
*/

// The screenshots go to the LIVE documentation: see GUIDE_MEDIA in helpers.ts.
const MEDIA = GUIDE_MEDIA
const CONFIG_PATH = '/core/providerconfig/http-pull-push/configs'

// Example connection for the screenshot: neutral names and urls, with no data from the real environment.
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

        // a connection is opened so the shot shows the form, not the empty panel
        await dialog.getByText('stocks', { exact: true }).click()
        await expect(dialog.getByText('Editing: stocks')).toBeVisible()

        // room for MUI's animations to finish
        await page.waitForTimeout(2500)
        await dialog.screenshot({ path: `${MEDIA}/provider-config-http-pull-push.png` })
    }
    finally {
        await dismissOpenDialogs(page)
        expect((await api('PUT', original)).status, 'hay que dejar las conexiones como estaban').toBe(200)
    }
})
