import { test, expect, Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { ESignupStatus, ISignupInfo, ISignupRequest } from '@kwirthmagnify/kwirth-common'
import { login, dismissOpenDialogs, openMenu, clickExtensionMenuItem, GUIDE_MEDIA } from './helpers'

/*
    Screenshots for the admin guide after signup (plan: plans/completed/signup/PLAN.md, S3):
      · 03-user-management: admin-user-security, admin-user-idp, admin-signup-request (new)
      · 05-api-management:  admin-api-security
      · 07-idp-integration: admin-idp-settings, admin-signup-dialog (new)
    Run by hand:  CAPTURES=1 playwright test capture-signup.spec.ts

    Retaken because the dialogs changed: User security got its access requests, a fixed button bar and the
    resource editor in a box; API Security got wider with its filters in two rows; the IdP form got the
    Signup section.

    🔴 These images are published. Real accounts' e-mails are blurred (the user list, key descriptions), and
    so are the IdP connector's values. The only address left readable is a FICTITIOUS one, the request this
    spec seeds. Non-destructive: the seeded request is removed at the end (and the Secret too, if it did not
    exist before); nothing is saved.
*/

const MEDIA = GUIDE_MEDIA
const NAMESPACE = process.env.KWIRTH_E2E_NAMESPACE ?? 'kwirth'
const SECRET = 'kwirth-signups'
const SAMPLE: ISignupRequest = { id: 'jane.doe@example.com', idp: 'google', name: 'Jane Doe', comment: 'I am on the platform team and need to read the logs of our namespaces.', requestedAt: Date.now() - 3600_000, status: ESignupStatus.PENDING }

const keyOf = (id: string) => Buffer.from(id, 'utf8').toString('base64url')
const kubectl = (args: string[]) => execFileSync('kubectl', ['-n', NAMESPACE, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const secretExists = (): boolean => { try { kubectl(['get', 'secret', SECRET]); return true } catch { return false } }

// blurs every leaf whose text is an e-mail, except the fictitious sample
const redactEmails = async (page: Page) => {
    await page.evaluate((keep) => {
        if (!document.getElementById('kw-redact-style')) {
            const style = document.createElement('style')
            style.id = 'kw-redact-style'
            style.textContent = '.kw-redact{filter:blur(6px)}'
            document.head.appendChild(style)
        }
        const email = /[^\s@]+@[^\s@]+\.[^\s@]+/
        for (const el of Array.from(document.querySelectorAll('body *'))) {
            if (el.children.length > 0) continue
            const text = el.textContent ?? ''
            if (email.test(text) && !text.includes(keep)) el.classList.add('kw-redact')
        }
        for (const input of Array.from(document.querySelectorAll('input'))) {
            if (email.test(input.value) && !input.value.includes(keep)) input.classList.add('kw-redact')
        }
    }, SAMPLE.id)
}

const settle = (page: Page) => page.waitForTimeout(1200)

const openUserSecurity = async (page: Page) => {
    await dismissOpenDialogs(page)
    await openMenu(page)
    await page.getByRole('menuitem', { name: 'User security', exact: true }).click({ force: true })
    const dialog = page.getByRole('dialog').filter({ hasText: 'User management' })
    await expect(dialog).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(1500)
    return dialog
}

test.describe.configure({ mode: 'serial' })

test.describe('capture: signup in the admin guide (dark)', () => {
    let page: Page
    let existedBefore = false

    test.beforeAll(async ({ browser }) => {
        existedBefore = secretExists()
        const value = JSON.stringify(SAMPLE)
        if (existedBefore) kubectl(['patch', 'secret', SECRET, '--type', 'merge', '-p', JSON.stringify({ data: { [keyOf(SAMPLE.id)]: Buffer.from(value).toString('base64') } })])
        else kubectl(['create', 'secret', 'generic', SECRET, `--from-literal=${keyOf(SAMPLE.id)}=${value}`])

        page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
        await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => {
        await page?.close().catch(() => {})
        if (!secretExists()) return
        if (existedBefore) kubectl(['patch', 'secret', SECRET, '--type', 'json', '-p', JSON.stringify([{ op: 'remove', path: `/data/${keyOf(SAMPLE.id)}` }])])
        else kubectl(['delete', 'secret', SECRET])
    })

    test('admin-user-security + admin-user-idp', async () => {
        const dialog = await openUserSecurity(page)
        await dialog.getByRole('button', { name: 'admin', exact: true }).click()
        await settle(page)
        await redactEmails(page)
        await page.screenshot({ path: `${MEDIA}/admin-user-security.png` })

        await dialog.locator('.MuiFormControl-root').filter({ has: page.getByText('IdP', { exact: true }) }).getByRole('combobox').click()
        await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 10000 })
        await settle(page)
        await redactEmails(page)
        // 🔴 this machine may have PAID connectors configured (they do not belong in the public guide):
        // only 'Local' and the public Google one stay readable
        await page.getByRole('listbox').evaluate((list) => {
            for (const option of Array.from(list.querySelectorAll('[role="option"]'))) {
                const text = option.textContent ?? ''
                if (!/^Local|Google/.test(text)) option.classList.add('kw-redact')
            }
        })
        await page.screenshot({ path: `${MEDIA}/admin-user-idp.png` })
        await page.keyboard.press('Escape')
    })

    test('admin-signup-request', async () => {
        const dialog = page.getByRole('dialog').filter({ hasText: 'User management' })
        await dialog.getByTestId(`signup-request-${SAMPLE.id}`).click()
        await expect(dialog.getByTestId('signup-request-detail')).toBeVisible()
        await settle(page)
        await redactEmails(page)
        await page.screenshot({ path: `${MEDIA}/admin-signup-request.png` })
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    })

    test('admin-api-security', async () => {
        await dismissOpenDialogs(page)
        await openMenu(page)
        await page.getByRole('menuitem', { name: 'API Security', exact: true }).click({ force: true })
        const dialog = page.getByRole('dialog').filter({ hasText: 'API Key management' })
        await expect(dialog).toBeVisible({ timeout: 20000 })
        await page.waitForTimeout(1500)
        await redactEmails(page)
        await page.screenshot({ path: `${MEDIA}/admin-api-security.png` })
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    })

    test('admin-idp-settings', async () => {
        await page.setViewportSize({ width: 1600, height: 1000 })
        await clickExtensionMenuItem(page, 'Identity providers')
        const manager = page.getByRole('dialog').filter({ hasText: /Identity providers/i })
        await expect(manager).toBeVisible({ timeout: 40000 })
        await manager.getByText('Login with Google', { exact: true }).first()
            .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
            .locator('button[aria-label="Configure"]').first().click()
        const cfg = page.getByRole('dialog').filter({ hasText: 'Configure: ' })
        await expect(cfg).toBeVisible({ timeout: 20000 })

        // the Signup section as an admin would leave it: on, limited to the organisation's domain (NOT saved)
        const allow = cfg.getByRole('checkbox', { name: /Allow signup/ })
        if (!await allow.isChecked()) await allow.click()
        await cfg.getByLabel('Allowed email domains').fill('example.com')
        await settle(page)
        // the connector's own values (client id, secret, issuer…) are this machine's: blurred
        await cfg.evaluate((root) => {
            if (!document.getElementById('kw-redact-style')) {
                const style = document.createElement('style')
                style.id = 'kw-redact-style'
                style.textContent = '.kw-redact{filter:blur(6px)}'
                document.head.appendChild(style)
            }
            for (const input of Array.from(root.querySelectorAll('input[type="text"], input[type="password"], input:not([type])'))) {
                const label = input.closest('.MuiFormControl-root')?.querySelector('label')?.textContent ?? ''
                if (!/Allowed email domains/.test(label)) input.classList.add('kw-redact')
            }
        })
        // 🔴 the dialog, NOT the page: behind it the manager lists whatever connectors this machine has,
        // paid ones included, and those do not belong in the public guide
        await cfg.screenshot({ path: `${MEDIA}/admin-idp-settings.png` })
        await cfg.getByRole('button', { name: /cancel/i }).click()
        await dismissOpenDialogs(page)
        await page.setViewportSize({ width: 1600, height: 900 })
    })
})

test('admin-signup-dialog (what the requester sees)', async ({ page }) => {
    // the dialog needs a code only a real IdP round trip hands out: its info is answered here instead
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    const info: ISignupInfo = { id: SAMPLE.id, name: SAMPLE.name, idp: 'google', idpLabel: 'Login with Google' }
    await page.route('**/core/auth/signup/info', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(info) }))
    await page.goto('/?signup=guide-capture')
    const dialog = page.getByTestId('signup-dialog')
    await expect(dialog.getByLabel('Email')).toHaveValue(SAMPLE.id, { timeout: 30000 })
    await dialog.getByLabel('Why do you need access? (optional)').fill(SAMPLE.comment!)
    await settle(page)
    await page.screenshot({ path: `${MEDIA}/admin-signup-dialog.png` })
})
