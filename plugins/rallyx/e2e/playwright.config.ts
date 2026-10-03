import { defineConfig } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

// Load URL/credentials from a LOCAL file (.creds.json, gitignored) to avoid passing them on the
// command line or committing them. If the file does not exist, fall back to env/defaults.
try {
    const c = JSON.parse(readFileSync(join(__dirname, '.creds.json'), 'utf-8'))
    const put = (k: string, v: unknown): void => { if (v !== undefined && v !== null && process.env[k] === undefined) process.env[k] = String(v) }
    put('RALLYX_E2E_URL', c.url)
    put('RALLYX_E2E_USER', c.user)
    put('RALLYX_E2E_PASS', c.pass)
    put('RALLYX_E2E_CLUSTER', c.cluster)
}
catch { /* no file → env/defaults */ }

export default defineConfig({
    testDir: './tests',
    timeout: 180_000,
    fullyParallel: false,
    workers: 1,
    retries: 1,
    reporter: [['list']],
    use: {
        baseURL: process.env.RALLYX_E2E_URL ?? 'http://localhost:3000',
        headless: true,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        ignoreHTTPSErrors: true,
        actionTimeout: 15_000,
        viewport: { width: 1280, height: 900 }
    }
})
