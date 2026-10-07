import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
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
            build.onResolve({ filter: new RegExp(`^${pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }, () => ({
                path: pkg, namespace: 'kwirth-globals',
            }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: `module.exports = ${globals[args.path]}`, loader: 'js',
        }))
    },
}

// express is mapped onto the host's shared instance (the back-global). The core loads the extension's
// back end from /tmp, where there are no node_modules: a require('express') there does not resolve and
// the back end fails to start. ⛔ That is why express can NOT go in 'external': in esbuild, external
// beats plugins and would leave the require unmapped.
const kwirthBackGlobalsPlugin = {
    name: 'kwirth-back-globals',
    setup(build) {
        const backGlobals = { express: 'global.__kwirth_back__.express' }
        build.onResolve({ filter: /^express$/ }, (args) => backGlobals[args.path] ? { path: args.path, namespace: 'kwirth-back-globals' } : undefined)
        build.onLoad({ filter: /.*/, namespace: 'kwirth-back-globals' }, (args) => ({
            contents: `module.exports = ${backGlobals[args.path]}`, loader: 'js',
        }))
    },
}

// esbuild erases the types without looking at them: without this step the build would pass broken TS.
// watch.mjs deliberately leaves it out, so that saving stays instantaneous.
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
    plugins: [kwirthBackGlobalsPlugin],
    loader: { '.ts': 'ts' },
    minify: false,
})
console.log('Built dist/back.js')

// The front end (the configuration dialog) is optional during development: while it does not exist,
// only the back end is built and the provider manager does not offer the gear icon.
if (fs.existsSync('src/front/index.tsx')) {
    await esbuild.build({
        entryPoints: ['src/front/index.tsx'],
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
}
else {
    console.log('No src/front/index.tsx yet — skipping front build')
}

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
// publishConfig.access=public: a scoped package is published PRIVATE by default and npm answers
// 402 Payment Required. Declaring it here saves having to remember the --access flag on every publish.
const distMeta = { type: 'commonjs', extensionType: 'provider', publishConfig: { access: 'public' },
    id: meta.id,
    name: meta.name,
    displayName: meta.displayName,
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {}),
    requiresRestart: meta.requiresRestart ?? false,
    requiresExtension: meta.requiresExtension ?? [],
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

// El publish sale de dist/, asi que el README tiene que estar AHI o el paquete se publica sin el:
// npm solo recoge automaticamente el que esta junto al package.json que publica.
if (fs.existsSync('README.md')) {
    fs.copyFileSync('README.md', path.join('dist', 'README.md'))
    console.log('Copied README.md to dist/')
}
else {
    console.warn('WARNING: no README.md — the published package would have none')
}
console.log("Done. Run 'npm publish' from your 'dist' folder to publish to npmjs.")
