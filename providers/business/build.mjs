import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

// Map express to the host's shared instance (back-global) so the provider loads inside the pkg desktop binary.
const kwirthBackGlobalsPlugin = {
    name: 'kwirth-back-globals',
    setup(build) {
        const backGlobals = { express: 'global.__kwirth_back__.express' }
        build.onResolve({ filter: /^express$/ }, (args) => backGlobals[args.path] ? { path: args.path, namespace: 'kwirth-back-globals' } : undefined)
        build.onLoad({ filter: /.*/, namespace: 'kwirth-back-globals' }, (args) => ({
            contents: `module.exports = ${backGlobals[args.path]};`,
            loader: 'js',
        }))
    }
}

fs.mkdirSync('dist', { recursive: true })

await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    plugins: [kwirthBackGlobalsPlugin],
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
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

console.log(`Done. Run 'npm publish' on your 'dist' folder to publish to npmjs.`)
