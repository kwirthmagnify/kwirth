import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

const kwirthGlobalsPlugin = {
    name: 'kwirth-globals',
    setup(build) {
        const globals = {
            'react': 'window.__kwirth__.React',
            '@mui/material': 'window.__kwirth__.MUI.material',
            '@mui/icons-material': 'window.__kwirth__.MUI.icons',
            '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
        }
        for (const pkg of Object.keys(globals)) {
            build.onResolve({ filter: new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({ path: pkg, namespace: 'kwirth-globals' }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: `module.exports = ${globals[args.path]}`,
            loader: 'js',
        }))
    },
}

fs.mkdirSync('dist', { recursive: true })
const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({ id: meta.id, name: meta.name, version: meta.version, description: meta.description, icon: meta.icon, ...(meta.website ? { website: meta.website } : {}) }, null, 2))

const frontCtx = await esbuild.context({
    entryPoints: ['src/front/index.ts'],
    bundle: true, format: 'iife', outfile: 'dist/front.js',
    plugins: [kwirthGlobalsPlugin],
    loader: { '.tsx': 'tsx', '.ts': 'tsx', '.css': 'text' },
    jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
    target: 'es2020', minify: false,
})

const backCtx = await esbuild.context({
    entryPoints: ['src/back/index.ts'],
    bundle: true, format: 'cjs', platform: 'node', target: 'node20',
    outfile: 'dist/back.js',
    external: ['express', '@kwirthmagnify/kwirth-common-back'],
    loader: { '.ts': 'ts', '.yaml': 'text' }, minify: false,
})

await frontCtx.watch()
await backCtx.watch()
console.log('[watch] Watching src/ — rebuilds on every change.')
