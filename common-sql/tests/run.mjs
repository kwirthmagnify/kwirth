// common-sql test runner (the Defender pattern).
// It bundles tests/**/*.test.ts with esbuild (TS->ESM) into tests/.out/, externalising the drivers
// (knex/pg/sqlite3), and runs them with the native `node --test` runner. The tests import from ../src.
//
//   npm test                       -> unit (sqlite); the pg integration test skips itself
//   COMMON_SQL_PG=1 npm test       -> also runs the integration against the dev Postgres

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

if (entries.length === 0) { console.log('No hay tests (tests/**/*.test.ts).'); process.exit(0) }

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
    external: ['knex', 'pg'],
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String).filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))

try {
    execFileSync('node', ['--test', ...bundled], { stdio: 'inherit' })
}
catch {
    process.exit(1)
}
