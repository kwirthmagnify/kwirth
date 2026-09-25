import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

/*
    Lo mismo que build.mjs, pero vigilando src/: front.js y back.js se rehacen en cada cambio.

    Sin el typecheck, a proposito: esbuild borra los tipos sin mirarlos, y pasar tsc en cada guardado
    haria que guardar dejara de ser instantaneo. Los tipos se comprueban en build.mjs, que es el que
    se usa para publicar.

    Los globales tienen que ser LOS MISMOS que en build.mjs: si aqui faltara uno, el watch bundlearia
    una segunda copia de React o de React Flow y el plugin se comportaria distinto que el publicado.
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
