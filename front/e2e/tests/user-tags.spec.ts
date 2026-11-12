import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, openMenu } from './helpers'

/*
    User tags (plans/user-tags, U1): the admin labels a user with `<extension>:<value>` tags in User security;
    each extension reads its own. What this defends:

      · a tag is typed and confirmed as a chip, and survives a save (read back by reopening the user);
      · a malformed one is said under the field, its chip turns red and Save is disabled — the same check the
        back makes, so the admin learns before saving instead of from an HTTP 400.

    NON-destructive: the test creates its own user and deletes it at the end (in afterAll, whatever happened).
*/

const USER_ID = `e2e-tags-${Date.now().toString(36)}`

test.describe.configure({ mode: 'serial' })

test.describe('user tags in User security', () => {
    let page: Page

    const dialog = () => page.getByRole('dialog').filter({ hasText: 'User management' })
    const tagsInput = () => dialog().getByLabel('Tags', { exact: true })
    // The dialog's own buttons are in its action bar (there is another "New" elsewhere in it).
    const action = (name: string) => dialog().locator('.MuiDialogActions-root').getByRole('button', { name, exact: true })
    const open = async () => {
        await dismissOpenDialogs(page)
        await openMenu(page)
        await page.getByRole('menuitem', { name: 'User security', exact: true }).click({ force: true })
        await expect(dialog()).toBeVisible({ timeout: 20000 })
        await page.waitForTimeout(1500)   // the user list loads after opening
    }
    const addTag = async (tag: string) => {
        await tagsInput().fill(tag)
        await tagsInput().press('Enter')
    }

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
        await login(page)
    })

    test.afterAll(async () => {
        // Whatever happened above, the test's own user goes.
        await open().catch(() => {})
        const row = dialog().getByRole('button', { name: USER_ID, exact: true })
        if (await row.count() > 0) {
            await row.click()
            await action('Delete').click()
            await page.getByRole('button', { name: /^yes$/i }).click()
            await expect(dialog().getByRole('button', { name: USER_ID, exact: true })).toHaveCount(0, { timeout: 10000 })
        }
        await page.close()
    })

    test('a new user takes a tag as a chip; a malformed one is said and Save waits', async () => {
        await open()
        await action('New').click()
        await dialog().getByLabel('Id', { exact: true }).fill(USER_ID)
        await dialog().getByLabel('Name', { exact: true }).fill('E2E tags')
        await expect(dialog().getByText('They grant no permission.', { exact: false })).toBeVisible()

        await addTag('e2e:One')
        await expect(dialog().getByRole('button', { name: 'e2e:one' })).toBeVisible()   // normalized to lower case

        await addTag('nope')
        await expect(dialog().getByText(/Invalid tag 'nope': the form is <extension>:<value>/)).toBeVisible()
        await expect(action('Save')).toBeDisabled()

        // Removing the bad chip clears the error and gives Save back.
        await dialog().getByRole('button', { name: 'nope' }).locator('.MuiChip-deleteIcon').click()
        await expect(dialog().getByText(/Invalid tag/)).toHaveCount(0)
        await expect(action('Save')).toBeEnabled()
        await action('Save').click()
        await expect(dialog().getByRole('button', { name: USER_ID, exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('the tag survives the save: reopening the user shows it', async () => {
        await action('Close').click()
        await open()
        await dialog().getByRole('button', { name: USER_ID, exact: true }).click()
        await expect(dialog().getByLabel('Id', { exact: true })).toHaveValue(USER_ID)
        await expect(dialog().getByRole('button', { name: 'e2e:one' })).toBeVisible()
    })

    // Seen in the QA: a tag typed and saved WITHOUT pressing Enter was lost. What is written is what is saved.
    test('a tag typed and saved without pressing Enter is saved too', async () => {
        await tagsInput().fill('e2e:two')
        await action('Save').click()
        await action('Close').click()
        await open()
        await dialog().getByRole('button', { name: USER_ID, exact: true }).click()
        await expect(dialog().getByRole('button', { name: 'e2e:one' })).toBeVisible()
        await expect(dialog().getByRole('button', { name: 'e2e:two' })).toBeVisible()
        // And a malformed one typed without Enter is checked too: Save waits.
        await tagsInput().fill('nope')
        await expect(dialog().getByText(/Invalid tag 'nope'/)).toBeVisible()
        await expect(action('Save')).toBeDisabled()
    })

    // Seen in the QA: New emptied the chips but left the text being typed (not confirmed with Enter) in the field.
    test('New clears the tags: the chips AND the text still being typed', async () => {
        await tagsInput().fill('half:typed')
        await action('New').click()
        await expect(dialog().getByRole('button', { name: 'e2e:one' })).toHaveCount(0)
        await expect(tagsInput()).toHaveValue('')
    })
})
