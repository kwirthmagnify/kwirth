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
            '@kwirthmagnify/kwirth-common-front': 'window.__kwirth__.kwirthCommonFront',
            '@mui/x-date-pickers': 'window.__kwirth__.xDatePickers',
            '@mui/x-date-pickers/AdapterMoment': 'window.__kwirth__.adapterMoment',
            'moment': 'window.__kwirth__.moment',
            '@codemirror/view': 'window.__kwirth__.codeMirrorView',
            '@codemirror/state': 'window.__kwirth__.codeMirrorState',
            '@codemirror/commands': 'window.__kwirth__.codeMirrorCommands',
            '@codemirror/search': 'window.__kwirth__.codeMirrorSearch',
            '@codemirror/language': 'window.__kwirth__.codeMirrorLanguage',
            '@codemirror/lang-yaml': 'window.__kwirth__.codeMirrorLangYaml',
            '@codemirror/theme-one-dark': 'window.__kwirth__.codeMirrorThemeOneDark',
            '@uiw/react-codemirror': 'window.__kwirth__.uiwReactCodeMirror',
            '@jfvilas/react-file-manager': 'window.__kwirth__.jfvilasReactFileManager',

            '@kwirthmagnify/kwirth-common-front': 'window.__kwirth__.kwirthCommonFront',
            '@mui/x-date-pickers': 'window.__kwirth__.xDatePickers',
            '@mui/x-date-pickers/AdapterMoment': 'window.__kwirth__.adapterMoment',
            'moment': 'window.__kwirth__.moment',
            '@codemirror/view': 'window.__kwirth__.codeMirrorView',
            '@codemirror/state': 'window.__kwirth__.codeMirrorState',
            '@codemirror/commands': 'window.__kwirth__.codeMirrorCommands',
            '@codemirror/search': 'window.__kwirth__.codeMirrorSearch',
            '@codemirror/language': 'window.__kwirth__.codeMirrorLanguage',
            '@codemirror/lang-yaml': 'window.__kwirth__.codeMirrorLangYaml',
            '@codemirror/theme-one-dark': 'window.__kwirth__.codeMirrorThemeOneDark',
            '@uiw/react-codemirror': 'window.__kwirth__.uiwReactCodeMirror',
            '@jfvilas/react-file-manager': 'window.__kwirth__.jfvilasReactFileManager',

        }
        for (const pkg of Object.keys(globals)) {
            build.onResolve({ filter: new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({ path: pkg, namespace: 'kwirth-globals' }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: `const _m = ${globals[args.path]}; module.exports = (typeof _m === 'function' && !_m.__esModule) ? Object.assign({default:_m,__esModule:true},_m) : _m;`,
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
            '@kwirthmagnify/kwirth-common-ai': 'global.__kwirth_back__.kwirthCommonAi',
            '@kwirthmagnify/kwirth-common-ai/back': 'global.__kwirth_back__.kwirthCommonAiBack',
        }
        build.onResolve({ filter: /^@kwirthmagnify\/kwirth-common(-ai(\/back)?|-back)?$/ }, (args) => {
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
    outfile: 'dist/back.js', external: ['express'],
    loader: { '.ts': 'ts' }, minify: false,
})

await frontCtx.watch()
await backCtx.watch()
console.log('[watch] Watching src/ — rebuilds on every change.')
