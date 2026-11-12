import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { swaggerUiAssetsPlugin } from './assets-plugin.mjs'

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
    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    plugins: [kwirthBackGlobalsPlugin, swaggerUiAssetsPlugin],
    external: ['express'],
    loader: { '.ts': 'ts' },
    minify: false,
})
// The core keeps a DCE's code in a ConfigMap (gzipped, 800 KB at most) or fetches it from its source at every start.
const gzipped = (await import('zlib')).gzipSync(fs.readFileSync('dist/back.js')).toString('base64').length
console.log(`dist/back.js: ${Math.round(fs.statSync('dist/back.js').size / 1024)} KB, ${Math.round(gzipped / 1024)} KB gzipped in base64 (ConfigMap limit 800 KB)`)
console.log('Built dist/back.js')

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
        The contract travels with the package, so a consumer types getDce<ISwaggerUi>() by depending on the
        PUBLISHED version (or declaring it locally), never on a file: link into this repo. It names express's
        RequestHandler, hence the dependency on its types. Kwirth installs the DCE from back.js and never runs npm.
    */
    types: 'index.d.ts',
    dependencies: {
        '@types/express': meta.devDependencies['@types/express'],
    },
    license: 'Apache-2.0',
    homepage: 'https://kwirthmagnify.dev',
    repository: { type: 'git', url: 'git+https://github.com/kwirthmagnify/kwirth.git', directory: 'dces/swagger-ui' },
    keywords: ['kwirth', 'kubernetes', 'dce', 'swagger', 'swagger-ui', 'openapi'],
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

// The contract is types only, so its source IS a valid declaration file.
fs.copyFileSync(path.join('src', 'common', 'index.ts'), path.join('dist', 'index.d.ts'))
console.log('Copied the contract to dist/index.d.ts')

// Swagger UI's licence goes with its code.
fs.copyFileSync(path.join('node_modules', 'swagger-ui-dist', 'LICENSE'), path.join('dist', 'LICENSE-swagger-ui'))
console.log('Copied Swagger UI\'s LICENSE to dist/')

// The package page on npm is this README: publishing without it leaves a page that says nothing.
fs.copyFileSync('README.md', path.join('dist', 'README.md'))
console.log('Copied README.md to dist/')

console.log('')
console.log('A change in back.js needs the kwirth back restarted: the core calls a DCE factory once, at load.')
