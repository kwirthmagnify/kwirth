import { test, expect } from './fixtures'
import { Page } from '@playwright/test'
import { dismissOpenDialogs, openMenu } from './helpers'

/*
    Proxied cluster-list entries in Manage clusters (common/ClusterRoute): the Route and Cluster UID fields.

    What this defends, on a Kwirth with NO extension that resolves routes (the dev, today):
      · both fields are always there — nothing appears or disappears —, Route says Direct and is disabled
        because there is nothing else to choose, and Cluster UID is disabled because there is no route;
      · a direct entry can still be tested and saved exactly as before (the buttons enable as they did);
      · the home cluster cannot be given a route.

    NON-destructive: nothing is saved. Closing the dialog writes back the list it read, unchanged.
*/

test.describe.configure({ mode: 'serial' })

test.describe('Manage clusters: route fields', () => {
    let page: Page

    const dialog = () => page.getByRole('dialog').filter({ hasText: 'Manage clusters' })
    const action = (name: string) => dialog().locator('.MuiDialogActions-root').getByRole('button', { name, exact: true })
    const route = () => dialog().getByRole('combobox', { name: 'Route' })
    const uid = () => dialog().getByLabel('Cluster UID', { exact: true })

    test.beforeAll(async ({ kwirth }) => {
        page = kwirth
        await dismissOpenDialogs(page)
        await openMenu(page)
        await page.getByRole('menuitem', { name: 'Manage cluster list', exact: true }).click({ force: true })
        await expect(dialog()).toBeVisible({ timeout: 20000 })
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page)
    })

    test('a new entry: Route is Direct and disabled (no resolvers), Cluster UID disabled', async () => {
        await action('NEW').click()
        await expect(route()).toBeVisible()
        await expect(route()).toHaveText('Direct')
        await expect(route()).toHaveAttribute('aria-disabled', 'true')
        await expect(uid()).toBeVisible()
        await expect(uid()).toBeDisabled()
    })

    test('a direct entry enables TEST and SAVE as before', async () => {
        await expect(action('SAVE')).toBeDisabled()
        await expect(action('TEST')).toBeDisabled()
        await dialog().getByLabel('Name', { exact: true }).fill('e2e-direct')
        await dialog().getByLabel('URL', { exact: true }).fill('http://e2e-direct.invalid')
        await dialog().getByLabel('API Key', { exact: true }).fill('not-a-key')
        await expect(action('TEST')).toBeEnabled()
        await expect(action('SAVE')).toBeEnabled()
        // leave the form empty again: nothing typed here is saved
        await action('NEW').click()
        await expect(dialog().getByLabel('Name', { exact: true })).toHaveValue('')
    })

    test('the home cluster cannot be given a route', async () => {
        // the home cluster is the one whose fields are locked
        const items = dialog().getByRole('list').getByRole('button')
        await expect(items.first()).toBeVisible()
        const count = await items.count()
        const nameField = dialog().getByLabel('Name', { exact: true })
        for (let i = 0; i < count; i++) {
            const itemName = (await items.nth(i).locator('p').first().innerText()).trim()
            await items.nth(i).click()
            // the form is repainted AFTER the click: wait for it to show this cluster before reading it
            await expect(nameField).toHaveValue(itemName)
            if (await nameField.isDisabled()) {
                await expect(route()).toHaveAttribute('aria-disabled', 'true')
                await expect(uid()).toBeDisabled()
                return
            }
        }
        const seen: string[] = []
        for (let i = 0; i < count; i++) seen.push((await items.nth(i).innerText()).replace(/\s+/g, ' ').trim())
        throw new Error(`no home cluster in the list (${count} item(s): ${seen.join(' | ')})`)
    })
})
