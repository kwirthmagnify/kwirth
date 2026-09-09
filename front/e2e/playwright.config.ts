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
    // 'tests/private' son los e2e de los plugins de PAGO (iter, providers propios...). Tienen su propio
    // ciclo y su propio cierre, y algunos escriben datos o regeneran capturas de SU repo: no deben
    // colarse en una corrida del core. Para lanzarlos, se pide la ruta explicitamente:
    //   playwright test tests/private/iter-editing.spec.ts
    // Los 'capture-*' no verifican nada: SOBRESCRIBEN las imagenes de la guia en docs/_media. Dejarlos en
    // la corrida por defecto ensucia el arbol con capturas que nadie ha mirado, cada vez que se lanzan los
    // tests. Se piden a mano poniendo CAPTURES:
    //   CAPTURES=1 playwright test tests/capture-managers.spec.ts
    //
    // Hace falta la variable: 'testIgnore' se aplica tambien cuando se nombra el fichero en la linea de
    // comandos, asi que sin esto no habia NINGUNA forma de lanzarlas sin editar esta config.
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
