import { test, expect } from './fixtures'
import { APIRequestContext, Page, request as playwrightRequest } from '@playwright/test'
import { createHash } from 'crypto'
import { dismissOpenDialogs, openMenu, USER, PASS } from './helpers'

/*
    Clusters whose credentials are LOGIN (plans/cluster-login): the entry is saved with no access key, and the
    user signs in to the remote Kwirth when using it — with any of the REMOTE's users — and the key it hands out
    is kept.

    The "remote" is the dev back itself (its own URL as a list entry): the sign-in, the key and its refusal are
    exactly a remote's, without needing a second Kwirth.

    What this defends:
      · Manage clusters: Credentials = Login saves without a key, the API Key field visible and disabled, and the
        row says 'login required';
      · the resource selector offers it (not greyed out) with 'login required'; choosing it opens the sign-in;
        a wrong password is said and the dialog stays; the right one signs in and the entry reads 'as <user>';
      · a session the remote no longer accepts (its key revoked) reads 'session expired', and choosing the
        cluster opens the sign-in SAYING it expired (D5);
      · Sign out forgets the session: the entry is back to 'login required'.

    NON-destructive: it works on an entry of its OWN ('e2e-login') and deletes it at the end; afterAll deletes it
    too if a test failed half-way. The keys its sign-ins create on the dev back are the ones any login creates
    (they expire in 24 h); the one it revokes is its own.
*/

test.describe.configure({ mode: 'serial' })

const ENTRY = 'e2e-login'
const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'

test.describe('Clusters with Login credentials', () => {
    let page: Page
    let api: APIRequestContext
    let auth: Record<string, string>

    const dialog = () => page.getByRole('dialog').filter({ hasText: 'Manage clusters' })
    const signInDialog = () => page.getByRole('dialog').filter({ hasText: `Sign in to ${ENTRY}` })
    const action = (name: string) => dialog().locator('.MuiDialogActions-root').getByRole('button', { name, exact: true })
    const entry = () => dialog().getByRole('list').getByRole('button').filter({ hasText: ENTRY })

    const openManage = async () => {
        await dismissOpenDialogs(page)
        await openMenu(page)
        await page.getByRole('menuitem', { name: 'Manage cluster list', exact: true }).click({ force: true })
        await expect(dialog()).toBeVisible({ timeout: 20000 })
    }

    // CLOSE writes the list back (App.onManageClustersClosed); the dialog is gone once it has
    const closeManage = async () => {
        await action('CLOSE').click()
        await expect(dialog()).toBeHidden({ timeout: 10000 })
    }

    const deleteEntry = async () => {
        await entry().click()
        await expect(dialog().getByLabel('Name', { exact: true })).toHaveValue(ENTRY)
        await action('DELETE').click()
        await page.getByRole('dialog', { name: 'Delete Cluster' }).getByRole('button', { name: 'yes', exact: true }).click()
        await expect(entry()).toHaveCount(0)
    }

    // The resource selector's cluster list, opened (its entries are re-checked on opening)
    const openSelector = async () => {
        await dismissOpenDialogs(page)
        await page.getByRole('combobox').first().click()
        await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 10000 })
    }
    const option = () => page.getByRole('listbox').getByRole('option').filter({ hasText: ENTRY })

    const fillSignIn = async (password: string) => {
        await signInDialog().getByLabel('Remote user').fill(USER)
        await signInDialog().getByLabel('Remote password').fill(password)
        await signInDialog().getByRole('button', { name: 'SIGN IN', exact: true }).click()
    }

    // The key the entry signed in with, as saved in the user's cluster list (id|type|resources)
    const savedKeyId = async (): Promise<string> => {
        let id = ''
        await expect.poll(async () => {
            const r = await api.get(`/store/${USER}/clusters/list`, { headers: auth })
            if (!r.ok()) return ''
            const list = JSON.parse(await r.json()) as { name: string, accessString?: string }[]
            id = (list.find(c => c.name === ENTRY)?.accessString ?? '').split('|')[0]
            return id
        }, { timeout: 15000 }).not.toBe('')
        return id
    }

    test.beforeAll(async ({ kwirth }) => {
        page = kwirth
        api = await playwrightRequest.newContext({ baseURL: BACK })
        const res = await api.post('/login', { data: { user: USER, password: createHash('sha256').update(PASS).digest('hex') } })
        expect(res.status(), 'login against the back end').toBe(200)
        const key = (await res.json()).accessKey as { id: string, type: string, resources: string }
        auth = { Authorization: `Bearer ${key.id}|${key.type}|${key.resources}` }

        await openManage()
        // a leftover of an earlier run that failed half-way is the test's own entry: it goes
        if (await entry().count() > 0) await deleteEntry()
        await closeManage()
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page)
        await openManage()
        if (await entry().count() > 0) await deleteEntry()
        await closeManage()
        await api?.dispose()
    })

    test('Credentials = Login saves without a key, and the row says it needs signing in', async () => {
        await openManage()
        await action('NEW').click()
        await dialog().getByLabel('Name', { exact: true }).fill(ENTRY)
        await dialog().getByLabel('URL', { exact: true }).fill(BACK)
        await dialog().getByRole('combobox', { name: 'Credentials' }).click()
        await page.getByRole('option', { name: 'Login', exact: true }).click()
        // the key field is still there, disabled, and SAVE does not ask for it
        await expect(dialog().getByLabel('API Key', { exact: true })).toBeDisabled()
        await expect(action('SAVE')).toBeEnabled()
        await action('SAVE').click()
        await expect(entry()).toHaveCount(1)
        await expect(entry().getByTestId('manage-clusters-row-session')).toHaveText('login required')
        await closeManage()
    })

    test('choosing it opens the sign-in; a wrong password is said, the right one signs in as the remote user', async () => {
        await openSelector()
        await expect(option()).toContainText('login required')
        await expect(option()).not.toHaveAttribute('aria-disabled', 'true')
        await option().click()

        await expect(signInDialog()).toBeVisible()
        await expect(signInDialog().getByTestId('cluster-login-reason')).toContainText('different user')
        // the browser must not fill in this Kwirth's own credentials: the remote's user is another one
        await expect(signInDialog().getByLabel('Remote user')).toHaveAttribute('autocomplete', 'off')
        await expect(signInDialog().getByLabel('Remote password')).toHaveAttribute('autocomplete', 'new-password')

        await fillSignIn('definitely-not-the-password')
        await expect(signInDialog().getByTestId('cluster-login-error')).toContainText('Invalid user or password')
        await expect(signInDialog()).toBeVisible()

        await fillSignIn(PASS)
        await expect(signInDialog()).toBeHidden({ timeout: 15000 })
        await openSelector()
        await expect(option()).toContainText(`as ${USER}`)
        await page.keyboard.press('Escape')
    })

    test('a session the remote no longer accepts reads "session expired", and the sign-in says it expired', async () => {
        // the remote revokes the key the entry signed in with
        const keyId = await savedKeyId()
        const del = await api.delete(`/key/${encodeURIComponent(keyId)}`, { headers: auth })
        expect(del.ok(), `revoke key: HTTP ${del.status()}`).toBe(true)

        // opening the selector re-checks the entries: this one is refused now
        await expect.poll(async () => {
            await openSelector()
            const text = await option().innerText()
            await page.keyboard.press('Escape')
            return text
        }, { timeout: 20000 }).toContain('session expired')

        await openSelector()
        await option().click()
        await expect(signInDialog()).toBeVisible()
        await expect(signInDialog().getByTestId('cluster-login-reason')).toContainText('has expired')
        await fillSignIn(PASS)
        await expect(signInDialog()).toBeHidden({ timeout: 15000 })
    })

    test('Sign out forgets the session: the entry needs signing in again', async () => {
        await openManage()
        await entry().click()
        await expect(dialog().getByTestId('manage-clusters-session')).toHaveText(`as ${USER}`)
        await dialog().getByRole('button', { name: 'SIGN OUT', exact: true }).click()
        await expect(dialog().getByTestId('manage-clusters-session')).toHaveText('login required')
        await expect(entry().getByTestId('manage-clusters-row-session')).toHaveText('login required')
        await expect(dialog().getByRole('button', { name: 'SIGN OUT', exact: true })).toBeDisabled()
        await closeManage()
    })
})
