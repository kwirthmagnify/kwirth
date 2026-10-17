// Test runner del plugin fileman.
//
// Empaqueta cada tests/**/*.test.ts con esbuild (TS→ESM, externalizando los paquetes de kwirth) a
// tests/.out/ y los corre con el runner nativo `node --test`.
//
//   npm test              → toda la suite
//   COVERAGE=1 npm test   → con cobertura

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
    sourcemap: process.env.COVERAGE ? 'inline' : false,
    external: ['express', '@kwirthmagnify/kwirth-common-back', '@kwirthmagnify/kwirth-common'],
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String).filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))

const covArgs = process.env.COVERAGE
    ? ['--experimental-test-coverage', '--test-coverage-exclude=**/node_modules/**', '--test-coverage-exclude=**/tests/**']
    : []

try {
    execFileSync('node', ['--test', ...covArgs, ...bundled], { stdio: 'inherit' })
}
catch {
    process.exit(1)
}
