// Runner de tests unitarios del back de Kwirth.
//
// Bundlea cada tests/**/*.test.ts con esbuild (TS→ESM, externalizando deps pesadas/nativas)
// a tests/.out/ y los ejecuta con el runner nativo `node --test`. Cero dependencias de test
// nuevas: node:test + node:assert/strict. Mismo patrón que el plugin defender.
//
//   npm test            → ejecuta toda la suite
//
// Los tests importan directamente de ../src (no se duplica código). Las deps de runtime van
// external: si un test las toca, node las usa reales; si no, nunca se cargan.

import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'

const TEST_DIR = 'tests'
const OUT_DIR = 'tests/.out'

if (!existsSync(TEST_DIR)) {
    console.log('No hay carpeta tests/.')
    process.exit(0)
}

// tests espejan src/ (tests/tools/auth, tests/api, ...)
const entries = readdirSync(TEST_DIR, { recursive: true })
    .map(String)
    .filter(f => f.endsWith('.test.ts'))
    .map(f => path.join(TEST_DIR, f))

if (entries.length === 0) {
    console.log('No hay tests (tests/**/*.test.ts).')
    process.exit(0)
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

await esbuild.build({
    entryPoints: entries,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outdir: OUT_DIR,
    outbase: TEST_DIR,
    outExtension: { '.js': '.mjs' },
    // Deps de runtime del back externalizadas: esbuild solo bundlea el TS de src/ y los tests.
    external: [
        '@jfvilas/parse-listing', '@kubernetes/client-node',
        '@kwirthmagnify/kwirth-common', '@kwirthmagnify/kwirth-common-ai', '@kwirthmagnify/kwirth-common-back',
        'body-parser', 'cookie-parser', 'cors', 'dockerode', 'dotenv', 'express', 'express-fileupload',
        'http-proxy-middleware', 'request-ip', 'tar', 'ts-semaphore', 'uuid', 'ws', 'cpu-features'
    ],
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String).filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))

try {
    execFileSync('node', ['--test', ...bundled], { stdio: 'inherit' })
}
catch {
    process.exit(1)   // node --test devuelve ≠0 si algún test falla
}
