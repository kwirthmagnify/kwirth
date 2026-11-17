import { test, expect } from './fixtures'
import { Page } from '@playwright/test'
import { dismissOpenDialogs, openMenu } from './helpers'

/*
    The 'Enabled' switch of Manage cluster list (Cluster.inUse).

    What this defends:
      · an entry saved with Enabled OFF stays in the list (dimmed, saying why) but is NOT offered in the
        resource selector;
      · switched ON again, it is back in the selector — and, as its url goes nowhere, it is GREY there and says
        how it is reached and that it does not answer (S8.1 of plans/router-extension);
      · the home cluster's switch cannot be touched.
    That the BACK leaves the switched-off entries out of what it reads (readUserStore('clusters','list')) is
    covered by the unit test of back/src/tools/ClusterListFilter.ts.

    NON-destructive: it works on an entry of its OWN ('e2e-enabled', pointing to an .invalid host) and deletes
    it at the end; afterAll deletes it too if a test failed half-way. The user's entries are never edited.
*/

test.describe.configure({ mode: 'serial' })

const ENTRY = 'e2e-enabled'

test.describe('Manage clusters: the Enabled switch', () => {
    let page: Page

    const dialog = () => page.getByRole('dialog').filter({ hasText: 'Manage clusters' })
    const action = (name: string) => dialog().locator('.MuiDialogActions-root').getByRole('button', { name, exact: true })
    const enabled = () => dialog().getByRole('switch', { name: 'Enabled', exact: true })
    // a MUI Switch is flipped through its label: the input itself is covered by the thumb
    const flipEnabled = () => dialog().getByText('Enabled', { exact: true }).click()
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

    // The options of the resource selector's Cluster list, read and closed again (nothing is added)
    const selectorOption = async (name: string) => {
        await dismissOpenDialogs(page)
        await page.getByRole('button', { name: 'ADD', exact: true }).click({ force: true })
        await page.getByRole('combobox').first().click()
        await page.getByRole('listbox').waitFor({ state: 'visible', timeout: 10000 })
        return page.getByRole('listbox').getByRole('option', { name, exact: true })
    }

    const closeSelector = async () => {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(200)
        await dismissOpenDialogs(page)
    }

    const deleteEntry = async () => {
        await entry().click()
        await expect(dialog().getByLabel('Name', { exact: true })).toHaveValue(ENTRY)
        await action('DELETE').click()
        await page.getByRole('dialog', { name: 'Delete Cluster' }).getByRole('button', { name: 'yes', exact: true }).click()
        await expect(entry()).toHaveCount(0)
    }

    test.beforeAll(async ({ kwirth }) => {
        page = kwirth
        await openManage()
        // a leftover of an earlier run that failed half-way is the test's own entry: it goes
        if (await entry().count() > 0) await deleteEntry()
    })

    test.afterAll(async () => {
        await dismissOpenDialogs(page)
        await openManage()
        if (await entry().count() > 0) await deleteEntry()
        await closeManage()
    })

    test('an entry saved with Enabled OFF stays in the list, dimmed, and says why', async () => {
        await action('NEW').click()
        await expect(enabled()).toBeChecked()
        await dialog().getByLabel('Name', { exact: true }).fill(ENTRY)
        await dialog().getByLabel('URL', { exact: true }).fill('http://e2e-enabled.invalid')
        await dialog().getByLabel('API Key', { exact: true }).fill('not-a-key')
        await flipEnabled()
        await expect(enabled()).not.toBeChecked()
        await action('SAVE').click()
        await expect(entry()).toHaveCount(1)
        await expect(entry()).toHaveAttribute('title', /Not enabled/)
        await expect(entry()).toHaveCSS('opacity', '0.5')
        // what was saved is what the form shows when the entry is chosen again
        await entry().click()
        await expect(dialog().getByLabel('Name', { exact: true })).toHaveValue(ENTRY)
        await expect(enabled()).not.toBeChecked()
        await closeManage()
    })

    test('switched off, it is NOT offered in the resource selector', async () => {
        const option = await selectorOption(ENTRY)
        // the list is there (the home at least) and this entry is not in it
        await expect(page.getByRole('listbox').getByRole('option').first()).toBeVisible()
        await expect(option).toHaveCount(0)
        await closeSelector()
    })

    test('switched ON again, it is back in the selector: grey, direct, not answering', async () => {
        await openManage()
        await entry().click()
        await expect(dialog().getByLabel('Name', { exact: true })).toHaveValue(ENTRY)
        await flipEnabled()
        await expect(enabled()).toBeChecked()
        await action('SAVE').click()
        await expect(entry()).not.toHaveAttribute('title', /Not enabled/)
        await expect(entry()).toHaveCSS('opacity', '1')
        await closeManage()

        const option = await selectorOption(ENTRY)
        await expect(option).toHaveCount(1)
        // its url goes nowhere: it cannot be picked, and the reason is written beside it
        await expect(option).toHaveAttribute('aria-disabled', 'true')
        await expect(option).toContainText('direct · not answering')
        await closeSelector()
    })

    test('the home cluster\'s switch cannot be touched', async () => {
        await openManage()
        const items = dialog().getByRole('list').getByRole('button')
        const nameField = dialog().getByLabel('Name', { exact: true })
        const count = await items.count()
        for (let i = 0; i < count; i++) {
            const itemName = (await items.nth(i).locator('p').first().innerText()).trim()
            await items.nth(i).click()
            await expect(nameField).toHaveValue(itemName)
            if (await nameField.isDisabled()) {
                await expect(enabled()).toBeDisabled()
                await expect(enabled()).toBeChecked()
                return
            }
        }
        throw new Error(`no home cluster in the list (${count} item(s))`)
    })
})
