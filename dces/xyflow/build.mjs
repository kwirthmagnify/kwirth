import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/*
    A DCE bundles NOTHING of Kwirth's: its imports of common and common-back resolve against the
    globals the core publishes — 'window.__kwirth__' in the front end, 'global.__kwirth_back__' in the
    back end. That is what keeps the registry a single one: the DCE and its consumers see the same
    common-back, so the same getDce().

    React and ReactDOM resolve against the core's too: React Flow's hooks only work against the React
    that renders them, and its portals against the same react-dom. 'react/jsx-runtime' IS bundled, but its
    own require('react') lands on the global as well, so it builds elements for that same React.
*/
const kwirthFrontGlobalsPlugin = {
    name: 'kwirth-globals',
    setup(build) {
        const globals = {
            '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
            '@kwirthmagnify/kwirth-common-front': 'window.__kwirth__.kwirthCommonFront',
            'react': 'window.__kwirth__.React',
            'react-dom': 'window.__kwirth__.ReactDOM',
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

// esbuild erases the types without looking at them: without this step the build would pass broken TS.
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
    plugins: [kwirthFrontGlobalsPlugin],
    // The stylesheet comes in as text: the factory puts it on the page (see src/front/index.ts).
    loader: { '.ts': 'ts', '.css': 'text' },
    target: 'es2020',
    define: { 'process.env.NODE_ENV': '"production"' },
    minify: true,
})
console.log('Built dist/front.js')


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
    /*
        The contract travels with the package, so a consumer types getDce<IXyflow>() by depending on the
        PUBLISHED version, never on a file: link into this repo. It names React Flow's and elk's types,
        hence the two dependencies: they are there for the consumer's typecheck. Kwirth installs the
        DCE from front.js and never runs npm on it.
    */
    types: 'index.d.ts',
    dependencies: {
        '@xyflow/react': meta.devDependencies['@xyflow/react'],
        'elkjs': meta.devDependencies['elkjs'],
    },
    homepage: 'https://kwirthmagnify.dev',
    repository: { type: 'git', url: 'git+https://github.com/kwirthmagnify/kwirth.git', directory: 'dces/xyflow' },
    keywords: ['kwirth', 'kubernetes', 'dce', 'xyflow', 'react-flow', 'elkjs', 'graph', 'layout'],
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

// The contract is types only, so its source IS a valid declaration file.
fs.copyFileSync(path.join('src', 'common', 'index.ts'), path.join('dist', 'index.d.ts'))
console.log('Copied the contract to dist/index.d.ts')

// The package page on npm is this README: publishing without it leaves a page that says nothing.
fs.copyFileSync('README.md', path.join('dist', 'README.md'))
console.log('Copied README.md to dist/')

