import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// maps the @kwirthmagnify/kwirth-common(-back) imports onto the back-end global (they are not bundled;
// openid-client and the rest are provided by the core), as with every other kwirth extension.
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
    entryPoints: ['src/index.ts'],
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
console.log('Built dist/back.js')

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = {
    type: 'commonjs',
    extensionType: 'idp',
    id: meta.id,
    name: meta.name,
    displayName: meta.displayName,
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {}),
    ...(meta.publishConfig ? { publishConfig: meta.publishConfig } : {}),
    requiresRestart: meta.requiresRestart ?? false,
    requiresExtension: meta.requiresExtension ?? [],
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

// The publish goes out of dist/, so a README that stays at the root never reaches npm: the package
// lands on the registry with no page at all. It is copied, not optional — a published package without
// a README says nothing about what it is or how it gets installed into Kwirth.
if (fs.existsSync('README.md')) {
    fs.copyFileSync('README.md', path.join('dist', 'README.md'))
    console.log('Copied README.md')
}
else {
    console.error('README.md missing — the published package would have no page on npm')
    process.exit(1)
}

console.log(`Done. Run 'npm publish' on your 'dist' folder to publish to npmjs.`)
