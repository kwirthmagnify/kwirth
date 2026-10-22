import { test, expect, Page } from '@playwright/test'
import { login, clickMenuItem, dismissOpenDialogs } from './helpers'

/*
    Where a new access request is announced (plan: plans/signup/PLAN.md, S4): Kwirth settings →
    Notifications, a sender and one of ITS configs, next to the previous container log's.

    What a browser can check is the configuration: the config picker follows the chosen sender, and the
    pair survives saving and reopening. The delivery itself is pinned in the back end's harness
    (Signup.test.ts, SignupNotice.test.ts) — firing it from here would mean making a real request, which
    needs a real IdP round trip and would send a real message.

    NON-destructive: what is configured is read first and restored at the end. Choosing a sender in a
    dialog sends nothing.
*/

const SENDER_LABEL = 'Sender for access requests'
const NONE_SENDER = '(none — only the notice on login)'
const NONE_CONFIG = '(none)'

const senderCombo = (page: Page) => page.getByRole('combobox', { name: SENDER_LABEL })
// what a picker shows; with nothing chosen MUI renders a zero-width space, not the '(none…)' text
const shownOf = async (combo: ReturnType<typeof senderCombo>, none: string): Promise<string> =>
    (await combo.innerText()).replace(/​/g, '').trim() || none

// the tab has two pickers called 'Config': this one is reached through its own label's id
const configCombo = (page: Page) => page.locator('.MuiFormControl-root')
    .filter({ has: page.locator('#signup-sender-config-label') })
    .getByRole('combobox', { name: 'Config', exact: true })

async function openSettings(page: Page) {
    await clickMenuItem(page, 'Kwirth settings')
    await expect(page.getByLabel('Cluster metrics read interval (seconds)')).toBeEnabled({ timeout: 30000 })
    await page.getByRole('dialog').getByRole('tab', { name: 'Notifications' }).click()
    await expect(senderCombo(page)).toBeVisible()
}

/*
    Closing a picker's list, for real: the senders arrive on their own request and re-render the Select,
    and an Escape or a click caught in that moment can leave the list open. Retried — but Escape is only
    pressed while the list IS open: one too many closes the whole dialog.
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

async function saveSettings(page: Page) {
    const ok = page.getByRole('button', { name: 'OK' })
    await expect(ok).toBeEnabled()
    await ok.click()
    await page.locator('[role="dialog"]').waitFor({ state: 'hidden', timeout: 5000 })
}

test('signup sender: the config follows the sender, and the pair survives saving and reopening', async ({ page }) => {
    await login(page)
    await dismissOpenDialogs(page)
    await openSettings(page)

    // 🔴 both notices fit the tab: its height is the dialog's, fixed, and the second one used to fall below it
    const scrolls = await page.locator('.MuiDialogContent-root').last().evaluate(el => el.scrollHeight > el.clientHeight + 1)
    expect(scrolls, 'the Notifications tab needs a scrollbar to reach the access requests sender').toBe(false)

    const senders = (await optionsOf(page, senderCombo(page))).filter(o => o !== NONE_SENDER)
    test.skip(senders.length === 0, 'no sender with a configuration is installed in this Kwirth')

    const originalSender = await shownOf(senderCombo(page), NONE_SENDER)
    const originalConfig = await shownOf(configCombo(page), NONE_CONFIG)

    try {
        await pick(page, senderCombo(page), NONE_SENDER)
        await expect(configCombo(page)).toBeDisabled()

        await pick(page, senderCombo(page), senders[0])
        await expect(configCombo(page)).toBeEnabled()
        const configs = (await optionsOf(page, configCombo(page))).filter(o => o !== NONE_CONFIG)
        expect(configs.length).toBeGreaterThan(0)
        await pick(page, configCombo(page), configs[0])
        await saveSettings(page)

        // reopened, it is read from the back end again: real persistence, not local state
        await openSettings(page)
        await expect(senderCombo(page)).toHaveText(senders[0])
        await expect(configCombo(page)).toHaveText(configs[0])

        // changing the sender clears the config: a pair that does not exist delivers nowhere
        await pick(page, senderCombo(page), NONE_SENDER)
        await expect(configCombo(page)).toHaveText(NONE_CONFIG)
    }
    finally {
        await dismissOpenDialogs(page)
        await openSettings(page)
        await pick(page, senderCombo(page), originalSender)
        if (originalSender !== NONE_SENDER) await pick(page, configCombo(page), originalConfig)
        await saveSettings(page)
    }
})
