import { test, expect } from '@playwright/test'
import { login, clickMenuItem } from './helpers'

/*
    The About offers the log the core is writing RIGHT NOW, which is the counterpart of the previous
    container's one: that explains a death, this explains what is happening.

    Two things are pinned down, and the second is the reason this exists:

      · the core answers the contract the dialog consumes — lines, or a written reason why there are none.
        Outside Kubernetes there is no pod to read, and that is an answer, not a failure.
      · the ANSI escapes do NOT reach the screen as text. The core colours its log, and the dialog
        interprets those codes instead of stripping them; a parser that falls through leaves '\x1b[36m'
        printed in the middle of every line, which looks like corrupted output rather than a bug in a
        viewer.

    ⚠️ Non-destructive: it only reads. It restarts nothing and touches no configuration.
*/

test.describe.configure({ mode: 'serial' })

interface ICoreLogBody {
    lines: string[]
    unavailableReason?: string
}

const openAbout = async (page: import('@playwright/test').Page) => {
    await login(page)
    await clickMenuItem(page, 'About Kwirth...')
    const dialog = page.locator('[role="dialog"]').filter({ hasText: 'About Kwirth' })
    await expect(dialog).toBeVisible()
    return dialog
}

test('the core answers the core-log contract', async ({ page }) => {
    const dialog = await openAbout(page)

    /*
        The request goes out when the BUTTON is pressed, not when the About opens: unlike the previous
        container's log —which the core has held in memory since it started— this one is a live read, so
        nobody opening the About to look at the version pays for it.
    */
    const responsePromise = page.waitForResponse(r => r.url().includes('/managekwirth/log'), { timeout: 15000 })
    await dialog.getByRole('button', { name: 'Core log' }).click()

    const response = await responsePromise
    expect(response.status(), 'the e2e user is an admin: it cannot get a 403').toBe(200)

    const body = await response.json() as ICoreLogBody
    expect(Array.isArray(body.lines)).toBeTruthy()
    // with no lines there has to be a reason written down: an empty viewer with the cause only in the
    // browser's console is what makes somebody believe Kwirth keeps no log
    if (body.lines.length === 0) expect(typeof body.unavailableReason).toBe('string')
})

test('the viewer paints the log and does not leak the ANSI escapes', async ({ page }) => {
    const dialog = await openAbout(page)

    const responsePromise = page.waitForResponse(r => r.url().includes('/managekwirth/log'), { timeout: 15000 })
    await dialog.getByRole('button', { name: 'Core log' }).click()
    const body = await (await responsePromise).json() as ICoreLogBody

    const viewer = page.locator('[role="dialog"]').filter({ hasText: 'Log of the core' })
    await expect(viewer).toBeVisible()

    /*
        🔴 SKIPPED, not passed, when there is nothing to paint.

        A development kwirth runs from the source against the cluster, NOT as a pod, so the core answers
        with a reason and there is not a single coloured line to look at. Written as an if/else this case
        went down the empty branch and the run still came out green — which says the viewer was verified
        when the only assertion worth having never ran. A skip says so out loud.
    */
    if (body.lines.length === 0) await expect(viewer).toContainText(body.unavailableReason!)
    test.skip(body.lines.length === 0, 'this kwirth does not run as a pod: there is no log to paint')

    await expect(viewer).toContainText(`Last ${body.lines.length} lines`)
    /*
        The escape character must not survive to the DOM. It is looked for by its code point and not by
        the '[36m' that follows it: the digits are ordinary text that may legitimately appear in a log
        line, while \x1b never is.
    */
    const painted = await viewer.locator('pre').innerText()
    expect(painted.includes('\x1b'), 'the ANSI escapes are reaching the screen as text').toBeFalsy()

    await viewer.getByRole('button', { name: 'Close' }).click()
    await expect(viewer).toBeHidden()
    await dialog.getByRole('button', { name: 'OK' }).click()
    await expect(dialog).toBeHidden()
})
