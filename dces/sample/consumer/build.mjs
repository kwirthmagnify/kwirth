import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/*
    The build of a DCE CONSUMER. This is the part any real consumer copies.

    Two rules, and the second is the one that is new:

      1. Nothing of Kwirth's is bundled: React, MUI and the common packages resolve against the globals
         the core publishes. A plugin that bundles React puts a second copy on the page.

      2. The DCE's package resolves against the REGISTRY, not into the bundle. A consumer installs the
         DCE's package for its TYPES and gets the instance at runtime — which is the whole point. Were it
         bundled, the consumer would carry its own copy of the code and build its own object, and the
         one instance the type guarantees would quietly become two.

    This stub declares its types locally (see src/front/ConsumerFront.ts), so there is no package to map;
    the mapping is left written below because that is what a consumer of a REAL DCE has to add.
*/

// paquete npm de la DCE -> su entrada en el registro. Un consumidor real descomenta su linea.
const DCE_PACKAGES = {
    // '@kwirthmagnify/kwirth-dce-sample': 'sample',
}

const dceGlobal = (registry) => ({
    name: 'kwirth-dce-globals',
    setup(build) {
        for (const [pkg, id] of Object.entries(DCE_PACKAGES)) {
            build.onResolve({ filter: new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({ path: pkg, namespace: 'kwirth-dce' }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-dce' }, (args) => ({
            // The instance, read through the very getDce() the core publishes: never a copy of the code.
            contents: `const _e = ${registry}['${DCE_PACKAGES[args.path]}']; module.exports = _e && _e.instance ? _e.instance : {};`,
            loader: 'js',
        }))
    },
})

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
        }
        for (const pkg of Object.keys(globals)) {
            build.onResolve({ filter: new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({ path: pkg, namespace: 'kwirth-globals' }))
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

const TSC = 'node_modules/typescript/lib/tsc.js'
if (fs.existsSync(TSC)) {
    try {
        execFileSync(process.execPath, [TSC, '--noEmit'], { stdio: 'inherit' })
        console.log('Typecheck passed')
    }
    catch {
        console.error('Typecheck failed — build aborted')
        process.exit(1)
    }
}
else {
    console.log('Skipping typecheck: typescript is not installed (run npm install)')
}

fs.mkdirSync('dist', { recursive: true })

await esbuild.build({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    plugins: [kwirthGlobalsPlugin, dceGlobal('window.__kwirth_dce__')],
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    minify: false,
})
console.log('Built dist/front.js')

await esbuild.build({
    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    plugins: [kwirthBackGlobalsPlugin, dceGlobal('global.__kwirth_dce__')],
    external: ['express'],
    loader: { '.ts': 'ts' },
    minify: false,
})
console.log('Built dist/back.js')

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({
    type: 'commonjs',
    extensionType: 'plugin',
    id: meta.id,
    name: `@kwirthmagnify/kwirth-plugin-${meta.id}`,
    displayName: meta.displayName,
    version: meta.version,
    description: meta.description,
    icon: meta.icon,
    requiresRestart: meta.requiresRestart ?? false,
    // This is what makes the core refuse to install it without its DCE, and refuse to remove the DCE
    // while it is installed (plan: plans/dce/PRD.md, RF5, RF8, RF9).
    requiresExtension: meta.requiresExtension ?? [],
}, null, 2))
console.log('Wrote dist/package.json')
