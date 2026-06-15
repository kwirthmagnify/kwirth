import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

fs.mkdirSync('dist', { recursive: true })

await esbuild.build({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    loader: { '.ts': 'ts' },
    target: 'es2020',
    minify: false,
})
console.log('Built dist/front.js')

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = {
    id: meta.id,
    name: meta.name,
    displayName: meta.displayName,
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {})
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

if (fs.existsSync('preview.png')) {
    fs.copyFileSync('preview.png', path.join('dist', 'preview.png'))
    console.log('Copied preview.png')
}

console.log(`Done. Run 'npm publish --access=public' on your 'dist' folder to publish to npmjs.`)
console.log(`Package URL: https://registry.npmjs.org/${meta.name}/-/${meta.name.split('/').pop()}-${meta.version}.tgz`)
