import { Locator, Page, Route } from '@playwright/test'
import { test, expect } from './fixtures'
import { CARGA, clickExtensionMenuItem, dismissOpenDialogs } from './helpers'

/*
    The script sender's configuration, and with it the two capabilities of the generic form it is the
    first to use (plans/sender-script, streams A and B):

      · the 'textarea' field — multi-line, monospaced, kept verbatim through a save and a reload
      · the AI assistant (IConfigFieldDef.aiInstructions) — disabled without an LLM, and what it drafts
        lands in the field WITHOUT being saved

    🔴 The LLM endpoints are INTERCEPTED (page.route): the list of LLMs and the drafting call never reach
    the back end, so the dev's real LLM configuration is neither read for the test nor written, and no
    token is spent. The real endpoint is covered by the back end's tests against a fake model.

    The only thing written is ONE configuration of the script sender, created by this file with a unique
    name and deleted by it. Nothing routes messages to it, so nothing runs.
*/

const MANAGER = /Manage senders/i
const CONFIGURE = 'Configure: Script Sender'
const NAME = `e2e-script-${Date.now()}`
const FAKE_LLM = { id: 'e2e-fake-llm', provider: 'fake', model: 'fake-model', temperature: 0, useProviderKey: true, key: '' }

// What is typed and must come back EXACTLY: line breaks, tabs, backslashes, quotes and $.
const TYPED = '#!/bin/sh\n# C:\\temp\\new.txt\n\tprintf \'%s\\n\' "$KWIRTH_BODY"\nexit 0'

test.describe.configure({ mode: 'serial' })

test.describe('script sender: textarea and AI assistant', () => {
    let page: Page
    let created = false

    const cfg = () => page.getByRole('dialog').filter({ hasText: CONFIGURE })
    const scriptField = (): Locator => cfg().getByRole('textbox', { name: 'Script', exact: true })
    const aiButton = (): Locator => cfg().getByRole('button', { name: 'Generate with AI' })
    const assist = () => page.getByRole('dialog').filter({ hasText: 'Generate with AI — Script' })

    const routeLlms = async (list: unknown[]) => {
        await page.unroute('**/core/aiconfig/llms')
        await page.route('**/core/aiconfig/llms', (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(list) }))
    }

    const newConfig = async () => {
        if (await cfg().getByRole('button', { name: 'Cancel' }).count() > 0) await cfg().getByRole('button', { name: 'Cancel' }).click()
        await cfg().getByRole('button', { name: 'New' }).click()
        await expect(scriptField()).toBeVisible()
    }

    test.beforeAll(async ({ kwirth }) => {
        page = kwirth
        await dismissOpenDialogs(page)
        await clickExtensionMenuItem(page, 'Senders')
        const manager = page.getByRole('dialog').filter({ hasText: MANAGER })
        await manager.waitFor({ timeout: CARGA })
        await manager.getByText('Script Sender', { exact: true }).first()
            .locator('xpath=ancestor::*[.//button[@aria-label="Configure"]][1]')
            .locator('button[aria-label="Configure"]').first().click()
        await expect(cfg()).toBeVisible({ timeout: CARGA })
    })

    test.afterAll(async () => {
        await page.unroute('**/core/aiconfig/llms').catch(() => {})
        await page.unroute('**/core/aiconfig/assist').catch(() => {})
        // Only what THIS file created, and only if it did.
        if (created) {
            const row = cfg().getByText(NAME, { exact: true }).locator('xpath=ancestor::*[.//button[@aria-label="Delete"]][1]')
            await row.getByRole('button', { name: 'Delete' }).click().catch(() => {})
            await expect(cfg().getByText(NAME, { exact: true })).toHaveCount(0).catch(() => {})
        }
        await dismissOpenDialogs(page).catch(() => {})
    })

    test('a new config starts from the schema defaults: sh, body as text, variables on, waiting, 30 s', async () => {
        await routeLlms([])
        await newConfig()
        await expect(cfg().getByText('sh', { exact: true }).first()).toBeVisible()
        await expect(cfg().getByText('The message body as text', { exact: true })).toBeVisible()
        await expect(cfg().getByLabel('Timeout (seconds)')).toHaveValue('30')
        for (const label of ['KWIRTH_* environment variables', 'Wait for the script to finish']) {
            const sw = cfg().locator('div', { has: page.getByText(label, { exact: true }) }).locator('input[type="checkbox"]').last()
            await expect(sw, `'${label}' should start on`).toBeChecked()
        }
    })

    test('the script is a multi-line, monospaced field of FIXED height', async () => {
        const field = scriptField()
        await expect(field).toHaveJSProperty('tagName', 'TEXTAREA')
        await expect(field).toHaveCSS('font-family', /monospace/)
        const before = (await field.boundingBox())!.height
        await field.fill(Array.from({ length: 40 }, (_, i) => `echo ${i}`).join('\n'))
        expect((await field.boundingBox())!.height, 'the field grew with its content').toBe(before)
        await field.fill('')
    })

    test('the title sits ABOVE the field with the AI button beside it — not inside the box', async () => {
        const title = cfg().getByText('Script *', { exact: true })
        await expect(title).toBeVisible()
        const t = (await title.boundingBox())!
        const b = (await aiButton().boundingBox())!
        const f = (await scriptField().boundingBox())!
        expect(b.x, 'the button is not beside the title').toBeGreaterThan(t.x + t.width - 1)
        expect(b.y + b.height, 'the button overlaps the field').toBeLessThanOrEqual(f.y)
        expect(t.y + t.height, 'the title is not above the field').toBeLessThanOrEqual(f.y)
    })

    test('without an LLM configured, the AI button is there and DISABLED, saying why', async () => {
        await expect(aiButton()).toBeVisible()
        await expect(aiButton()).toBeDisabled()
        await aiButton().locator('xpath=..').hover()
        await expect(page.getByRole('tooltip').filter({ hasText: 'No LLM is configured in Kwirth' })).toBeVisible()
    })

    test('with an LLM, the AI drafts the script into the field — unsaved — and gets the form, not secrets', async () => {
        await routeLlms([FAKE_LLM])
        await newConfig()
        let sent: Record<string, unknown> | undefined
        const drafted = '#!/bin/sh\nwget -q -O- --post-data="$(cat)" https://hooks.example/alarm'
        await page.route('**/core/aiconfig/assist', async (route: Route) => {
            sent = route.request().postDataJSON() as Record<string, unknown>
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: drafted }) })
        })

        await expect(aiButton()).toBeEnabled()
        await aiButton().click()
        await expect(assist()).toBeVisible()
        await expect(assist().getByRole('button', { name: 'Generate' })).toBeDisabled()
        await assist().getByLabel('Describe what you want').fill('POST the alarm text to https://hooks.example/alarm')
        await assist().getByRole('button', { name: 'Generate' }).click()

        await expect(assist()).toBeHidden()
        await expect(scriptField()).toHaveValue(drafted)

        expect(sent?.llmId).toBe('e2e-fake-llm')
        expect(sent?.fieldName).toBe('script')
        expect(String(sent?.aiInstructions)).toContain('KWIRTH_BODY')
        expect(sent?.request).toBe('POST the alarm text to https://hooks.example/alarm')
        const fields = sent?.fields as { name: string, type?: string, value: unknown }[]
        expect(fields.find(f => f.name === 'interpreter')?.value).toBe('sh')
        expect(fields.some(f => f.type === 'password')).toBe(false)

        // Not saved: the configuration list still has no such entry, and Cancel throws it away.
        await cfg().getByRole('button', { name: 'Cancel' }).click()
        await expect(cfg().getByText('Select a config to edit or click New.')).toBeVisible()
        await page.unroute('**/core/aiconfig/assist')
    })

    test('an LLM over its usage limit says exactly that, and the field is left untouched', async () => {
        await newConfig()
        await scriptField().fill('echo keep-me')
        await page.route('**/core/aiconfig/assist', (route: Route) =>
            route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'daily cost ceiling reached' }) }))
        await aiButton().click()
        await assist().getByLabel('Describe what you want').fill('anything')
        await assist().getByRole('button', { name: 'Generate' }).click()
        await expect(assist().getByText(/usage limit of this LLM has been reached: daily cost ceiling reached/)).toBeInViewport()
        // Something typed: Cancel asks before throwing the description away.
        await assist().getByRole('button', { name: 'Cancel' }).click()
        await expect(assist().getByText('Discard your description?')).toBeVisible()
        await assist().getByRole('button', { name: 'Keep editing' }).click()
        await expect(assist().getByLabel('Describe what you want')).toHaveValue('anything')
        await assist().getByRole('button', { name: 'Cancel' }).click()
        await assist().getByRole('button', { name: 'Discard' }).click()
        await expect(assist()).toBeHidden()
        await expect(scriptField()).toHaveValue('echo keep-me')
        await page.unroute('**/core/aiconfig/assist')
        await cfg().getByRole('button', { name: 'Cancel' }).click()
    })

    test('🔴 what is typed is saved and comes back EXACTLY — breaks, tabs, backslashes, quotes, $', async () => {
        await newConfig()
        await cfg().getByLabel('Name *', { exact: true }).fill(NAME)
        await scriptField().fill(TYPED)
        await cfg().getByRole('button', { name: 'Add' }).click()
        created = true
        await expect(cfg().getByText(NAME, { exact: true })).toBeVisible({ timeout: CARGA })
        // Saving closes the edit: the new config is in the list, NOT selected, with no Update/Cancel pending.
        await expect(cfg().getByText('Select a config to edit or click New.')).toBeVisible()
        await expect(cfg().getByRole('button', { name: 'Update' })).toHaveCount(0)

        // Reopen it from the list: the value now comes from the back end, not from the form's memory.
        await cfg().getByText(NAME, { exact: true }).click()
        await expect(cfg().getByText(`Editing: ${NAME}`)).toBeVisible()
        await expect(scriptField()).toHaveValue(TYPED)
        await cfg().getByRole('button', { name: 'Cancel' }).click()
    })
})
