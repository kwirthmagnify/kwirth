// Unit test runner for provider-debug (patrón censor/montag).
// It bundles tests/**/*.test.ts with esbuild -> tests/.out (ESM node20) and runs `node --test`.
// The tests import straight from ../src (the real code, not the dist).
import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync, writeFileSync } from 'fs'
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
//    runtime from node_modules).
/*
    COVERAGE=1 → a SINGLE entry that imports every test.

    With one bundle per file, each one drags in its OWN copy of the src and the report treats them as
    different files: it AVERAGES those copies instead of taking their union, well below the real coverage.
    Only with COVERAGE=1: a normal run is still one process per file.
*/
const ALL_ENTRY = path.join(TEST_DIR, '.coverage-all.generated.ts')
let buildEntries = entries
if (process.env.COVERAGE) {
    const imports = entries.map(e => `import './${path.relative(TEST_DIR, e).replace(/\\/g, '/')}'`).join('\n')
    writeFileSync(ALL_ENTRY, `// Generado por run.mjs para medir cobertura. NO editar ni versionar.\n${imports}\n`)
    buildEntries = [ALL_ENTRY]
}

await esbuild.build({
    entryPoints: buildEntries,
    bundle: true, format: 'esm', platform: 'node', target: 'node20',
    outdir: OUT_DIR, outbase: TEST_DIR, outExtension: { '.js': '.mjs' },
    sourcemap: process.env.COVERAGE ? 'inline' : false,   // COVERAGE=1 → sourcemaps to map coverage back to src/
    external: [
        'express',
        '@kwirthmagnify/kwirth-common',
        '@kwirthmagnify/kwirth-common-back',
        '@kwirthmagnify/kwirth-common-front',
        // Loaded from node_modules, not bundled: bundled, the coverage would measure elk's own code.
        'elkjs'
    ],
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
})

// 4) Run the bundles with the native runner (each file in its own process)
const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))
// COVERAGE=1 → node:test coverage, with the sourcemaps needed to map it back to src/
// (the same pattern as montag and agora). Without the variable, the runner behaves exactly as before.
const covArgs = process.env.COVERAGE ? ['--experimental-test-coverage', '--test-coverage-exclude=**/node_modules/**', '--test-coverage-exclude=**/tests/**'] : []
try { execFileSync('node', ['--test', ...covArgs, ...bundled], { stdio: 'inherit' }) }
catch { if (process.env.COVERAGE) rmSync(ALL_ENTRY, { force: true }); process.exit(1) }
finally { if (process.env.COVERAGE) rmSync(ALL_ENTRY, { force: true }) }
