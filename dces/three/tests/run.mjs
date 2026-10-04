// Unit test runner (the same pattern as the plugins): it bundles tests/**/*.test.ts with esbuild into
// tests/.out (ESM node20) and runs `node --test`. The tests import straight from ../src.
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

if (entries.length === 0) { console.log('No tests (tests/**/*.test.ts).'); process.exit(0) }

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

await esbuild.build({
    entryPoints: entries,
    bundle: true, format: 'esm', platform: 'node', target: 'node20',
    outdir: OUT_DIR, outbase: TEST_DIR, outExtension: { '.js': '.mjs' },
    external: ['@kwirthmagnify/kwirth-common', '@kwirthmagnify/kwirth-common-back'],
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))
try { execFileSync('node', ['--test', ...bundled], { stdio: 'inherit' }) }
catch { process.exit(1) }
