import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

/*
    The same as build.mjs, but watching src/: front.js and back.js are remade on every change.

    Without the typecheck, on purpose: esbuild erases types without looking at them, and running tsc on
    every save would stop saving being instantaneous. Types are checked in build.mjs, which is the one
    used for publishing.

    The globals have to be THE SAME as in build.mjs: were one missing here, the watch would bundle a
    second copy of React or of React Flow and the plugin would behave differently from the published one.
*/
const kwirthGlobalsPlugin = {
    name: 'kwirth-globals',
    setup(build) {
        const globals = {
            'react': 'window.__kwirth__.React',
            '@mui/material': 'window.__kwirth__.MUI.material',
            '@mui/icons-material': 'window.__kwirth__.MUI.icons',
            '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
            '@kwirthmagnify/kwirth-common-front': 'window.__kwirth__.kwirthCommonFront',
            '@kwirthmagnify/kwirth-common-front/icons': 'window.__kwirth__.MUI.icons',
            '@xyflow/react': 'window.__kwirth__.reactFlow',
        }
        for (const pkg of Object.keys(globals)) {
            build.onResolve({ filter: new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({
                path: pkg,
                namespace: 'kwirth-globals',
            }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: `const _m = ${globals[args.path]}; let _d = (_m != null && 'default' in Object(_m)) ? _m.default : _m; if (typeof _d !== 'function' && _d != null && typeof _d.default !== 'undefined') _d = _d.default; module.exports = Object.assign({}, (typeof _m === 'object' && _m !== null) ? _m : {}, {default: _d, __esModule: true});`,
            loader: 'js',
        }))
    },
}

const kwirthBackGlobalsPlugin = {
    name: 'kwirth-back-globals',
    setup(build) {
        const backGlobals = {
            '@kwirthmagnify/kwirth-common': 'global.__kwirth_back__.kwirthCommon',
            '@kwirthmagnify/kwirth-common-back': 'global.__kwirth_back__.kwirthCommonBack',
        }
        build.onResolve({ filter: /^@kwirthmagnify\/kwirth-common(-back)?$/ }, (args) => {
            if (backGlobals[args.path]) return { path: args.path, namespace: 'kwirth-back-globals' }
        })
        build.onLoad({ filter: /.*/, namespace: 'kwirth-back-globals' }, (args) => ({
            contents: 'module.exports = ' + backGlobals[args.path],
            loader: 'js',
        }))
    },
}

fs.mkdirSync('dist', { recursive: true })

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({ type: 'commonjs', extensionType: 'plugin',
    id: meta.id,
    name: `@kwirthmagnify/kwirth-plugin-${meta.id}`,
    displayName: meta.displayName,
    version: meta.version,
    description: meta.description,
    icon: meta.icon,
    ...(meta.website ? { website: meta.website } : {}),
    requiresRestart: meta.requiresRestart ?? false,
    requiresExtension: meta.requiresExtension ?? [],
}, null, 2))

const frontCtx = await esbuild.context({
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

const backCtx = await esbuild.context({
    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    plugins: [kwirthBackGlobalsPlugin],
    external: ['express'],
    loader: { '.ts': 'ts' },
    minify: false,
})

await frontCtx.watch()
await backCtx.watch()

console.log('[watch] Watching src/ — front.js and back.js rebuild on every change.')
console.log('[watch] El front se recarga solo; un cambio en back.js exige REINICIAR el core (lo cachea).')
