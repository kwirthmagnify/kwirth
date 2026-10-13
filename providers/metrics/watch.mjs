import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

// express comes from the host (see build.mjs)
const kwirthBackGlobalsPlugin = {
    name: 'kwirth-back-globals',
    setup(build) {
        build.onResolve({ filter: /^express$/ }, () => ({ path: 'express', namespace: 'kwirth-back-globals' }))
        build.onLoad({ filter: /.*/, namespace: 'kwirth-back-globals' }, () => ({
            contents: 'module.exports = global.__kwirth_back__.express;',
            loader: 'js',
        }))
    },
}

fs.mkdirSync('dist', { recursive: true })

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = {
    type: 'commonjs',
    extensionType: 'provider',
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

const backCtx = await esbuild.context({
    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    plugins: [kwirthBackGlobalsPlugin],
    loader: { '.ts': 'ts' },
    minify: false,
})
await backCtx.watch()

console.log('[watch] Watching src/ — dist rebuilds on every change.')
console.log('[watch] kwirth reloads the provider back.js on restart of the core.')
