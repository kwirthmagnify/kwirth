import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// esbuild borra los tipos sin mirarlos: sin este paso el build daria por bueno un TS roto.
// El watch.mjs no lo lleva a proposito, para que guardar siga siendo instantaneo.
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
    plugins: [kwirthBackGlobalsPlugin],
    loader: { '.ts': 'ts' },
    minify: false,
})
console.log('Built dist/back.js')

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

console.log(`Done. Run 'npm publish' on your 'dist' folder to publish to npmjs.`)
console.log(`Package will be installable on Kwirth via: https://registry.npmjs.org/${meta.publisher}/kwirth-provider-${meta.id}/-/kwirth-provider-${meta.id}-${meta.version}.tgz`)
