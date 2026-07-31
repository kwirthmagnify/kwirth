import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

fs.mkdirSync('dist', { recursive: true })

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({
    id: meta.id,
    name: meta.name,
    displayName: meta.displayName,
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {})
, requiresRestart: meta.requiresRestart ?? false, requiresExtension: meta.requiresExtension ?? [] }, null, 2))

if (fs.existsSync('preview.png')) {
    fs.copyFileSync('preview.png', path.join('dist', 'preview.png'))
}

const frontCtx = await esbuild.context({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    loader: { '.ts': 'ts' },
    target: 'es2020',
    minify: false,
})

await frontCtx.watch()

console.log('[watch] Watching src/front — front.js rebuilds on every change.')
console.log('[watch] kwirth backend serves the updated front.js automatically (dev mode, no-cache).')
