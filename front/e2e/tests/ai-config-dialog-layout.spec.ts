// The two AI config dialogs ('AI providers' and 'AI models') must FIT: no vertical scrollbar on the
// dialog body, and the button that applies the form to the list ('Add' / 'Update') visible without
// scrolling.
//
// Why: the dialogs used to be pinned at a fixed height while the form kept growing (usage limits grew
// three prose blocks and a row per period). On a laptop screen the Add/Update button ended up below the
// fold, so the form looked like it did not persist — the user filled it in, pressed OK, and the edit had
// never reached the list because Update was never pressed.
//
// NON-DESTRUCTIVE: it only opens dialogs, selects entries, and cancels. Nothing is ever saved.
import { test, expect, Page } from '@playwright/test'
import { login, dismissOpenDialogs, openMenu } from './helpers'

test.describe.configure({ mode: 'serial' })

test.describe('AI config: los dialogos caben sin scroller', () => {
    let page: Page

    test.beforeAll(async ({ browser }) => {
        page = await browser.newPage()
        // A short viewport is the whole point: on a tall screen anything fits.
        await page.setViewportSize({ width: 1280, height: 720 })
        await login(page)
        await dismissOpenDialogs(page)
    })

    test.afterAll(async () => { await page?.close() })

    // 'AI Providers' and 'AI Models' live inside the COLLAPSIBLE 'AI Config' group of the drawer: it has
    // to be expanded before they can be clicked.
    const openAiConfig = async (item: RegExp) => {
        await dismissOpenDialogs(page)
        await openMenu(page)
        await page.getByRole('menuitem', { name: /AI Config/i }).click()
        await page.waitForTimeout(400)
        await page.getByRole('menuitem', { name: item }).click()
        await page.waitForTimeout(1500)
        return page.getByRole('dialog')
    }

    const closeDialog = async (dlg: ReturnType<Page['getByRole']>) => {
        await dlg.getByRole('button', { name: /^cancel$/i }).click()
        await page.waitForTimeout(400)
    }

    // The body of a MUI dialog is the element that scrolls. 2px of slack absorbs sub-pixel rounding.
    const bodyOverflow = async (dlg: ReturnType<Page['getByRole']>): Promise<number> =>
        dlg.locator('.MuiDialogContent-root').first().evaluate(el => el.scrollHeight - el.clientHeight)

    const assertFits = async (dlg: ReturnType<Page['getByRole']>, what: string) => {
        const overflow = await bodyOverflow(dlg)
        expect(overflow, `'${what}': el cuerpo del dialogo desborda ${overflow}px, sale scroller`).toBeLessThanOrEqual(2)
    }

    const assertApplyButtonVisible = async (dlg: ReturnType<Page['getByRole']>, what: string) => {
        const button = dlg.getByRole('button', { name: /^(Add|Update)$/ }).last()
        await expect(button, `'${what}': el boton Add/Update no esta visible`).toBeVisible()
        const box = await button.boundingBox()
        expect(box, `'${what}': el boton Add/Update no tiene caja`).not.toBeNull()
        const viewport = page.viewportSize()!
        expect(box!.y + box!.height, `'${what}': el boton Add/Update cae fuera de la pantalla`).toBeLessThanOrEqual(viewport.height)
    }

    test('el dialogo de providers cabe recien abierto', async () => {
        const dlg = await openAiConfig(/^AI Providers$/)
        await expect(dlg.getByText('AI — Provider config')).toBeVisible()
        await assertFits(dlg, 'AI providers / vacio')
        await assertApplyButtonVisible(dlg, 'AI providers / vacio')
        await closeDialog(dlg)
    })

    test('el dialogo de providers cabe con un provider seleccionado (limites desplegados)', async () => {
        const dlg = await openAiConfig(/^AI Providers$/)
        const entries = dlg.locator('.MuiListItemButton-root')
        const count = await entries.count()
        test.skip(count === 0, 'no hay providers configurados en este entorno')
        // The selected provider is the worst case: the usage limits editor only renders its rows once
        // there is a provider name.
        for (let i = 0; i < count; i++) {
            await entries.nth(i).click()
            await page.waitForTimeout(300)
            const name = (await entries.nth(i).innerText()).split('\n')[0]
            await assertFits(dlg, `AI providers / ${name}`)
            await assertApplyButtonVisible(dlg, `AI providers / ${name}`)
        }
        await closeDialog(dlg)
    })

    test('el dialogo de LLMs cabe recien abierto', async () => {
        const dlg = await openAiConfig(/^AI Models$/)
        await expect(dlg.getByText('AI — LLM config')).toBeVisible()
        await assertFits(dlg, 'AI models / vacio')
        await assertApplyButtonVisible(dlg, 'AI models / vacio')
        await closeDialog(dlg)
    })

    test('el dialogo de LLMs cabe con un modelo seleccionado', async () => {
        const dlg = await openAiConfig(/^AI Models$/)
        const entries = dlg.locator('.MuiListItemButton-root')
        const count = await entries.count()
        test.skip(count === 0, 'no hay LLMs configurados en este entorno')
        for (let i = 0; i < count; i++) {
            await entries.nth(i).click()
            await page.waitForTimeout(300)
            const id = (await entries.nth(i).innerText()).split('\n')[0]
            await assertFits(dlg, `AI models / ${id}`)
            await assertApplyButtonVisible(dlg, `AI models / ${id}`)
            // WORST CASE: an LLM that borrows the provider key only shows a two-line note where the
            // limits go. Unchecking it renders the FULL editor — four units × two windows — which is the
            // block that used to push Add/Update out of sight. Nothing is saved: the dialog is cancelled.
            const ownKey = dlg.locator('input[type="checkbox"]').first()
            if (await ownKey.isChecked()) {
                await ownKey.uncheck()
                await page.waitForTimeout(300)
                await assertFits(dlg, `AI models / ${id} (key propia)`)
                await assertApplyButtonVisible(dlg, `AI models / ${id} (key propia)`)
                await ownKey.check()
                await page.waitForTimeout(200)
            }
        }
        await closeDialog(dlg)
    })
})
