import { defineConfig } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

// Loads URL/credentials from a LOCAL file (.creds.json, gitignored) so they are neither passed on the
// command line (keeps the command stable/allowlistable) nor committed. Falls back to env/defaults.
try {
    const c = JSON.parse(readFileSync(join(__dirname, '.creds.json'), 'utf-8'))
    // Only assign DEFINED values: `process.env.X = undefined` coerces to the string "undefined",
    // which would defeat the `?? 'inCluster'` fallback in helpers when a key is missing from creds.
    const put = (k: string, v: unknown): void => { if (v !== undefined && v !== null && process.env[k] === undefined) process.env[k] = String(v) }
    put('CENSOR_E2E_URL', c.url)
    put('CENSOR_E2E_USER', c.user)
    put('CENSOR_E2E_PASS', c.pass)
    put('CENSOR_E2E_CLUSTER', c.cluster)
}
catch { /* no file → env/defaults */ }

// ISOLATED e2e for the Censor plugin. Drives the already-running app over HTTP; never imported by the build.
export default defineConfig({
    testDir: './tests',
    timeout: 90_000,
    fullyParallel: false,
    workers: 1,
    retries: 1,   // dev en vivo: el login puede fallar de forma transitoria ("cannot access backend")
    reporter: [['list']],
    use: {
        baseURL: process.env.CENSOR_E2E_URL ?? 'http://localhost:3000',
        headless: true,
        screenshot: 'on',
        trace: 'retain-on-failure',
        ignoreHTTPSErrors: true,
        actionTimeout: 15_000
    }
})
