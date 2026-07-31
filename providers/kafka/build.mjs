import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

fs.mkdirSync('dist', { recursive: true })

await esbuild.build({
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
console.log('Built dist/back.js')

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = { type: 'commonjs', extensionType: 'provider',
    id: meta.id,
    name: meta.name,
    displayName: meta.displayName,
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {}),
    requiresRestart: meta.requiresRestart ?? false,
    requiresExtension: meta.requiresExtension ?? [],
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

console.log(`Done. Run 'npm publish' on your 'dist' folder to publish to npmjs.`)
