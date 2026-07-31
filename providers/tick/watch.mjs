import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

fs.mkdirSync('dist', { recursive: true })

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({
    id: meta.id, name: meta.name, displayName: meta.displayName,
    version: meta.version, description: meta.description,
    ...(meta.website ? { website: meta.website } : {}),
    requiresRestart: meta.requiresRestart ?? false, requiresExtension: meta.requiresExtension ?? [] }, null, 2))

const ctx = await esbuild.context({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    external: ['express'],
    loader: { '.ts': 'ts' },
    minify: false,
})

await ctx.watch()
console.log('[watch] Watching src/ — back.js rebuilds on every change.')
console.log('[watch] kwirth backend hot-reloads back.js automatically.')
