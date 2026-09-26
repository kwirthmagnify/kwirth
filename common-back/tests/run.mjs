// Unit test runner for common-back (the same pattern as back/tests/run.mjs).
//
// It bundles each tests/**/*.test.ts with esbuild (TS→ESM, externalising heavy deps) into tests/.out/
// and runs them with the native `node --test` runner. No new test dependencies at all.
//
//   npm test            → runs the whole suite
//
// The tests import straight from ../src (no code is duplicated).

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
    // heavy deps externalised: the oauth2/github tests only touch pure src (IIdpConnector), but they
    // are externalised anyway in case some test imports the index.
    external: [
        '@kubernetes/client-node', '@kwirthmagnify/kwirth-common', 'express', 'js-yaml', 'openid-client', 'jose'
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
