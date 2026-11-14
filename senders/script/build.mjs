import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { writeDistMeta } from './dist-meta.mjs'

// esbuild STRIPS types without ever checking them, so a build with no typecheck step happily
// publishes broken TypeScript. tsc runs first and aborts the build; the watcher skips it on
// purpose, so that saving stays instant while you work.
const TSC = 'node_modules/typescript/lib/tsc.js'
if (fs.existsSync(TSC)) {
    try {
        execFileSync(process.execPath, [TSC, '--noEmit'], { stdio: 'inherit' })
        console.log('Typecheck passed')
    }
    catch {
        console.error('Typecheck failed — build aborted')
        process.exit(1)
    }
}
else {
    console.log('Skipping typecheck: typescript is not installed (run npm install)')
}

fs.mkdirSync('dist', { recursive: true })

await esbuild.build({
    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    loader: { '.ts': 'ts' },
    minify: false,
})
console.log('Built dist/back.js')

const meta = writeDistMeta()
console.log('Wrote dist/package.json')

// The publish runs from dist/, so the README has to be there or the package ships without it
if (fs.existsSync('README.md')) {
    fs.copyFileSync('README.md', path.join('dist', 'README.md'))
    console.log('Copied README.md to dist/')
}
else {
    console.warn('WARNING: no README.md — the published package would have none')
}

console.log("Done. Run 'npm publish --access=public' on your 'dist' folder to publish to npmjs.")
console.log(`Installable on Kwirth via: https://registry.npmjs.org/${meta.name}/-/kwirth-sender-${meta.id}-${meta.version}.tgz`)
