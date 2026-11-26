import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, openMenu, GUIDE_MEDIA, capturePedida } from './helpers'

/*
    Screenshots of the Cluster management guide (docs/<version>/guide/admin/06-cluster-management): the
    Manage clusters dialog with a Login entry being added, and the Sign in dialog. Run by hand:
        CAPTURES=1 npx playwright test tests/capture-clusters.spec.ts

    🔴 The guide is PUBLIC and the development cluster list holds real names: every list entry but the source
    one (inCluster) is blurred, and the forms carry EXAMPLE values. The Sign in dialog needs a saved Login
    entry: it is created pointing at the dev back (the URL shown is swapped for an example one right before
    the shot) and deleted at the end, in a finally.
*/

const MEDIA = GUIDE_MEDIA
const BACK = process.env.KWIRTH_E2E_BACK ?? 'http://localhost:3883'
const ENTRY = 'kwirth-b'
const EXAMPLE_URL = 'https://kwirth-b.example.com/kwirth'

const dialogOf = (page: Page) => page.getByRole('dialog').filter({ hasText: 'Manage clusters' })
const actionOf = (page: Page, name: string) => dialogOf(page).locator('.MuiDialogActions-root').getByRole('button', { name, exact: true })
const entryOf = (page: Page) => dialogOf(page).getByRole('list').getByRole('button').filter({ hasText: ENTRY })

const openManage = async (page: Page) => {
    await dismissOpenDialogs(page)
    await openMenu(page)
    await page.getByRole('menuitem', { name: 'Manage cluster list', exact: true }).click({ force: true })
    await expect(dialogOf(page)).toBeVisible({ timeout: 20000 })
}

const closeManage = async (page: Page) => {
    await actionOf(page, 'CLOSE').click()
    await expect(dialogOf(page)).toBeHidden({ timeout: 10000 })
}

const deleteEntry = async (page: Page) => {
    await entryOf(page).click()
    await expect(dialogOf(page).getByLabel('Name', { exact: true })).toHaveValue(ENTRY)
    await actionOf(page, 'DELETE').click()
    await page.getByRole('dialog', { name: 'Delete Cluster' }).getByRole('button', { name: 'yes', exact: true }).click()
    await expect(entryOf(page)).toHaveCount(0)
}

// every list entry but the source one is blurred: the dev list holds real cluster names and ids
const redactList = (page: Page) => page.evaluate(() => {
    for (const item of Array.from(document.querySelectorAll('[role=dialog] ul [role=button]'))) {
        if (!(item.textContent ?? '').startsWith('inCluster')) (item as HTMLElement).style.filter = 'blur(6px)'
    }
})

test('capture the Cluster management guide (dark, example values only)', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 })
    await page.addInitScript(() => { try { localStorage.setItem('kwirth.mode', 'dark') } catch { /* */ } })
    await login(page)
    await page.addStyleTag({ content: '.MuiSnackbar-root { display: none !important; }' })

    await openManage(page)
    // a leftover of an earlier run that failed half-way is this spec's own entry: it goes
    if (await entryOf(page).count() > 0) await deleteEntry(page)

    try {
        // ── the dialog, with a Login entry being typed (not saved) ──
        if (capturePedida('admin-cluster-list')) {
            await actionOf(page, 'NEW').click()
            await dialogOf(page).getByLabel('Name', { exact: true }).fill(ENTRY)
            await dialogOf(page).getByLabel('URL', { exact: true }).fill(EXAMPLE_URL)
            await dialogOf(page).getByRole('combobox', { name: 'Credentials' }).click()
            await page.getByRole('option', { name: 'Login', exact: true }).click()
            await expect(page.getByRole('listbox')).toHaveCount(0)
            await expect(dialogOf(page).getByTestId('manage-clusters-session')).toHaveText('Signs in on use')
            await redactList(page)
            await page.mouse.move(0, 0)
            await page.waitForTimeout(800)
            await page.screenshot({ path: `${MEDIA}/admin-cluster-list.png` })
            await actionOf(page, 'NEW').click()
        }

        // ── the Sign in dialog: a saved Login entry, chosen in the resource selector ──
        if (capturePedida('cluster-login-dialog')) {
            await actionOf(page, 'NEW').click()
            await dialogOf(page).getByLabel('Name', { exact: true }).fill(ENTRY)
            await dialogOf(page).getByLabel('URL', { exact: true }).fill(BACK)
            await dialogOf(page).getByRole('combobox', { name: 'Credentials' }).click()
            await page.getByRole('option', { name: 'Login', exact: true }).click()
            await actionOf(page, 'SAVE').click()
            await expect(entryOf(page)).toHaveCount(1)
            await closeManage(page)

            await page.getByRole('combobox').first().click()
            await page.getByRole('listbox').getByRole('option').filter({ hasText: ENTRY }).click()
            const signIn = page.getByRole('dialog').filter({ hasText: `Sign in to ${ENTRY}` })
            await expect(signIn).toBeVisible({ timeout: 10000 })
            await signIn.getByLabel('Remote user').fill('operator')
            await signIn.getByLabel('Remote password').fill('example-password')
            // the dev back's address is not the guide's: the caption under the title shows an example one
            await signIn.evaluate((d, url) => {
                for (const el of Array.from(d.querySelectorAll('.MuiTypography-caption'))) {
                    if ((el.textContent ?? '').startsWith('http')) el.textContent = url
                }
            }, EXAMPLE_URL)
            await expect(signIn).toContainText(EXAMPLE_URL)
            await page.mouse.move(0, 0)
            await page.waitForTimeout(600)
            await signIn.screenshot({ path: `${MEDIA}/cluster-login-dialog.png` })
            await signIn.getByRole('button', { name: 'CANCEL', exact: true }).click()
            await expect(signIn).toHaveCount(0)
            await openManage(page)
        }
    }
    finally {
        await dismissOpenDialogs(page)
        await openManage(page)
        if (await entryOf(page).count() > 0) await deleteEntry(page)
        await closeManage(page)
    }
})
