// Unit test runner (the same pattern as the plugins): it bundles tests/**/*.test.ts with esbuild into
// tests/.out (ESM node20) and runs `node --test`. The tests import straight from ../src.
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

if (entries.length === 0) { console.log('No tests (tests/**/*.test.ts).'); process.exit(0) }

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

await esbuild.build({
    entryPoints: entries,
    bundle: true, format: 'esm', platform: 'node', target: 'node20',
    outdir: OUT_DIR, outbase: TEST_DIR, outExtension: { '.js': '.mjs' },
    sourcemap: process.env.COVERAGE ? 'inline' : false,   // COVERAGE=1 → map the coverage back to src/
    external: ['@kwirthmagnify/kwirth-common', '@kwirthmagnify/kwirth-common-back'],
    /*
        🔴 `module` BEFORE `main`, and it is not a preference.

        `@jfvilas/react-file-manager` publishes `"main": "src/index.js"`, but its tarball only ships
        `dist/` and that one file — so `src/index.js` imports `./FileManager/FileManager`, which is not
        in the package. The `main` entry point is broken as published; only `module` (dist, ESM) works.

        Browsers never hit it, because bundlers prefer `module` there, which is why the core never
        noticed. With `platform: 'node'` esbuild prefers `main`, and the build fails on a path that
        does not exist. Anyone consuming this library from node needs this line.
    */
    mainFields: ['module', 'main'],
    // The stylesheet is asserted on, like the factory injects it: as text.
    // COVERAGE=1 → no tree-shaking: a function no test imports must stay in the bundle to count as uncovered
    treeShaking: !process.env.COVERAGE,
    loader: { '.ts': 'ts', '.css': 'text' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))
// COVERAGE=1 → c8 measures, mapped back to src/ through the inline sourcemaps. Node's own coverage cannot:
// without --enable-source-maps it measures the BUNDLE (tests included), and with it the line figure depends
// on how the module range happens to map — comments uncovered in one file, everything covered in another.
const covArgs = process.env.COVERAGE ? ['node_modules/c8/bin/c8.js', '--reporter=text', '--exclude-after-remap', '--exclude=tests/**', '--exclude=**/node_modules/**', `--temp-directory=${OUT_DIR}/c8`, process.execPath] : []
try { execFileSync(process.execPath, [...covArgs, '--test', ...bundled], { stdio: 'inherit' }) }
catch { process.exit(1) }
