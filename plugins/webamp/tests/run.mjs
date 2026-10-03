import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const testFiles = fs.readdirSync('tests')
    .filter(f => f.endsWith('.test.ts'))
    .map(f => path.join('tests', f))

if (testFiles.length === 0) {
    console.log('No test files found.')
    process.exit(0)
}

fs.mkdirSync('tests/.out', { recursive: true })

for (const file of testFiles) {
    const out = path.join('tests/.out', path.basename(file, '.ts') + '.mjs')
    await esbuild.build({
        entryPoints: [file],
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node20',
        outfile: out,
        loader: { '.ts': 'ts' },
        external: ['node:*'],
    })
}

// Run all compiled tests with node --test
const outFiles = testFiles.map(f => path.join('tests/.out', path.basename(f, '.ts') + '.mjs'))
try {
    execFileSync(process.execPath, ['--test', ...outFiles], { stdio: 'inherit' })
}
catch {
    process.exit(1)
}
