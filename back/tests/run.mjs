// Unit test runner for Kwirth's back end.
//
// It bundles each tests/**/*.test.ts with esbuild (TS→ESM, externalising heavy and native deps) into
// tests/.out/ and runs them with the native `node --test` runner. No new test dependencies at all:
// node:test + node:assert/strict. The same pattern as the defender plugin.
//
//   npm test            → runs the whole suite
//
// The tests import straight from ../src (no code is duplicated). The runtime deps go external: if a test
// touches them, node uses the real ones; if not, they are never loaded.

import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'

const TEST_DIR = 'tests'
const OUT_DIR = 'tests/.out'

if (!existsSync(TEST_DIR)) {
    console.log('No hay carpeta tests/.')
    process.exit(0)
}

// tests espejan src/ (tests/tools/auth, tests/api, ...)
const entries = readdirSync(TEST_DIR, { recursive: true })
    .map(String)
    .filter(f => f.endsWith('.test.ts'))
    .map(f => path.join(TEST_DIR, f))

if (entries.length === 0) {
    console.log('No hay tests (tests/**/*.test.ts).')
    process.exit(0)
}

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

/*
    COVERAGE=1 → ONE SINGLE entry that imports every test.

    With one bundle per file, each drags along its OWN copy of the src and the report treats them as
    different files: it takes the MEAN of those copies instead of their union, and counts as uncovered
    all the src that that particular test does not touch. The number came out WAY below the real one (and
    on top of that the report listed `tests/.out/*.test.mjs`, not `src/`). The same fix montag, agora and
    provider-debug already carry. Only with COVERAGE=1: the normal run is still one process per file,
    which is what isolates the tests from one another.
*/
const ALL_ENTRY = path.join(TEST_DIR, '.coverage-all.generated.ts')
let buildEntries = entries
if (process.env.COVERAGE) {
    const imports = entries.map(e => `import './${path.relative(TEST_DIR, e).split(path.sep).join('/')}'`).join('\n')
    writeFileSync(ALL_ENTRY, `// Generado por run.mjs para medir cobertura. NO editar ni versionar.\n${imports}\n`)
    buildEntries = [ALL_ENTRY]
}

await esbuild.build({
    entryPoints: buildEntries,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outdir: OUT_DIR,
    outbase: TEST_DIR,
    outExtension: { '.js': '.mjs' },
    sourcemap: process.env.COVERAGE ? 'inline' : false,   // COVERAGE=1 → sourcemaps para mapear la cobertura al src/
    // the bundled src uses require/require.resolve/require.cache (dynamic loading of connectors);
    // with ESM output a createRequire-based require has to be injected.
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
    // The back end's runtime deps externalised: esbuild only bundles the TS from src/ and the tests.
    external: [
        '@jfvilas/parse-listing', '@kubernetes/client-node',
        '@kwirthmagnify/kwirth-common', '@kwirthmagnify/kwirth-common-ai', '@kwirthmagnify/kwirth-common-back',
        'body-parser', 'cookie-parser', 'cors', 'dockerode', 'dotenv', 'express', 'express-fileupload',
        'http-proxy-middleware', 'request-ip', 'tar', 'ts-semaphore', 'uuid', 'ws', 'cpu-features', 'bcrypt'
    ],
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String).filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))

// COVERAGE=1 → Node's native coverage mapped to src/ (it excludes node_modules and the tests themselves).
const covArgs = process.env.COVERAGE ? ['--experimental-test-coverage', '--test-coverage-exclude=**/node_modules/**', '--test-coverage-exclude=**/tests/**'] : []
try {
    execFileSync('node', ['--test', ...covArgs, ...bundled], { stdio: 'inherit' })
}
catch {
    if (process.env.COVERAGE) rmSync(ALL_ENTRY, { force: true })
    process.exit(1)   // node --test devuelve ≠0 si algún test falla
}
finally {
    if (process.env.COVERAGE) rmSync(ALL_ENTRY, { force: true })
}
