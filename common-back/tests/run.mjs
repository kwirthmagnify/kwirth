// Runner de tests unitarios de common-back (mismo patrón que back/tests/run.mjs).
//
// Bundlea cada tests/**/*.test.ts con esbuild (TS→ESM, externalizando deps pesadas) a tests/.out/
// y los ejecuta con el runner nativo `node --test`. Cero dependencias de test nuevas.
//
//   npm test            → ejecuta toda la suite
//
// Los tests importan directamente de ../src (no se duplica código).

import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'

const TEST_DIR = 'tests'
const OUT_DIR = 'tests/.out'

if (!existsSync(TEST_DIR)) {
    console.log('No hay carpeta tests/.')
    process.exit(0)
}

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

await esbuild.build({
    entryPoints: entries,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outdir: OUT_DIR,
    outbase: TEST_DIR,
    outExtension: { '.js': '.mjs' },
    // deps pesadas externalizadas: los tests de oauth2/github solo tocan src puro (IIdpConnector),
    // pero si algún test importara el index se externalizan igual.
    external: [
        '@kubernetes/client-node', '@kwirthmagnify/kwirth-common', 'express', 'js-yaml', 'openid-client'
    ],
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String).filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))

try {
    execFileSync('node', ['--test', ...bundled], { stdio: 'inherit' })
}
catch {
    process.exit(1)
}
