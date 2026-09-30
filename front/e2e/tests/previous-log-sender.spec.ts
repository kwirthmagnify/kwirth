import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

/*
    Where the previous container's log is SENT when the core finds one at startup, configured in
    Kwirth settings → General: the sender, and then one of ITS configurations, which is how a sender
    is chosen everywhere else in Kwirth.

    What can be checked from here is the CONFIGURATION: that the second picker only offers the configs
    of the sender chosen, that the choice survives being saved and reopened, and that the line cap is
    its own number. The delivery itself cannot be reached from a browser — it only happens when the
    core boots as a pod and finds that its previous container left a log behind, and the dev does not
    run as a pod. That half is covered by the harness and by the manual QA against the cluster.

    NON-destructive: whatever is configured is read first and restored at the end. And nothing here
    makes a sender fire: choosing one in a dialog delivers nothing, the send happens at startup.
*/

const SENDER_LABEL = 'Sender for the previous container log'
const CONFIG_LABEL = 'Config'
const LINES_LABEL = 'Lines to include in that message'
const NONE_SENDER = '(none — only the core log)'
const NONE_CONFIG = '(none)'

/** Opens the dialog and waits for it to finish loading (its fields enable when it is done). */
async function openSettings(page: Page) {
    await clickMenuItem(page, 'Kwirth settings')
    await expect(page.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: 10000 })
}

async function saveSettings(page: Page) {
    const ok = page.getByRole('button', { name: 'OK' })
    await expect(ok).toBeEnabled()
    await ok.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 })
}

const senderCombo = (page: Page) => page.getByRole('combobox', { name: SENDER_LABEL })
const configCombo = (page: Page) => page.getByRole('combobox', { name: CONFIG_LABEL, exact: true })

/** Opens a picker, reads what it offers and closes it again without choosing. */
async function optionsOf(page: Page, combo: ReturnType<typeof senderCombo>): Promise<string[]> {
    await combo.click()
    const listbox = page.locator('[role="listbox"]')
    await expect(listbox).toBeVisible()
    const all = await listbox.getByRole('option').allInnerTexts()
    await page.keyboard.press('Escape')
    await expect(listbox).toBeHidden()
    return all
}

async function pick(page: Page, combo: ReturnType<typeof senderCombo>, option: string) {
    await combo.click()
    await page.locator('[role="listbox"]').getByRole('option', { name: option, exact: true }).click()
    await expect(page.locator('[role="listbox"]')).toBeHidden()
}

test('the previous log sender: the config picker only offers the configs of the chosen sender', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await openSettings(page)

    const senders = (await optionsOf(page, senderCombo(page))).filter(o => o !== NONE_SENDER)

    /*
        A skip, not a branch: a case that adapts to the environment comes out GREEN having verified
        nothing, and this one would be claiming the pickers work on a Kwirth with no senders.
    */
    test.skip(senders.length === 0, 'no sender with a configuration is installed in this Kwirth')

    const originalSender = await senderCombo(page).innerText()
    const originalConfig = await configCombo(page).innerText()

    try {
        // with no sender chosen the config picker is dead: a config name means nothing on its own
        await pick(page, senderCombo(page), NONE_SENDER)
        await expect(configCombo(page)).toBeDisabled()

        await pick(page, senderCombo(page), senders[0])
        await expect(configCombo(page)).toBeEnabled()
        const configs = (await optionsOf(page, configCombo(page))).filter(o => o !== NONE_CONFIG)
        expect(configs.length).toBeGreaterThan(0)

        // changing the sender clears the config: keeping it would leave a pair that does not exist
        await pick(page, configCombo(page), configs[0])
        await pick(page, senderCombo(page), NONE_SENDER)
        await expect(configCombo(page)).toHaveText(NONE_CONFIG)
    }
    finally {
        await pick(page, senderCombo(page), originalSender)
        if (originalSender !== NONE_SENDER) await pick(page, configCombo(page), originalConfig)
        await dismissOpenDialogs(page)
    }
})

test('the previous log sender: the pair and the line cap survive saving and reopening', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await openSettings(page)

    const senders = (await optionsOf(page, senderCombo(page))).filter(o => o !== NONE_SENDER)
    test.skip(senders.length === 0, 'no sender with a configuration is installed in this Kwirth')

    const originalSender = await senderCombo(page).innerText()
    const originalConfig = await configCombo(page).innerText()
    const originalCap = await page.getByLabel(LINES_LABEL).inputValue()
    const originalRead = await page.getByLabel('Previous container log lines to keep (on startup)').inputValue()

    try {
        await pick(page, senderCombo(page), senders[0])
        const configs = (await optionsOf(page, configCombo(page))).filter(o => o !== NONE_CONFIG)
        await pick(page, configCombo(page), configs[0])

        // the cap only enables once the pair is complete: with nobody to send to there is nothing to cap
        const lines = page.getByLabel(LINES_LABEL)
        await expect(lines).toBeEnabled()
        // a value different from the current one, so the assertion cannot pass by accident
        const probe = originalCap === '120' ? '140' : '120'
        await lines.fill(probe)
        await saveSettings(page)

        // reopen: the dialog re-reads from the back end, so this is real persistence and not local state
        await openSettings(page)
        await expect(senderCombo(page)).toHaveText(senders[0])
        await expect(configCombo(page)).toHaveText(configs[0])
        expect(await page.getByLabel(LINES_LABEL).inputValue()).toBe(probe)
        // and the number that governs how many are READ has not moved with it
        expect(await page.getByLabel('Previous container log lines to keep (on startup)').inputValue()).toBe(originalRead)
    }
    finally {
        await dismissOpenDialogs(page)
        await openSettings(page)
        await pick(page, senderCombo(page), originalSender)
        if (originalSender !== NONE_SENDER) {
            await pick(page, configCombo(page), originalConfig)
            await page.getByLabel(LINES_LABEL).fill(originalCap)
        }
        await saveSettings(page)
    }
})
