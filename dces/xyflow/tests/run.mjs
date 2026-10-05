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
    // The libraries the DCE ships load from node_modules, not bundled: bundled, the coverage would measure
    // React Flow's and elk's own code instead of this DCE's.
    // '@xyflow/react' goes by EXACT name: as a plain `external` it would take its stylesheet subpath with it,
    // and node cannot import a .css — the test reads it as text, the way the build does.
    external: ['@kwirthmagnify/kwirth-common', '@kwirthmagnify/kwirth-common-back', 'elkjs', 'react', 'react-dom'],
    plugins: [{
        name: 'external-exact',
        setup(build) {
            build.onResolve({ filter: /^@xyflow\/react$/ }, (args) => ({ path: args.path, external: true }))
        }
    }],
    loader: { '.ts': 'ts', '.css': 'text' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))
const covArgs = process.env.COVERAGE ? ['--experimental-test-coverage', '--test-coverage-exclude=**/node_modules/**', '--test-coverage-exclude=**/tests/**'] : []
try { execFileSync('node', ['--test', ...covArgs, ...bundled], { stdio: 'inherit' }) }
catch { process.exit(1) }
