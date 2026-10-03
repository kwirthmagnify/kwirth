import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'

/*
    Test runner: bundles each *.test.ts with esbuild (ESM, node20, externalizing
    the kwirth-common packages that are provided as globals at runtime) into
    tests/.out/, then runs `node --test` on them.

    Supports COVERAGE=1 for --experimental-test-coverage.
*/

const testDir = 'tests'
const outDir = 'tests/.out'
fs.mkdirSync(outDir, { recursive: true })

const testFiles = fs.readdirSync(testDir)
    .filter(f => f.endsWith('.test.ts'))
    .map(f => ({ src: path.join(testDir, f), out: path.join(outDir, f.replace('.ts', '.mjs')) }))

for (const { src, out } of testFiles) {
    await esbuild.build({
        entryPoints: [src],
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node20',
        outfile: out,
        external: ['node:*', '@kwirthmagnify/kwirth-common', '@kwirthmagnify/kwirth-common-back'],
        loader: { '.ts': 'ts' },
        minify: false,
    })
}

const args = ['--test', ...testFiles.map(t => t.out)]
if (process.env.COVERAGE === '1') args.unshift('--experimental-test-coverage')

try {
    execFileSync(process.execPath, args, { stdio: 'inherit' })
}
catch (err) {
    process.exit(1)
}
