// Unit test runner for censor (patrón montag/Agora).
// It bundles tests/**/*.test.ts with esbuild -> tests/.out (ESM node20) and runs `node --test`.
// The tests import straight from ../src (the real code, not the dist).
import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'

const TEST_DIR = 'tests'
const OUT_DIR = 'tests/.out'

// 1) Discover every tests/**/*.test.ts
const entries = readdirSync(TEST_DIR, { recursive: true })
    .map(String)
    .filter(f => f.endsWith('.test.ts'))
    .map(f => path.join(TEST_DIR, f))

if (entries.length === 0) { console.log('No tests (tests/**/*.test.ts).'); process.exit(0) }

// 2) Limpia y recrea tests/.out
rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

// 3) Bundle TS -> ESM node20. The @kwirthmagnify/* packages are externalised (they are resolved at
//    runtime from node_modules; censor does not use knex/pg).
await esbuild.build({
    entryPoints: entries,
    bundle: true, format: 'esm', platform: 'node', target: 'node20',
    outdir: OUT_DIR, outbase: TEST_DIR, outExtension: { '.js': '.mjs' },
    sourcemap: process.env.COVERAGE ? 'inline' : false,   // COVERAGE=1 → sourcemaps to map coverage back to src/
    external: [
        'express',
        '@kwirthmagnify/kwirth-common',
        '@kwirthmagnify/kwirth-common-back',
        '@kwirthmagnify/kwirth-common-ai',
        '@kwirthmagnify/kwirth-common-ai/back',
        '@kwirthmagnify/kwirth-common-front'
    ],
    // COVERAGE=1 → no tree-shaking: a function no test imports must stay in the bundle to count as uncovered
    treeShaking: !process.env.COVERAGE,
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
})

// 4) Run the bundles with the native runner (each file in its own process)
const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))
// COVERAGE=1 → c8 measures, mapped back to src/ through the inline sourcemaps. Node's own coverage cannot:
// without --enable-source-maps it measures the BUNDLE (tests included), and with it the line figure depends
// on how the module range happens to map — comments uncovered in one file, everything covered in another.
const covArgs = process.env.COVERAGE ? ['node_modules/c8/bin/c8.js', '--reporter=text', '--exclude-after-remap', '--exclude=tests/**', '--exclude=**/node_modules/**', `--temp-directory=${OUT_DIR}/c8`, process.execPath] : []
try { execFileSync(process.execPath, [...covArgs, '--test', ...bundled], { stdio: 'inherit' }) }
catch { process.exit(1) }
