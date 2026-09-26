import { defineConfig } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

try {
    const c = JSON.parse(readFileSync(join(__dirname, '.creds.json'), 'utf-8'))
    process.env.KWIRTH_E2E_URL  ??= c.url
    process.env.KWIRTH_E2E_USER ??= c.user
    process.env.KWIRTH_E2E_PASS ??= c.pass
}
catch { /* sin fichero → env/defaults */ }

export default defineConfig({
    testDir: './tests',
    // 'tests/private' are the e2e of the PAID plugins (iter, our own providers...). They have their own
    // cycle and their own closing checklist, and some of them write data or regenerate screenshots of
    // THEIR repo: they must not slip into a core run. To launch them, the path is asked for explicitly:
    //   playwright test tests/private/iter-editing.spec.ts
    // The 'capture-*' ones verify nothing: they OVERWRITE the guide's images in docs/_media. Leaving them
    // in the default run dirties the tree with screenshots nobody has looked at, every single time the
    // tests are launched. They are asked for by hand by setting CAPTURES:
    //   CAPTURES=1 playwright test tests/capture-managers.spec.ts
    //
    // The variable is needed: 'testIgnore' applies even when the file is named on the command line, so
    // without this there was NO way at all to launch them without editing this config.
    testIgnore: process.env.CAPTURES
        ? ['**/private/**']
        : ['**/private/**', '**/capture-*.spec.ts'],
    timeout: 180_000,
    retries: 1,
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: process.env.KWIRTH_E2E_URL ?? 'http://localhost:3000',
        headless: true,
        screenshot: 'off',
        trace: 'off',
        video: 'off',
        ignoreHTTPSErrors: true,
        actionTimeout: 15_000
    }
})
