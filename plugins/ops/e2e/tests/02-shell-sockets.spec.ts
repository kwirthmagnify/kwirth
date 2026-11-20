import { test, expect, Page, WebSocket } from '@playwright/test'
import { CHANNEL, CLUSTER, login } from './helpers'

/*
    A shell's socket (the second WebSocket, opened with '?challenge=') is closed when the shell is closed AND
    when the Ops tab is removed. Before 0.2.28 neither closed it: the exec stayed open on the back until the page
    was reloaded (seen through an extension whose panel lists the live sessions).

    ⛔ NON-DESTRUCTIVE: it opens a shell on local-path-provisioner (it has /bin/sh) and closes it, typing nothing.
*/

test.describe.configure({ mode: 'serial' })
test.use({ trace: 'off', screenshot: 'off', video: 'off' })

const NAMESPACE = 'kube-system'
const POD = 'local-path-provisioner'
let page: Page

const addOpsTab = async (): Promise<void> => {
    await page.getByRole('combobox').first().click()
    await page.getByRole('option', { name: CLUSTER }).click()
    await page.waitForTimeout(800)
    await page.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: 'namespace', exact: true }).click()
    await page.waitForTimeout(800)
    await page.getByRole('combobox').nth(2).click()
    await page.getByRole('option', { name: NAMESPACE, exact: true }).click()
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    const combos = page.getByRole('combobox')
    await combos.nth(await combos.count() - 1).click()
    await page.getByRole('option', { name: CHANNEL, exact: true }).click()
    await page.getByRole('button', { name: 'ADD' }).click()
    await page.waitForTimeout(1500)
    // the Ops tab may need starting: the shared not-started screen, whose Start opens the setup first (accepted with its defaults)
    if (await page.locator('[data-testid="MoreVertIcon"]').count() === 0) {
        const notStarted = page.getByTestId('channel-not-started')
        await expect(notStarted).toContainText('Ops not started')
        await notStarted.getByRole('button', { name: 'Start' }).click()
        const setup = page.getByRole('dialog').filter({ hasText: 'Configure Ops' })
        await expect(setup).toBeVisible()
        await setup.getByRole('button', { name: 'OK', exact: true }).click()
    }
    await expect(podRow()).toBeVisible({ timeout: 30000 })
}

// The pod's row in the list of scoped objects (the one with the restart and terminal buttons)
const podRow = () => page.getByRole('listitem').filter({ hasText: `${NAMESPACE}/${POD}` }).filter({ has: page.locator('[data-testid="RestartAltIcon"]') }).first()

// Opens a shell on the pod and gives back its socket
const openShell = async (): Promise<WebSocket> => {
    const shell = page.waitForEvent('websocket', { predicate: ws => ws.url().includes('?challenge='), timeout: 30000 })
    await podRow().locator('[data-testid="TerminalIcon"]').click()
    const ws = await shell
    expect(ws.isClosed()).toBe(false)
    return ws
}

test.beforeAll(async ({ browser }) => {
    page = await browser.newPage()
    await login(page)
    await addOpsTab()
})

test.afterAll(async () => {
    await page?.goto('about:blank').catch(() => { })
    await page?.context().close().catch(() => { })
})

test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus && page) {
        await testInfo.attach('screenshot', { body: await page.screenshot(), contentType: 'image/png' })
    }
})

test('🔴 closing a shell (its bin in the XTerm list) closes its socket', async () => {
    const ws = await openShell()
    // opening it shows the terminal: HOME goes back to the lists
    await page.getByRole('button', { name: /HOME/ }).click()
    const session = page.getByRole('listitem').filter({ hasText: `${NAMESPACE}/${POD}` }).filter({ has: page.locator('[data-testid="DeleteIcon"]') })
    // listened BEFORE the click: the close can come before a wait set up after it, and then it never ends
    const closed = ws.waitForEvent('close', { timeout: 15000 })
    await session.locator('[data-testid="DeleteIcon"]').click()
    await closed
    expect(ws.isClosed()).toBe(true)
    await expect(page.getByText('You have no open terminals.')).toBeVisible()
})

test('🔴 removing the Ops tab closes the sockets of the shells it had open', async () => {
    const ws = await openShell()
    const tab = page.getByRole('tab', { selected: true }).last()
    await tab.getByRole('button').click()
    await page.getByRole('menuitem', { name: 'Tab', exact: true }).click()
    const closed = ws.waitForEvent('close', { timeout: 15000 })
    await page.getByRole('menuitem', { name: /Remove/ }).click()
    await closed
    expect(ws.isClosed()).toBe(true)
})
