import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { createHash } from 'crypto'
import { execFileSync } from 'child_process'
import { ESignupStatus, ISignupRequest } from '@kwirthmagnify/kwirth-common'
import { login, dismissOpenDialogs, openMenu, assertFrontCompiles } from './helpers'

/*
    Signup from the admin's side, in the real front end (plan: plans/signup/PLAN.md, S3).

    A request can only be born from a real IdP round trip, which cannot be automated, so the test SEEDS two
    into the dev core's 'kwirth-signups' Secret with kubectl — exactly what the back end would have written
    — and drives the UI over them: the admin's notice on login, the list in User security, approving one
    with a resource and deleting the other.

    NON-destructive: it only adds keys of its own (`e2e-signup-` prefix). At the end it removes them, deletes
    the user the approval created, and, if the Secret did not exist before the test, deletes the Secret —
    leaving the store as it was read.
*/

const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const USER = process.env.KWIRTH_E2E_USER ?? 'admin'
const PASS = process.env.KWIRTH_E2E_PASS ?? ''
const NAMESPACE = process.env.KWIRTH_E2E_NAMESPACE ?? 'kwirth'
const SECRET = 'kwirth-signups'

const PENDING: ISignupRequest = { id: 'e2e-signup-pending@example.com', idp: 'google', name: 'E2E Pending', comment: 'e2e: I need the logs', requestedAt: Date.now(), status: ESignupStatus.PENDING }
const REJECTED: ISignupRequest = { id: 'e2e-signup-rejected@example.com', idp: 'google', name: 'E2E Rejected', requestedAt: Date.now() - 60_000, status: ESignupStatus.REJECTED }

// the same key and value the back end's SignupStore writes: base64url(email) → base64(JSON(request))
const keyOf = (id: string) => Buffer.from(id, 'utf8').toString('base64url')
const valueOf = (r: ISignupRequest) => Buffer.from(JSON.stringify(r), 'utf8').toString('base64')

const kubectl = (args: string[]) => execFileSync('kubectl', ['-n', NAMESPACE, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const secretExists = (): boolean => { try { kubectl(['get', 'secret', SECRET]); return true } catch { return false } }

const seed = (requests: ISignupRequest[]) => {
    const data: Record<string, string> = {}
    for (const r of requests) data[keyOf(r.id)] = valueOf(r)
    if (secretExists()) kubectl(['patch', 'secret', SECRET, '--type', 'merge', '-p', JSON.stringify({ data })])
    else kubectl(['create', 'secret', 'generic', SECRET, ...Object.entries(data).map(([k, v]) => `--from-literal=${k}=${Buffer.from(v, 'base64').toString('utf8')}`)])
}

const unseed = (requests: ISignupRequest[], existedBefore: boolean) => {
    if (!secretExists()) return
    if (!existedBefore) {
        kubectl(['delete', 'secret', SECRET])
        return
    }
    for (const r of requests) {
        try { kubectl(['patch', 'secret', SECRET, '--type', 'json', '-p', JSON.stringify([{ op: 'remove', path: `/data/${keyOf(r.id)}` }])]) }
        catch { /* already gone: the test deleted or approved it */ }
    }
}

const openUserSecurity = async (page: Page) => {
    await dismissOpenDialogs(page)
    await openMenu(page)
    await page.getByRole('menuitem', { name: 'User security', exact: true }).click({ force: true })
    await expect(page.getByRole('dialog').filter({ hasText: 'User management' })).toBeVisible({ timeout: 20000 })
}

const scopesCombo = (page: Page) =>
    page.getByRole('dialog').locator('.MuiFormControl-root')
        .filter({ has: page.getByText('Scopes', { exact: true }) })
        .getByRole('combobox')

test.describe.configure({ mode: 'serial' })

test.describe('signup: what the admin sees and does', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string>
    let existedBefore = false

    test.beforeAll(async ({ browser, playwright }) => {
        api = await playwright.request.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'admin login against the back end').toBe(200)
        const key = (await res.json()).accessKey
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }

        existedBefore = secretExists()
        seed([PENDING, REJECTED])

        page = await browser.newPage()
        await login(page)
    })

    test.afterAll(async () => {
        await page?.close().catch(() => {})
        await api.delete(`/user/${encodeURIComponent(PENDING.id)}`, { headers: auth }).catch(() => {})
        unseed([PENDING, REJECTED], existedBefore)
        await api.dispose()
    })

    test('RF6: al entrar, el admin ve que hay peticiones esperando', async () => {
        /*
            Read from the notifications menu, not from the snackbar: the snackbar hides after 3 s and the
            next notice (the extension updates, on every login) replaces it, so whether it is still there
            when the test looks is luck. The menu keeps every notice of the session.
        */
        const notice = /access requests? (is|are) waiting for approval/i
        await expect(async () => {
            await page.keyboard.press('Escape')
            // the bell has no accessible name (its Tooltip title is a fragment): found by MUI's icon testid
            // a short click: the bell only turns 'active' once the first notice arrives, and a click that waits
            // its default 15 s would leave toPass room for just two tries
            await page.locator('header button').filter({ has: page.locator('[data-testid="NotificationsActiveIcon"]') }).click({ timeout: 2000 })
            await expect(page.getByText(notice).first()).toBeVisible({ timeout: 2000 })
        }).toPass({ timeout: 45000 })
        await page.keyboard.press('Escape')
    })

    test('User security lista las peticiones con su estado', async () => {
        await openUserSecurity(page)
        const dialog = page.getByRole('dialog').filter({ hasText: 'User management' })
        await expect(dialog.getByTestId('signup-requests-header')).toContainText(/pending\)/)
        await expect(dialog.getByTestId(`signup-request-${PENDING.id}`)).toContainText('pending')
        await expect(dialog.getByTestId(`signup-request-${REJECTED.id}`)).toContainText('rejected')
    })

    /*
        🔴 What the user flagged: selecting a request resized the dialog, and the button bar swapped buttons
        and texts. The dialog has a fixed size, and the bar always has ALL its buttons in the same place —
        only enabled or disabled by what is selected.
    */
    test('elegir un usuario o una peticion no cambia el tamaño ni la botonera', async () => {
        const dialog = page.getByRole('dialog').filter({ hasText: 'User management' })
        const paper = dialog
        const BUTTONS = ['New', 'Save', 'Copy password', 'Delete', 'Approve', 'Reject', 'Delete request']
        const state = async () => {
            const box = await paper.boundingBox()
            const enabled: Record<string, boolean> = {}
            // the bar only: the resource editor has a 'New' and a 'Save' of its own
            const bar = dialog.locator('.MuiDialogActions-root')
            for (const b of BUTTONS) {
                const button = bar.getByRole('button', { name: b, exact: true })
                await expect(button, `the '${b}' button must always be there`).toHaveCount(1)
                enabled[b] = await button.isEnabled()
            }
            return { width: box!.width, height: box!.height, enabled }
        }

        await dialog.getByRole('button', { name: 'admin', exact: true }).click()
        await expect(dialog.getByLabel('Name', { exact: true })).toBeEnabled()
        const onUser = await state()
        await dialog.getByTestId(`signup-request-${PENDING.id}`).click()
        await expect(dialog.getByTestId('signup-request-detail')).toBeVisible()
        const onRequest = await state()

        expect(onRequest.width).toBe(onUser.width)
        expect(onRequest.height).toBe(onUser.height)
        // on a user, the request buttons are off; on a request, the user ones are
        expect(onUser.enabled).toMatchObject({ Approve: false, Reject: false, 'Delete request': false, Delete: false })
        expect(onRequest.enabled).toMatchObject({ Save: false, 'Copy password': false, Delete: false, Reject: true, 'Delete request': true })
    })

    test('una rechazada no se puede volver a rechazar, y borrarla la quita', async () => {
        const dialog = page.getByRole('dialog').filter({ hasText: 'User management' })
        await dialog.getByTestId(`signup-request-${REJECTED.id}`).click()
        await expect(dialog.getByTestId('signup-request-detail')).toContainText(/^Rejected\./)
        await expect(dialog.getByRole('button', { name: 'Reject', exact: true })).toBeDisabled()

        await dialog.getByRole('button', { name: 'Delete request' }).click()
        await page.getByRole('dialog').filter({ hasText: 'Delete request' }).getByRole('button', { name: /yes/i }).click()
        await expect(dialog.getByTestId(`signup-request-${REJECTED.id}`)).toHaveCount(0, { timeout: 15000 })

        const all = await (await api.get('/core/signups', { headers: auth })).json() as ISignupRequest[]
        expect(all.map(r => r.id)).not.toContain(REJECTED.id)
    })

    test('una pendiente se revisa con sus datos fijos y se aprueba con un recurso', async () => {
        const dialog = page.getByRole('dialog').filter({ hasText: 'User management' })
        await dialog.getByTestId(`signup-request-${PENDING.id}`).click()
        await expect(dialog.getByTestId('signup-request-detail')).toContainText(PENDING.comment!)
        // the request's: who they are and how they sign in are not the admin's to change here
        await expect(dialog.getByLabel('Id (email)', { exact: true })).toBeDisabled()
        await expect(dialog.getByLabel('Name', { exact: true })).toBeDisabled()
        // approving with nothing would create a user who can do nothing
        const approve = dialog.getByRole('button', { name: 'Approve', exact: true })
        await expect(approve).toBeDisabled()

        // one resource: the first scope of the catalogue, whatever this environment has
        await scopesCombo(page).click()
        // MUI slips in an empty option as the slot for the unchosen value: the first one WITH a name
        const option = page.getByRole('listbox').getByRole('option').filter({ hasText: /[A-Za-z]/ }).first()
        const label = (await option.innerText()).trim()
        await option.click()
        await page.keyboard.press('Escape')
        await page.getByRole('listbox').waitFor({ state: 'hidden', timeout: 10000 })
        await expect(scopesCombo(page)).toContainText(label)
        // the resource editor's Save, inside the content — not the user's Save in the bar
        await dialog.locator('.MuiDialogContent-root').getByRole('button', { name: 'Save', exact: true }).click()
        await expect(approve).toBeEnabled()
        await approve.click()

        await expect(dialog.getByTestId(`signup-request-${PENDING.id}`)).toHaveCount(0, { timeout: 15000 })
        await expect(dialog.getByRole('button', { name: PENDING.id })).toBeVisible()

        // the approval made a USER bound to the request's IdP, with what the admin gave it
        const user = await (await api.get(`/user/${encodeURIComponent(PENDING.id)}`, { headers: auth })).json()
        expect(user.idp).toBe(PENDING.idp)
        expect(user.name).toBe(PENDING.name)
        expect(user.resources).not.toBe('')
        const all = await (await api.get('/core/signups', { headers: auth })).json() as ISignupRequest[]
        expect(all.map(r => r.id)).not.toContain(PENDING.id)
    })
})

test('un ?signup= con un codigo que nadie dio dice que la peticion ha caducado', async ({ page }) => {
    await page.goto('/?signup=e2e-bogus-code')
    await assertFrontCompiles(page)
    await expect(page.getByRole('dialog').filter({ hasText: /The request expired/ })).toBeVisible({ timeout: 30000 })
    expect(new URL(page.url()).searchParams.get('signup')).toBeNull()
})
