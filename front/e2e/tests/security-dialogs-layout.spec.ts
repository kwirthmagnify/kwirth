import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, openMenu } from './helpers'

/*
    The two security dialogs, User security and API Security (plan: plans/completed/signup/PLAN.md, S3, where both
    were reworked). The rule they follow: the dialog takes the size of its CONTENT, and the content has a
    fixed shape. Two things broke it and the user saw both:

      · a fixed height (75vh) shorter than the editor → a vertical scrollbar over the whole content;
      · a list that grows with its items, pushing the dialog taller.

    The list scrolls INSIDE its column; the content as a whole never does. NON-destructive: it opens and
    closes, saving nothing.
*/

const open = async (page: Page, item: string, title: string) => {
    await dismissOpenDialogs(page)
    await openMenu(page)
    await page.getByRole('menuitem', { name: item, exact: true }).click({ force: true })
    const dialog = page.getByRole('dialog').filter({ hasText: title })
    await expect(dialog).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(1500)   // the lists load after opening
    return dialog
}

// the content does not scroll as a whole: everything it has fits in what is shown
const contentScrolls = async (page: Page) =>
    page.locator('.MuiDialogContent-root').last().evaluate(el => el.scrollHeight > el.clientHeight + 1)

test.describe.configure({ mode: 'serial' })

test.describe('security dialogs: the size follows the content, and the content does not scroll', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
        await login(page)
    })

    test.afterAll(async () => {
        await page.close()
    })

    test('API Security: no vertical scroll over the content', async () => {
        const dialog = await open(page, 'API Security', 'API Key management')
        expect(await contentScrolls(page), 'the content scrolls: the dialog is shorter than what it holds').toBe(false)
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    })

    test('User security: no vertical scroll over the content', async () => {
        const dialog = await open(page, 'User security', 'User management')
        expect(await contentScrolls(page), 'the content scrolls: the dialog is shorter than what it holds').toBe(false)
        await dialog.getByRole('button', { name: 'Close', exact: true }).click()
    })
})
