import { defineConfig } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

// Carga URL/credenciales de un fichero LOCAL (.creds.json, gitignorado) para no pasarlas por línea de
// comandos (así el comando de playwright es un string fijo) ni commitearlas. Sin fichero, defaults.
try {
    const c = JSON.parse(readFileSync(join(__dirname, '.creds.json'), 'utf-8'))
    const put = (k: string, v: unknown): void => { if (v !== undefined && v !== null && process.env[k] === undefined) process.env[k] = String(v) }
    put('PROVIDER_DEBUG_E2E_URL', c.url)
    put('PROVIDER_DEBUG_E2E_USER', c.user)
    put('PROVIDER_DEBUG_E2E_PASS', c.pass)
    put('PROVIDER_DEBUG_E2E_CLUSTER', c.cluster)
}
catch { /* no file → env/defaults */ }

// e2e AISLADO del plugin Provider Debug. Ataca la app ya levantada por HTTP; el build nunca lo importa.
export default defineConfig({
    testDir: './tests',
    timeout: 180_000,   // el dev server del front recompila; el login solo ya puede tardar ~1 min
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: process.env.PROVIDER_DEBUG_E2E_URL ?? 'http://localhost:3000',
        headless: true,
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
        ignoreHTTPSErrors: true,
        actionTimeout: 15_000
    }
})
