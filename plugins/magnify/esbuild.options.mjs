import fs from 'fs'
import path from 'path'

/*
    The esbuild configuration of the plugin, ONE copy for build.mjs and watch.mjs. Each used to carry its
    own, and they drifted: the globals, the CSS loader and the React injection went into the build and not
    into the watch, which then tried to bundle MUI and failed.
*/

const kwirthGlobalsPlugin = {
    name: 'kwirth-globals',
    setup(build) {
        /*
            What the core already publishes on window.__kwirth__ is taken from there, never bundled: one
            React (two would break the hooks of every library that uses them), and no second copy of
            codemirror or recharts. react-dom is here because react-draggable imports it.

            The file manager comes from the `file-manager` DCE (requiresExtension), which also puts the
            library's stylesheet on the page.

            What is NOT here gets bundled: the small libraries only Magnify uses (uuid, cron-parser, lodash,
            js-yaml, react-draggable, react-resizable, react-use, clipboard-copy).
        */
        const globals = {
            'react': 'window.__kwirth__.React',
            'react-dom': 'window.__kwirth__.ReactDOM',
            '@mui/material': 'window.__kwirth__.MUI.material',
            '@mui/icons-material': 'window.__kwirth__.MUI.icons',
            '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
            '@kwirthmagnify/kwirth-common-front': 'window.__kwirth__.kwirthCommonFront',
            '@kwirthmagnify/kwirth-common-front/icons': 'window.__kwirth__.MUI.icons',
            '@codemirror/view': 'window.__kwirth__.codeMirrorView',
            '@codemirror/state': 'window.__kwirth__.codeMirrorState',
            '@codemirror/commands': 'window.__kwirth__.codeMirrorCommands',
            '@codemirror/search': 'window.__kwirth__.codeMirrorSearch',
            '@codemirror/language': 'window.__kwirth__.codeMirrorLanguage',
            '@codemirror/lang-yaml': 'window.__kwirth__.codeMirrorLangYaml',
            '@codemirror/theme-one-dark': 'window.__kwirth__.codeMirrorThemeOneDark',
            '@uiw/react-codemirror': 'window.__kwirth__.uiwReactCodeMirror',
            '@jfvilas/react-file-manager': "window.__kwirth_dce__['file-manager'].instance.fileManager",
            'recharts': 'window.__kwirth__.recharts',
        }
        for (const pkg of Object.keys(globals)) {
            build.onResolve({ filter: new RegExp(`^${pkg.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}$`) }, () => ({ path: pkg, namespace: 'kwirth-globals' }))
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

const DCE_PACKAGES = {
    '@kwirthmagnify/kwirth-dce-file-manager': 'file-manager',
}

const dceGlobal = (registry) => ({
    name: 'kwirth-dce-globals',
    setup(build) {
        // A fixed filter, and the decision inside: every DCE package shares this prefix, so there is no
        // regex to build per id — and no escaping to get wrong.
        build.onResolve({ filter: /^@kwirthmagnify\/kwirth-dce-/ }, (args) => (
            DCE_PACKAGES[args.path] ? { path: args.path, namespace: 'kwirth-dce' } : undefined
        ))
        build.onLoad({ filter: /.*/, namespace: 'kwirth-dce' }, (args) => ({
            // The instance kwirth built, never a copy of the code.
            contents: 'const _e = ' + registry + "['" + DCE_PACKAGES[args.path] + "']; module.exports = _e && _e.instance ? _e.instance : {};",
            loader: 'js',
        }))
    },
})

export const frontOptions = {
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    plugins: [kwirthGlobalsPlugin, dceGlobal('window.__kwirth_dce__')],
    // stylesheets as text: index.ts puts them on the page, a plugin being one script
    loader: { '.tsx': 'tsx', '.ts': 'ts', '.css': 'text' },
    // React in scope for JSX in every file (see src/front/react-shim.ts)
    inject: ['src/front/react-shim.ts'],
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    /*
        Minified, unlike most plugins: Magnify is some 500 KB of its own code plus the small libraries it
        bundles (cron-parser with luxon, js-yaml, react-draggable…). Unminified, and with the PNG it had
        then, it was 1.6 MB, the heaviest plugin by far. The back end stays readable.
    */
    minify: true,
}

export const backOptions = {
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
}

/** dist/package.json (what the core reads on installing) and the README the npm page shows. */
export const writeDistMeta = () => {
    fs.mkdirSync('dist', { recursive: true })
    const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
    const distMeta = {
        id: meta.id,
        name: `@kwirthmagnify/kwirth-plugin-${meta.id}`,
        displayName: meta.displayName,
        extensionType: 'plugin',
        version: meta.version,
        description: meta.description,
        icon: meta.icon,
        ...(meta.website ? { website: meta.website } : {}),
        requiresRestart: meta.requiresRestart ?? false,
        requiresExtension: meta.requiresExtension ?? [],
    }
    fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
    // The package page on npm is this README: publishing without it leaves a page that says nothing.
    fs.copyFileSync('README.md', path.join('dist', 'README.md'))
    return meta
}
