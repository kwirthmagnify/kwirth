import esbuild from 'esbuild'
import { writeDistMeta } from './dist-meta.mjs'

writeDistMeta()

const ctx = await esbuild.context({
    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    loader: { '.ts': 'ts' },
    minify: false,
})
await ctx.watch()
console.log('[watch] Watching src/ — dist/back.js rebuilds on every change.')
console.log('[watch] The core loads back.js once: restart the back to pick up a change.')
