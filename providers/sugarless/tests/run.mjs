// Test runner for the sugarless provider.
//
// Bundles each tests/**/*.test.ts with esbuild (TS→ESM, externalizing express and the kwirth
// packages) to tests/.out/ and runs them with the native `node --test` runner. No new test
// dependencies: node:test + node:assert/strict.
//
//   npm test            → runs the whole suite
//
// Tests import directly from ../src (no code duplication). express is external: the provider
// uses the real one to build its Router in the constructor.

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
    console.log('No tests (tests/**/*.test.ts).')
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
    sourcemap: process.env.COVERAGE ? 'inline' : false,   // COVERAGE=1 -> mapea la cobertura a src/
    external: ['express', '@kwirthmagnify/kwirth-common-back', '@kwirthmagnify/kwirth-common'],
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String).filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))

// Cobertura: es el punto 2 del cierre (CL9). Mide los modulos que el harness CARGA, no todo el
// codigo: los componentes React los cubre el e2e y no entran en esta medida.
const covArgs = process.env.COVERAGE
    ? ['--experimental-test-coverage', '--test-coverage-exclude=**/node_modules/**', '--test-coverage-exclude=**/tests/**']
    : []

try {
    execFileSync('node', ['--test', ...covArgs, ...bundled], { stdio: 'inherit' })
}
catch {
    process.exit(1)
}
