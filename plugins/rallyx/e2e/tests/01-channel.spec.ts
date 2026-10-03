import { test, expect, Page } from '@playwright/test'
import { openRallyx, startChannel, stopChannel, assertFrontCompiles, rallyxFrame } from './helpers'

/*
    E2E of the Rally-X channel.

    ⛔ NO test in this plugin may press SAVE in the high-score panel. Saving triggers the
    configured sender and sends REAL notifications to REAL people. The score contract is
    covered by the harness.

    Shared page per file (serial + beforeAll).
*/

test.describe.configure({ mode: 'serial' })

let page: Page

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await openRallyx(page)
})

test.afterAll(async () => {
    await page?.close()
})

// ── Channel stopped ───────────────────────────────────────────────────────

test('the front compiles (no CRA overlay)', async () => {
    await assertFrontCompiles(page)
})

test('stopped, explains that it must be started', async () => {
    await expect(page.getByText('Rally-X not started')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText(/Start the channel .* to play/i)).toBeVisible()
})

test('stopped, the game iframe is not present', async () => {
    await expect(page.locator('iframe[title="Rally-X"]')).toHaveCount(0)
})

test('stopped, the HUD chip bar is not painted', async () => {
    await expect(page.getByText(/^Score \d+$/)).toHaveCount(0)
    await expect(page.getByText(/^Lives \d+$/)).toHaveCount(0)
    await expect(page.getByText(/^Round \d+$/)).toHaveCount(0)
    await expect(page.getByText(/^Fuel \d+$/)).toHaveCount(0)
    await expect(page.getByText(/^Best \d+$/)).toHaveCount(0)
})

// ── Channel started ───────────────────────────────────────────────────────

test('starting shows the iframe and hides the message', async () => {
    await startChannel(page)
    await expect(page.locator('iframe[title="Rally-X"]')).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('Rally-X not started')).toBeHidden()
})

test('starting shows the full HUD chip bar', async () => {
    await expect(page.getByText(/^Score \d+$/)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/^Lives \d+$/)).toBeVisible()
    await expect(page.getByText(/^Round \d+$/)).toBeVisible()
    await expect(page.getByText(/^Fuel \d+$/)).toBeVisible()
    await expect(page.getByText(/^Best \d+$/)).toBeVisible()
})

test('the game canvas appears inside the iframe', async () => {
    const canvas = rallyxFrame(page).locator('canvas')
    await expect(canvas).toBeVisible({ timeout: 15000 })
})

test('the key help appears below the game', async () => {
    await expect(page.getByText(/Drive/i)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/Smoke/i)).toBeVisible()
})

test('the iframe fits inside the window: no overflow', async () => {
    const box = await page.locator('iframe[title="Rally-X"]').boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(box!.width).toBeLessThanOrEqual(viewport!.width + 1)
    expect(box!.height).toBeLessThanOrEqual(viewport!.height + 1)
})

test('the iframe maintains the 1280:960 (4:3) aspect ratio', async () => {
    const box = await page.locator('iframe[title="Rally-X"]').boundingBox()
    expect(box).not.toBeNull()
    const ratio = box!.width / box!.height
    // 1280/960 = 1.333...
    expect(Math.abs(ratio - (1280 / 960))).toBeLessThan(0.1)
})

// ── Back to stopped ───────────────────────────────────────────────────────

test('stopping the channel returns to the message and removes the iframe', async () => {
    await stopChannel(page)
    await expect(page.getByText('Rally-X not started')).toBeVisible({ timeout: 20000 })
    await expect(page.locator('iframe[title="Rally-X"]')).toHaveCount(0)
    await expect(page.getByText(/^Score \d+$/)).toHaveCount(0)
})

test('the front still compiles at the end of the run', async () => {
    await assertFrontCompiles(page)
})
