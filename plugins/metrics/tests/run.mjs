// Unit test runner for the metrics plugin (same pattern as censor/montag/status).
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

/*
    The front's UI libraries are replaced by a stub. The front tests exercise the channel's LOGIC
    (prepareExternalChannel, processChannelMessage), never a render; loading the real MUI in node asks for
    its styling engine (@emotion), which the plugin does not have because in Kwirth MUI comes from the core.
    The stub answers any named import with a function that renders nothing.
*/
const UI_LIBRARIES = /^(react|@mui\/material|@mui\/icons-material|recharts)(\/.*)?$/
const uiStubs = {
    name: 'ui-stubs',
    setup(build) {
        build.onResolve({ filter: UI_LIBRARIES }, (args) => ({ path: args.path, namespace: 'ui-stub' }))
        build.onLoad({ filter: /.*/, namespace: 'ui-stub' }, () => ({
            contents: 'const nothing = () => null; module.exports = new Proxy(nothing, { get: (_, key) => key === "__esModule" ? false : nothing })',
            loader: 'js',
        }))
    },
}

await esbuild.build({
    entryPoints: buildEntries,
    bundle: true, format: 'esm', platform: 'node', target: 'node20',
    outdir: OUT_DIR, outbase: TEST_DIR, outExtension: { '.js': '.mjs' },
    sourcemap: process.env.COVERAGE ? 'inline' : false,   // COVERAGE=1 → sourcemaps to map coverage back to src/
    external: [
        'express',
        '@kwirthmagnify/kwirth-common',
        '@kwirthmagnify/kwirth-common-back'
        // kwirth-common-front is bundled on purpose: it imports MUI itself, and only bundled do those
        // imports go through the stub below.
    ],
    plugins: [uiStubs],
    // kwirth-common-front is CommonJS and requires kwirth-common (external): an ESM bundle needs a real require for that
    banner: { js: "import { createRequire as __createRequire } from 'module'; const require = __createRequire(import.meta.url);" },
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
})

// 4) Run the bundles with the native runner (each file in its own process)
const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))
// COVERAGE=1 → node:test coverage, with the sourcemaps needed to map it back to src/
// (the same pattern as montag and agora). Without the variable, the runner behaves exactly as before.
// --enable-source-maps is what attributes the bundle's lines to src/ (and kwirth-common-front, bundled
// for the front tests, to node_modules, which is excluded); without it the whole bundle counts as one file.
const covArgs = process.env.COVERAGE ? ['--enable-source-maps', '--experimental-test-coverage', '--test-coverage-exclude=**/node_modules/**', '--test-coverage-exclude=**/tests/**'] : []
try { execFileSync('node', ['--test', ...covArgs, ...bundled], { stdio: 'inherit' }) }
catch { if (process.env.COVERAGE) rmSync(ALL_ENTRY, { force: true }); process.exit(1) }
finally { if (process.env.COVERAGE) rmSync(ALL_ENTRY, { force: true }) }
