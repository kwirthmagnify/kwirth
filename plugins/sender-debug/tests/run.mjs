// Unit test runner for sender-debug (patrón censor/montag).
// Bundlea tests/**/*.test.ts con esbuild -> tests/.out (ESM node20) y ejecuta con `node --test`.
// Los tests importan directamente de ../src (código real, no el dist).
import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync, writeFileSync } from 'fs'
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
//    runtime desde node_modules).
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
        '@kwirthmagnify/kwirth-common',
        '@kwirthmagnify/kwirth-common-back',
        '@kwirthmagnify/kwirth-common-front'
    ],
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
})

// 4) Ejecuta los bundles con el runner nativo (cada fichero en su propio proceso)
const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))
// COVERAGE=1 → cobertura de node:test, con los sourcemaps necesarios para mapearla de vuelta a src/
// (mismo patrón que montag y agora). Sin la variable, el runner se comporta igual que siempre.
const covArgs = process.env.COVERAGE ? ['--experimental-test-coverage', '--test-coverage-exclude=**/node_modules/**', '--test-coverage-exclude=**/tests/**'] : []
try { execFileSync('node', ['--test', ...covArgs, ...bundled], { stdio: 'inherit' }) }
catch { if (process.env.COVERAGE) rmSync(ALL_ENTRY, { force: true }); process.exit(1) }
finally { if (process.env.COVERAGE) rmSync(ALL_ENTRY, { force: true }) }
