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
    // COVERAGE=1 → no tree-shaking: a function no test imports must stay in the bundle to count as uncovered
    treeShaking: !process.env.COVERAGE,
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String).filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))

// COVERAGE=1 → c8 measures, mapped back to src/ through the inline sourcemaps. Node's own coverage cannot:
// without --enable-source-maps it measures the BUNDLE (tests included), and with it the line figure depends
// on how the module range happens to map — comments uncovered in one file, everything covered in another.
const covArgs = process.env.COVERAGE
    ? ['node_modules/c8/bin/c8.js', '--reporter=text', '--exclude-after-remap', '--exclude=tests/**', '--exclude=**/node_modules/**', `--temp-directory=${OUT_DIR}/c8`, process.execPath]
    : []

try {
    execFileSync(process.execPath, [...covArgs, '--test', ...bundled], { stdio: 'inherit' })
}
catch {
    process.exit(1)
}
