import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

/*
    Where the previous container's log is SENT when the core finds one at startup, configured in
    Kwirth settings → Notifications (it was in General until signup S4 gave the senders a tab of their
    own): the sender, and then one of ITS configurations, which is how a sender is chosen everywhere
    else in Kwirth. How many lines are READ stays in General.

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
const LINES_LABEL = 'Lines to send'
const NONE_SENDER = '(none — only the core log)'
const NONE_CONFIG = '(none)'

/** Opens the dialog, waits for it to finish loading (its fields enable when it is done) and goes to Notifications. */
async function openSettings(page: Page) {
    await clickMenuItem(page, 'Kwirth settings')
    await expect(page.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: 30000 })
    await gotoTab(page, 'Notifications')
}

async function gotoTab(page: Page, name: string) {
    await page.getByRole('dialog').getByRole('tab', { name }).click()
}

const READ_LABEL = 'Previous container log lines to keep (on startup)'
// how many are READ lives in General; it is read there and the dialog goes back to Notifications
async function readLinesValue(page: Page): Promise<string> {
    await gotoTab(page, 'General')
    const value = await page.getByLabel(READ_LABEL).inputValue()
    await gotoTab(page, 'Notifications')
    return value
}

async function saveSettings(page: Page) {
    const ok = page.getByRole('button', { name: 'OK' })
    await expect(ok).toBeEnabled()
    await ok.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 })
}

const senderCombo = (page: Page) => page.getByRole('combobox', { name: SENDER_LABEL })

/*
    What a picker shows, as the name of the option to pick back. With nothing chosen MUI renders a
    zero-width space as the slot of the empty value, not the '(none…)' text: read raw, the restore at the
    end looked for an option called '​' and timed out.
*/
const shownOf = async (combo: ReturnType<typeof senderCombo>, none: string): Promise<string> =>
    (await combo.innerText()).replace(/​/g, '').trim() || none
/*
    THIS sender's config. The Notifications tab has two pickers called 'Config' (this one and the signup
    sender's), so it is reached through its own label's id.
*/
const configCombo = (page: Page) => page.locator('.MuiFormControl-root')
    .filter({ has: page.locator('#previous-log-sender-config-label') })
    .getByRole('combobox', { name: CONFIG_LABEL, exact: true })

/** Opens a picker, reads what it offers and closes it again without choosing. */
/*
    Closing a picker's list, for real. The list of senders arrives on its own request after the dialog has
    loaded, and when it lands it re-renders the Select: an Escape or a click caught in that moment can
    leave the list open. So it is retried — but Escape is only pressed while the list IS open: one too
    many closes the whole dialog.
*/
async function closeList(page: Page) {
    const listbox = page.locator('[role="listbox"]')
    await expect(async () => {
        if (await listbox.isVisible()) await page.keyboard.press('Escape')
        await expect(listbox).toBeHidden({ timeout: 2000 })
    }).toPass({ timeout: 20000 })
}

async function optionsOf(page: Page, combo: ReturnType<typeof senderCombo>): Promise<string[]> {
    await combo.click()
    const listbox = page.locator('[role="listbox"]')
    await expect(listbox).toBeVisible()
    const all = await listbox.getByRole('option').allInnerTexts()
    await closeList(page)
    return all
}

// picks an option and checks the picker SHOWS it: a click lost to a re-render is tried again
async function pick(page: Page, combo: ReturnType<typeof senderCombo>, option: string) {
    await expect(async () => {
        if (!await page.locator('[role="listbox"]').isVisible()) await combo.click()
        await page.locator('[role="listbox"]').getByRole('option', { name: option, exact: true }).click({ timeout: 3000 })
        await closeList(page)
        expect(await shownOf(combo, option === NONE_SENDER ? NONE_SENDER : NONE_CONFIG)).toBe(option)
    }).toPass({ timeout: 45000 })
}

/*
    🔴 UN LOGIN PARA EL FICHERO. Habia uno por test y cada uno es un arranque completo de la
    aplicacion. No hay nada que una pagina compartida pueda arrastrar: el fichero es NO destructivo —lo
    que hubiera configurado se lee primero y se restaura al final— y cada test abre los ajustes y los
    cierra.
*/
test.describe.serial('previous log sender', () => {
let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    await dismissOpenDialogs(page)
})

test.afterAll(async () => { await page?.close() })

test('the previous log sender: the config picker only offers the configs of the chosen sender', async () => {
    await openSettings(page)

    const senders = (await optionsOf(page, senderCombo(page))).filter(o => o !== NONE_SENDER)

    /*
        A skip, not a branch: a case that adapts to the environment comes out GREEN having verified
        nothing, and this one would be claiming the pickers work on a Kwirth with no senders.
    */
    test.skip(senders.length === 0, 'no sender with a configuration is installed in this Kwirth')

    const originalSender = await shownOf(senderCombo(page), NONE_SENDER)
    const originalConfig = await shownOf(configCombo(page), NONE_CONFIG)

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

test('the previous log sender: the pair and the line cap survive saving and reopening', async () => {
    await dismissOpenDialogs(page)
    await openSettings(page)

    const senders = (await optionsOf(page, senderCombo(page))).filter(o => o !== NONE_SENDER)
    test.skip(senders.length === 0, 'no sender with a configuration is installed in this Kwirth')

    const originalSender = await shownOf(senderCombo(page), NONE_SENDER)
    const originalConfig = await shownOf(configCombo(page), NONE_CONFIG)
    const originalCap = await page.getByLabel(LINES_LABEL).inputValue()
    const originalRead = await readLinesValue(page)

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
        expect(await readLinesValue(page)).toBe(originalRead)
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
})
