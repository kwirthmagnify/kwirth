import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

/*
    express and the kwirth packages come from the host's shared instances (global.__kwirth_back__), never
    bundled. express because the configRouter is an express Router (as in host-metrics); kwirth-common-back
    because this provider imports a FUNCTION from it (createResourceWatcher), and bundling it would drag in
    @kubernetes/client-node: 15 MB, a second copy of the library (it happened to trivy). At runtime the
    function is the core's, which is also why this needs a core with kwirth-common-back 0.6.2 or later.
*/
const BACK_GLOBALS = {
    'express': 'global.__kwirth_back__.express',
    '@kwirthmagnify/kwirth-common': 'global.__kwirth_back__.kwirthCommon',
    '@kwirthmagnify/kwirth-common-back': 'global.__kwirth_back__.kwirthCommonBack',
}
const kwirthBackGlobalsPlugin = {
    name: 'kwirth-back-globals',
    setup(build) {
        build.onResolve({ filter: /^(express|@kwirthmagnify\/kwirth-common(-back)?)$/ }, (args) => ({ path: args.path, namespace: 'kwirth-back-globals' }))
        build.onLoad({ filter: /.*/, namespace: 'kwirth-back-globals' }, (args) => ({
            contents: `module.exports = ${BACK_GLOBALS[args.path]};`,
            loader: 'js',
        }))
    },
}

// esbuild STRIPS types without ever checking them, so a build with no typecheck step happily
// publishes broken TypeScript. tsc runs first and aborts the build; the watcher skips it on
// purpose, so that saving stays instant while you work.
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

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = {
    type: 'commonjs',
    extensionType: 'provider',
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

// The package page on npm is this README: publishing without it leaves a page that says nothing.
fs.copyFileSync('README.md', path.join('dist', 'README.md'))
console.log('Copied README.md to dist/')

console.log("Done. Run 'npm publish --access=public' on your 'dist' folder to publish to npmjs.")
console.log(`Installable on Kwirth via: https://registry.npmjs.org/${meta.name}/-/kwirth-provider-${meta.id}-${meta.version}.tgz`)
