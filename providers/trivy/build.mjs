import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

/*
    The trivy-operator manifest is 131 KB of YAML that has to travel INSIDE back.js: it is what the
    provider applies when somebody installs the operator, and there is nowhere to read it from at
    runtime. It is gzipped into a base64 string at build time and unpacked on first use.

    It came from the plugin, which carried it while the Manage button lived there.
*/
const yamlGzipPlugin = {
    name: 'yaml-gzip',
    setup(build) {
        build.onLoad({ filter: /\.yaml$/ }, (args) => {
            const content = fs.readFileSync(args.path)
            const compressed = zlib.gzipSync(content).toString('base64')
            return { contents: `module.exports = "${compressed}"`, loader: 'js' }
        })
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

/*
    The common packages come from the global the core publishes; they are not bundled.

    This provider imports createCrdInformer from kwirth-common-back, which is a FUNCTION and not a
    type, so esbuild resolved the whole package — and inside it sits KubernetesTools, which imports
    @kubernetes/client-node. The result was a 15 MB back.js carrying the entire Kubernetes client,
    openid-client and rxjs included, while the core already has it loaded. Importing only TYPES costs
    nothing (the compiler erases them); one function is enough to drag in the whole barrel.

    ⚠️ This resolves at RUNTIME: an artifact built this way needs a core that publishes
    'global.__kwirth_back__'. That is already the case for the other providers on this pattern.
*/
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

await esbuild.build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    external: ['express'],
    plugins: [kwirthBackGlobalsPlugin, yamlGzipPlugin],
    loader: { '.ts': 'ts' },
    minify: false,
})
console.log('Built dist/back.js')

/*
    The front is what the gear of the providers manager opens, and it is optional: while src/front does
    not exist the core paints that gear disabled ('No configuration available'), which is exactly what
    this provider showed until it took over managing the operator.

    It brings neither React nor MUI: it takes them from the ones the core has already loaded.
*/
if (fs.existsSync('src/front/index.tsx')) {
    const kwirthFrontGlobalsPlugin = {
        name: 'kwirth-front-globals',
        setup(build) {
            const globals = {
                'react': 'window.__kwirth__.React',
                '@mui/material': 'window.__kwirth__.MUI.material',
                '@mui/icons-material': 'window.__kwirth__.MUI.icons',
                '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
                '@kwirthmagnify/kwirth-common-front': 'window.__kwirth__.kwirthCommonFront',
            }
            build.onResolve({ filter: /.*/ }, (args) => {
                if (globals[args.path]) return { path: args.path, namespace: 'kwirth-globals' }
            })
            build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
                contents: 'module.exports = ' + globals[args.path],
                loader: 'js',
            }))
        },
    }
    await esbuild.build({
        entryPoints: ['src/front/index.tsx'],
        bundle: true,
        format: 'iife',
        outfile: 'dist/front.js',
        plugins: [kwirthFrontGlobalsPlugin],
        loader: { '.tsx': 'tsx', '.ts': 'ts' },
        minify: false,
    })
    console.log('Built dist/front.js')
}
else {
    console.log('No src/front/index.tsx yet — skipping front build')
}

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = { type: 'commonjs', extensionType: 'provider',
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

console.log(`Done. Run 'npm publish' on your 'dist' folder to publish to npmjs.`)
console.log(`Package will be installable on Kwirth via: https://registry.npmjs.org/${meta.publisher}/kwirth-provider-${meta.id}/-/kwirth-provider-${meta.id}-${meta.version}.tgz`)
