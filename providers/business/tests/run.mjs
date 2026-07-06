// Runner de tests del provider business.
//
// Bundlea cada tests/**/*.test.ts con esbuild (TS→ESM, externalizando express y los paquetes
// kwirth) a tests/.out/ y los ejecuta con el runner nativo `node --test`. Sin dependencias de
// test nuevas: node:test + node:assert/strict.
//
//   npm test            → ejecuta toda la suite
//
// Los tests importan directamente de ../src (no se duplica código). express va external: el
// provider lo usa real para construir su Router en el constructor.

import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'

const TEST_DIR = 'tests'
const OUT_DIR = 'tests/.out'

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
    external: ['express', '@kwirthmagnify/kwirth-common-back', '@kwirthmagnify/kwirth-common'],
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String).filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))

try {
    execFileSync('node', ['--test', ...bundled], { stdio: 'inherit' })
}
catch {
    process.exit(1)
}
