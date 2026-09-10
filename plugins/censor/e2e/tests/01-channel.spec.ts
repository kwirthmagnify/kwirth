import { test, expect } from '@playwright/test'
import { login, openChannelPicker, openCensor } from './helpers'

// Baseline: censor is a cluster channel. On the k8s-mode home it must be offered in the selector
// and, once added + started, render its panel with the Objects/Regex/... tabs. These are the
// invariants later work must not break.
test.describe('Censor — channel baseline', () => {

    test('censor is offered as a cluster channel', async ({ page }) => {
        await login(page)
        const censorOption = await openChannelPicker(page)
        await expect(censorOption).toBeVisible()
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
        // Los dos arranques son distintos: el del channel (este) deja el analisis parado, asi que el
        // boton propio de censor sigue ofreciendo Start (y no Stop)
        await expect(page.getByTestId('censor-analyze-toggle')).toHaveText('Start')
    })
})
