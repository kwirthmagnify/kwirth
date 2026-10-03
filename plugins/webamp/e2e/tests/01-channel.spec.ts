import { test, expect } from '@playwright/test'
import { openWebamp, startChannel, stopChannel, assertFrontCompiles, webampFrame } from './helpers'

test.describe('Webamp channel', () => {
    test('starts and shows the player', async ({ page }) => {
        await openWebamp(page)
        await assertFrontCompiles(page)

        // Before starting, the empty state is visible.
        await expect(page.getByText('Webamp not started')).toBeVisible()

        await startChannel(page)

        // After starting, the Webamp iframe should be present.
        const frame = webampFrame(page)
        // The help panel inside the iframe mentions dragging songs.
        await expect(frame.getByText('Drag here')).toBeVisible({ timeout: 10000 })

        await stopChannel(page)

        // After stopping, the empty state returns.
        await expect(page.getByText('Webamp not started')).toBeVisible()
    })
})
