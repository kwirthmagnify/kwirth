import { test, expect } from '@playwright/test'
import { assertFrontCompiles } from './helpers'

/*
    What the login screen says for each outcome of an IdP callback (plan: plans/completed/signup/PLAN.md, S1).

    The back end hands the outcome over as `?ssoerror=<value>`, and the values used to be plain strings on
    both sides. They are ESsoResult now, and the front end maps them with a Record over the enum. What is
    watched: the old outcomes still say what they said, the three new signup ones have their own message,
    and an outcome the front end does not know (a newer back end) falls back instead of showing nothing.

    NON-destructive: it only opens the front end with a query string; nothing logs in.
*/

const CASES: { result: string, message: RegExp }[] = [
    { result: 'notfound', message: /This account is not authorized to access Kwirth\./ },
    { result: 'idpmismatch', message: /registered with a different identity provider/ },
    { result: 'pending', message: /Your access request is pending/ },
    { result: 'rejected', message: /Your access request was rejected/ },
    { result: 'signuplimit', message: /Access requests cannot be accepted right now/ },
    { result: 'from-a-newer-back-end', message: /Single Sign-On failed \(from-a-newer-back-end\)\./ }
]

test.describe('login: the message for each IdP callback outcome', () => {
    for (const c of CASES) {
        test(`?ssoerror=${c.result}`, async ({ page }) => {
            await page.goto(`/?ssoerror=${c.result}`)
            await assertFrontCompiles(page)
            await expect(page.getByRole('dialog').filter({ hasText: c.message })).toBeVisible({ timeout: 30000 })
            // the outcome is consumed: it leaves the URL so a reload does not show it again
            expect(new URL(page.url()).searchParams.get('ssoerror')).toBeNull()
        })
    }
})
