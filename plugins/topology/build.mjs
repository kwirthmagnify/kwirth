import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

// Maps external packages to window.__kwirth__ globals so bundles don't include React/MUI/kwirth-common.
// three is NOT externalized — it gets bundled because the host does not provide it.
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
            build.onResolve({ filter: new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({
                path: pkg,
                namespace: 'kwirth-globals',
            }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: `module.exports = ${globals[args.path]}`,
            loader: 'js',
        }))
    },
}

fs.mkdirSync('dist', { recursive: true })

// Build front.js — IIFE that registers the channel via window.__kwirth_plugins__
// three.js is bundled (not externalized) since the host does not provide it.
await esbuild.build({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    plugins: [kwirthGlobalsPlugin],
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    minify: false,
})
console.log('Built dist/front.js')

// Build back.js — CommonJS bundle for Node.js.
// kwirth-common is bundled. No other externals needed.
await esbuild.build({
    entryPoints: ['src/back.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    loader: { '.ts': 'ts' },
    minify: false,
})
console.log('Built dist/back.js')

// Write package.json into dist for the .tgz bundle
const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = {
    id: meta.id,
    name: meta.name,
    version: meta.version,
    description: meta.description,
    icon: meta.icon,
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')
console.log('Done. Run: tar -czf topology-plugin.tgz -C dist .')
