// Runner de tests unitarios del back de Kwirth.
//
// Bundlea cada tests/**/*.test.ts con esbuild (TS→ESM, externalizando deps pesadas/nativas)
// a tests/.out/ y los ejecuta con el runner nativo `node --test`. Cero dependencias de test
// nuevas: node:test + node:assert/strict. Mismo patrón que el plugin defender.
//
//   npm test            → ejecuta toda la suite
//
// Los tests importan directamente de ../src (no se duplica código). Las deps de runtime van
// external: si un test las toca, node las usa reales; si no, nunca se cargan.

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
    COVERAGE=1 → UN SOLO entry que importa todos los tests.

    Con un bundle por fichero, cada uno arrastra su PROPIA copia del src y el informe los trata como
    ficheros distintos: hace la MEDIA de esas copias en vez de la union, y cuenta como no cubierto todo
    el src que ese test concreto no toca. El numero salia MUY por debajo del real (y encima el informe
    listaba `tests/.out/*.test.mjs`, no `src/`). Mismo arreglo que ya llevan montag, agora y
    provider-debug. Solo con COVERAGE=1: la ejecucion normal sigue siendo un proceso por fichero, que es
    lo que aisla los tests entre si.
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
    // el src bundleado usa require/require.resolve/require.cache (carga dinámica de conectores);
    // en salida ESM hay que inyectar un require basado en createRequire.
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
    // Deps de runtime del back externalizadas: esbuild solo bundlea el TS de src/ y los tests.
    external: [
        '@jfvilas/parse-listing', '@kubernetes/client-node',
        '@kwirthmagnify/kwirth-common', '@kwirthmagnify/kwirth-common-ai', '@kwirthmagnify/kwirth-common-back',
        'body-parser', 'cookie-parser', 'cors', 'dockerode', 'dotenv', 'express', 'express-fileupload',
        'http-proxy-middleware', 'request-ip', 'tar', 'ts-semaphore', 'uuid', 'ws', 'cpu-features', 'bcrypt'
    ],
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String).filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))

// COVERAGE=1 → cobertura nativa de Node mapeada a src/ (excluye node_modules y los propios tests).
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
