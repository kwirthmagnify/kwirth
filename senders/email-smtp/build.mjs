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
    loader: { '.ts': 'ts' },
    minify: false,
})
console.log('Built dist/back.js')

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = {
    id: meta.id,
    name: meta.name,
    displayName: meta.displayName,
    version: meta.version,
    description: meta.description,
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')
