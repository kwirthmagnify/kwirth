import { test, expect } from '@playwright/test'
import { login, openChannelPicker, openCensor } from './helpers'

const TEXT_LINES_PATH = 'M9.1 5h5.8'
const X_PATH = 'M5 4l14 16M19 4L5 20'

// Baseline: censor is a cluster channel. On the k8s-mode home it must be offered in the selector
// and, once added + started, render its panel with the Objects/Regex/... tabs. These are the
// invariants later work must not break.
test.describe('Censor — channel baseline', () => {

    test('censor is offered as a cluster channel, with its own icon: text struck out by an X', async ({ page }) => {
        await login(page)
        const censorOption = await openChannelPicker(page)
        await expect(censorOption).toBeVisible()
        // src/front/icons.tsx: the cut text lines, and the X drawn on top of them
        await expect(censorOption.locator(`svg:has(path[d^="${TEXT_LINES_PATH}"]) path[d="${X_PATH}"]`)).toBeVisible()
    })

    test('starting the channel shows the panel and its tabs', async ({ page }) => {
        await openCensor(page)
        await expect(page.getByTestId('censor-panel')).toBeVisible()
        await expect(page.getByTestId('censor-menu')).toBeVisible()
        await expect(page.getByRole('tab', { name: /Objects/ })).toBeVisible()
        await expect(page.getByRole('tab', { name: /Regex/ })).toBeVisible()
    })

    test('starting the channel does NOT start the analysis by itself', async ({ page }) => {
        await openCensor(page)
        // The two starts are different: the channel's one (this) leaves the analysis stopped, so
        // censor's own button keeps offering Start (and not Stop)
        await expect(page.getByTestId('censor-analyze-toggle')).toHaveText('Start')
    })
})
