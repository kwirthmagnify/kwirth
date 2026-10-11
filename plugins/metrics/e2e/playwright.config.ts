import { defineConfig } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

// Loads URL and credentials from a LOCAL file (.creds.json, gitignored) so they need not be passed on
// the command line (which keeps the playwright command a fixed string) nor committed. No file, defaults.
try {
    const c = JSON.parse(readFileSync(join(__dirname, '.creds.json'), 'utf-8'))
    const put = (k: string, v: unknown): void => { if (v !== undefined && v !== null && process.env[k] === undefined) process.env[k] = String(v) }
    put('METRICS_E2E_URL', c.url)
    put('METRICS_E2E_USER', c.user)
    put('METRICS_E2E_PASS', c.pass)
    put('METRICS_E2E_CLUSTER', c.cluster)
}
catch { /* no file → env/defaults */ }

// ISOLATED e2e for the Metrics plugin. It hits the already running app over HTTP; the build never imports it.
export default defineConfig({
    testDir: './tests',
    timeout: 180_000,   // the front's dev server recompiles; the login alone can take ~1 min
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: process.env.METRICS_E2E_URL ?? 'http://localhost:3000',
        headless: true,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        ignoreHTTPSErrors: true,
        actionTimeout: 15_000
    }
})
