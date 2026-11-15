// Unit test runner (the same pattern as the plugins): it bundles tests/**/*.test.ts with esbuild into
// tests/.out (ESM node20) and runs `node --test`. The tests import straight from ../src.
import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync, writeFileSync, existsSync, unlinkSync } from 'fs'
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

/*
    COVERAGE=1 → UNA sola entrada que importa todos los tests.

    Con un bundle por fichero, cada uno arrastra SU copia de src y el informe los trata como ficheros
    distintos: PROMEDIA esas copias en vez de unirlas, y sale bastante por debajo de la cobertura real.
    Solo bajo COVERAGE=1: una corrida normal sigue siendo un proceso por fichero.
*/
const ALL_ENTRY = path.join(TEST_DIR, '.coverage-all.generated.ts')
let buildEntries = entries
if (process.env.COVERAGE) {
    const imports = entries.map(e => `import './${path.relative(TEST_DIR, e).replace(/\\/g, '/')}'`).join('\n')
    writeFileSync(ALL_ENTRY, `// Generado por run.mjs para medir cobertura. NO editar ni commitear.\n${imports}\n`)
    buildEntries = [ALL_ENTRY]
}

await esbuild.build({
    entryPoints: buildEntries,
    sourcemap: process.env.COVERAGE ? 'inline' : false,   // COVERAGE=1 → sourcemaps para remontar a src/
    bundle: true, format: 'esm', platform: 'node', target: 'node20',
    outdir: OUT_DIR, outbase: TEST_DIR, outExtension: { '.js': '.mjs' },
    /*  ssh2 is CJS: imported by name from ESM it does not work, so it is bundled, as in build.mjs, with
        its two optional native bindings left out. Its `require`s of Node modules need a real `require`
        and its `__dirname` inside an ESM bundle: the banner gives it both. */
    external: ['@kwirthmagnify/kwirth-common', '@kwirthmagnify/kwirth-common-back', 'cpu-features', '*.node'],
    banner: { js: [
        "import { createRequire as __kwirthCreateRequire } from 'module';",
        "import { fileURLToPath as __kwirthFileURLToPath } from 'url';",
        "import { dirname as __kwirthDirname } from 'path';",
        'const require = __kwirthCreateRequire(import.meta.url);',
        'const __filename = __kwirthFileURLToPath(import.meta.url);',
        'const __dirname = __kwirthDirname(__filename);'
    ].join(' ') },
    // COVERAGE=1 → no tree-shaking: a function no test imports must stay in the bundle to count as uncovered
    treeShaking: !process.env.COVERAGE,
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))
// COVERAGE=1 → c8 measures, mapped back to src/ through the inline sourcemaps. Node's own coverage cannot:
// without --enable-source-maps it measures the BUNDLE (tests included), and with it the line figure depends
// on how the module range happens to map — comments uncovered in one file, everything covered in another.
const covArgs = process.env.COVERAGE
    ? ['node_modules/c8/bin/c8.js', '--reporter=text', '--exclude-after-remap', '--exclude=tests/**', '--exclude=**/node_modules/**', `--temp-directory=${OUT_DIR}/c8`, process.execPath]
    : []
try { execFileSync(process.execPath, [...covArgs, '--test', ...bundled], { stdio: 'inherit' }) }
catch { process.exit(1) }
finally { if (existsSync(ALL_ENTRY)) unlinkSync(ALL_ENTRY) }
