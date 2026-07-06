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

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({
    id: meta.id, name: meta.name, displayName: meta.displayName,
    version: meta.version, description: meta.description,
    ...(meta.website ? { website: meta.website } : {}),
}, null, 2))

const ctx = await esbuild.context({
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

await ctx.watch()
console.log('[watch] Watching src/ — back.js rebuilds on every change.')
console.log('[watch] kwirth backend hot-reloads back.js automatically.')
