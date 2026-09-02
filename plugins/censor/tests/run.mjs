// Unit test runner for censor (patrón montag/Agora).
// Bundlea tests/**/*.test.ts con esbuild -> tests/.out (ESM node20) y ejecuta con `node --test`.
// Los tests importan directamente de ../src (código real, no el dist).
import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'

const TEST_DIR = 'tests'
const OUT_DIR = 'tests/.out'

// 1) Descubre todos los tests/**/*.test.ts
const entries = readdirSync(TEST_DIR, { recursive: true })
    .map(String)
    .filter(f => f.endsWith('.test.ts'))
    .map(f => path.join(TEST_DIR, f))

if (entries.length === 0) { console.log('No tests (tests/**/*.test.ts).'); process.exit(0) }

// 2) Limpia y recrea tests/.out
rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

// 3) Bundle TS -> ESM node20. Se externalizan los paquetes @kwirthmagnify/* (se resuelven en
//    runtime desde node_modules; censor no usa knex/pg).
await esbuild.build({
    entryPoints: entries,
    bundle: true, format: 'esm', platform: 'node', target: 'node20',
    outdir: OUT_DIR, outbase: TEST_DIR, outExtension: { '.js': '.mjs' },
    external: [
        'express',
        '@kwirthmagnify/kwirth-common',
        '@kwirthmagnify/kwirth-common-back',
        '@kwirthmagnify/kwirth-common-ai',
        '@kwirthmagnify/kwirth-common-ai/back',
        '@kwirthmagnify/kwirth-common-front'
    ],
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
})

// 4) Ejecuta los bundles con el runner nativo (cada fichero en su propio proceso)
const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))
try { execFileSync('node', ['--test', ...bundled], { stdio: 'inherit' }) }
catch { process.exit(1) }
