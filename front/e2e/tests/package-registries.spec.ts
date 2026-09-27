import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

// Where packages are DOWNLOADED from is not where the manifest lives. The public marketplace already
// proves it: manifests on GitHub, tarballs on npmjs. That is why package registries are a separate list,
// and the credential is chosen by matching the tarball's URL against the registry's prefix.
//
// This covers what the harness cannot: that the tab exists, that what was saved survives a reopen — that
// is, it really travelled to the back end and did not stay in the form — and that the secret comes back
// pre-filled.
//
// NON-destructive: what is there is counted, a registry with its own made-up prefix is added, and it is
// deleted at the end whatever happens. The user's real registry is never touched.

const STAMP = Date.now()
const LABEL = `e2e-registry-${STAMP}`
const URL_PREFIX = `https://e2e-${STAMP}.invalid/repository/e2e`
const URL_INPUT = 'input[placeholder="https://…/repository/my-repo"]'

// A registry's whole row: the INNERMOST box holding both its URL and the credentials checkbox. Looking
// for 'the first ancestor with a button' does not work — it stops at the upper row, which already
// carries the delete button, and leaves the second half out.
const rowOf = (page: Page, url: string) => page.locator('div.MuiBox-root')
    .filter({ has: page.locator(`input[value="${url}"]`) })
    .filter({ hasText: 'Needs credentials' })
    .last()

const openRegistriesTab = async (page: Page) => {
    await clickMenuItem(page, 'Kwirth settings')
    await expect(page.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: 10000 })
    await page.getByRole('tab', { name: 'Package registries' }).click()
    await expect(page.getByRole('button', { name: 'Add registry' })).toBeVisible()
}

const save = async (page: Page) => {
    const ok = page.getByRole('button', { name: 'OK' })
    await expect(ok).toBeEnabled()
    await ok.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 })
}

// Deletes ANY e2e registry, not just this run's. If an earlier failure left one half-made, the user's
// environment stays dirty and the next run miscounts the starting point. A non-destructive test has to
// clean up after its own broken version too.
const removeE2eRegistries = async (page: Page) => {
    await dismissOpenDialogs(page)
    await openRegistriesTab(page)
    const leftovers = page.locator('input[value^="https://e2e-"]')
    let removed = 0
    while (await leftovers.count() > 0 && removed < 10) {
        const url = await leftovers.first().inputValue()
        // the bin is the FIRST button on the row; the LAST is the eye that reveals the secret
        await rowOf(page, url).locator('button').first().click()
        removed++
    }
    if (removed > 0) await save(page)
    else await dismissOpenDialogs(page)
}

test('package registries: se anade, persiste con su secreto y se borra', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)

    await removeE2eRegistries(page)
    await openRegistriesTab(page)
    const before = await page.locator(URL_INPUT).count()

    try {
        await page.getByRole('button', { name: 'Add registry' }).click()
        const urls = page.locator(URL_INPUT)
        await expect(urls).toHaveCount(before + 1)
        await urls.last().fill(URL_PREFIX)

        const newRow = rowOf(page, URL_PREFIX)
        await newRow.getByLabel('Name').fill(LABEL)
        await newRow.getByLabel('Needs credentials').check()

        // Token (Bearer) by default: a Nexus with user tokens accepts the token as Bearer and rejects
        // that SAME credential as Basic, so the default type matters.
        await expect(newRow.getByLabel('Token')).toBeVisible()
        await expect(newRow.getByLabel('User')).toBeDisabled()   // el usuario no pinta nada en Bearer
        await newRow.getByLabel('Token').fill('e2e-token-value')
        await save(page)

        // reopening re-reads from the back end: it checks real persistence, not form state
        await openRegistriesTab(page)
        await expect(page.locator(`input[value="${URL_PREFIX}"]`)).toHaveCount(1)
        expect(await rowOf(page, URL_PREFIX).getByLabel('Token').inputValue()).toBe('e2e-token-value')

        // the schema is decided by the TYPE and not by the look of the secret: switching to Basic brings up a user
        await rowOf(page, URL_PREFIX).getByRole('combobox').click()
        await page.getByRole('option', { name: 'User and password (Basic)' }).click()
        const basic = rowOf(page, URL_PREFIX)
        await expect(basic.getByLabel('User')).toBeEnabled()
        await basic.getByLabel('User').fill('e2e-user')
        await basic.getByLabel('Password').fill('e2e-pass')
        await save(page)

        await openRegistriesTab(page)
        const reread = rowOf(page, URL_PREFIX)
        expect(await reread.getByLabel('User').inputValue()).toBe('e2e-user')
        expect(await reread.getByLabel('Password').inputValue()).toBe('e2e-pass')
        await dismissOpenDialogs(page)
    }
    finally {
        await removeE2eRegistries(page)
    }

    // the environment is left as it was: not one registry more
    await openRegistriesTab(page)
    expect(await page.locator(URL_INPUT).count()).toBe(before)
    await dismissOpenDialogs(page)
    await page.goto('about:blank')
})
