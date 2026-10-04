import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

// The same as build.mjs, but watching src/. Without the typecheck, on purpose: saving stays instantaneous;
// types are checked in build.mjs, which is the one used for publishing. The globals have to be THE SAME.
/*
    A DCE bundles NOTHING of Kwirth's: its imports of common and common-back resolve against the
    globals the core publishes — 'window.__kwirth__' in the front end, 'global.__kwirth_back__' in the
    back end. That is what keeps the registry a single one: the DCE and its consumers see the same
    common-back, so the same getDce().
*/
const kwirthFrontGlobalsPlugin = {
    name: 'kwirth-globals',
    setup(build) {
        const globals = {
            '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
            '@kwirthmagnify/kwirth-common-front': 'window.__kwirth__.kwirthCommonFront',
        }
        for (const pkg of Object.keys(globals)) {
            build.onResolve({ filter: new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({ path: pkg, namespace: 'kwirth-globals' }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: `const _m = ${globals[args.path]}; module.exports = Object.assign({}, _m, { default: _m, __esModule: true });`,
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
const distMeta = {
    type: 'commonjs',
    extensionType: 'dce',
    id: meta.id,
    name: meta.name,
    displayName: meta.displayName,
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {}),
    ...(meta.publishConfig ? { publishConfig: meta.publishConfig } : {}),
    // Always true for a DCE: consumers keep the previous instance until the server restarts.
    requiresRestart: true,
    requiresExtension: meta.requiresExtension ?? [],
    homepage: 'https://kwirthmagnify.dev',
    repository: { type: 'git', url: 'git+https://github.com/kwirthmagnify/kwirth.git', directory: 'dces/three' },
    keywords: ['kwirth', 'kubernetes', 'dce', 'three', 'three.js', '3d'],
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))

const frontCtx = await esbuild.context({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    plugins: [kwirthFrontGlobalsPlugin],
    loader: { '.ts': 'ts' },
    target: 'es2020',
    minify: false,
})


await frontCtx.watch()


console.log('[watch] Watching src/ — dist rebuilds on every change.')

