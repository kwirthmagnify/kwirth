import { defineConfig } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

// Loads URL and credentials from a LOCAL file (.creds.json, gitignored) so they need not be passed on
// the command line (which keeps the playwright command a fixed string) nor committed. No file, defaults.
try {
    const c = JSON.parse(readFileSync(join(__dirname, '.creds.json'), 'utf-8'))
    const put = (k: string, v: unknown): void => { if (v !== undefined && v !== null && process.env[k] === undefined) process.env[k] = String(v) }
    put('STATUS_E2E_URL', c.url)
    put('STATUS_E2E_USER', c.user)
    put('STATUS_E2E_PASS', c.pass)
    put('STATUS_E2E_CLUSTER', c.cluster)
}
catch { /* no file → env/defaults */ }

// ISOLATED e2e for the Kwirth Status plugin. It hits the already running app over HTTP; the build never imports it.
export default defineConfig({
    testDir: './tests',
    /*
        The captures spec stays OUT of the default run: it writes into docs/<version>/_media, that is,
        into the published documentation. Running the whole suite rewrote the guide's images without
        anybody asking. It is requested by hand:
            ./node_modules/.bin/playwright test zz-capture.spec.ts --grep-invert "^$"
        or directly with an empty --testIgnore; the usual thing is to launch it by name with the config
        below temporarily disabled. See the spec's own header.
    */
    testIgnore: process.env.STATUS_E2E_CAPTURE ? [] : ['**/zz-capture*.spec.ts'],
    timeout: 180_000,   // the front end's dev server recompiles; the login alone can take ~1 min
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: process.env.STATUS_E2E_URL ?? 'http://localhost:3000',
        headless: true,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        ignoreHTTPSErrors: true,
        actionTimeout: 15_000
    }
})
