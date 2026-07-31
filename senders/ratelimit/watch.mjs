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
            contents: `module.exports = ${globals[args.path]}`, loader: 'js',
        }))
    },
}

const notifyPlugin = (label) => ({
    name: `notify-${label}`,
    setup(build) {
        build.onEnd(result => {
            const t = new Date().toLocaleTimeString()
            if (result.errors.length) console.error(`[${t}] ${label} FAILED: ${result.errors.map(e => e.text).join('; ')}`)
            else console.log(`[${t}] ${label} OK`)
        })
    },
})

fs.mkdirSync('dist', { recursive: true })
const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({ id: meta.id, name: meta.name, displayName: meta.displayName, version: meta.version, description: meta.description , requiresRestart: meta.requiresRestart ?? false, requiresExtension: meta.requiresExtension ?? [] }, null, 2))

const backCtx = await esbuild.context({
    entryPoints: ['src/back/index.ts'],
    bundle: true, format: 'cjs', platform: 'node', target: 'node20',
    outfile: 'dist/back.js', loader: { '.ts': 'ts' }, minify: false,
    plugins: [notifyPlugin('back')],
})

const frontCtx = await esbuild.context({
    entryPoints: ['src/front/index.tsx'],
    bundle: true, format: 'iife', outfile: 'dist/front.js',
    plugins: [kwirthGlobalsPlugin, notifyPlugin('front')],
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
    target: 'es2020', minify: false,
})

await Promise.all([backCtx.watch(), frontCtx.watch()])
console.log('[watch] Watching src/ — back.js and front.js rebuild on every change.')
