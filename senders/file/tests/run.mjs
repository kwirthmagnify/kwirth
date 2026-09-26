// Unit test runner for the file sender (the censor/montag/provider-debug pattern).
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

// 3) Bundle TS -> ESM node20. The @kwirthmagnify/* packages are externalised (they are resolved
//    at runtime from node_modules).
/*
    COVERAGE=1 → UN SOLO entry que importa todos los tests.

    Con un bundle por fichero, cada uno arrastra su PROPIA copia del src y el informe los trata como
    ficheros distintos: hace la MEDIA de esas copias en vez de la union, muy por debajo de la
    cobertura real. Solo con COVERAGE=1: la ejecucion normal sigue siendo un proceso por fichero.
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
        '@iriaoperae/kwirth-common-cloud',
        '@iriaoperae/kwirth-common-cloud/azure',
        '@kwirthmagnify/kwirth-common',
        '@kwirthmagnify/kwirth-common-back',
        '@kwirthmagnify/kwirth-common-front'
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
