#!/usr/bin/env node
import { createInterface } from 'readline/promises'
import fs from 'fs'
import path from 'path'

// Non-interactive mode: as soon as --id arrives nothing is asked, useful for CI and for repeating a scaffold.
const argv = process.argv.slice(2)
const flag = (n) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined
}
const hasFlag = (n) => argv.includes(`--${n}`)

if (hasFlag('help')) {
    console.log(`
Usage: node tools/create-kwirth-dce.mjs [options]

With no options the script asks everything interactively. Passing --id skips every
prompt and takes the remaining values from the flags (or their defaults).

  --id <kebab-case>         DCE id, e.g. my-icons
  --name <text>             display name
  --publisher <@scope>      npm scope (default @my-scope)
  --description <text>      one-line description
  --website <url>           optional website
  --sides <back,front>      which sides it brings (default both; 'back' or 'front' for one)
  --into-existing           scaffold INTO a directory that already exists, keeping every file
                            already there (each one is reported as kept, not overwritten)
  --help                    this text
`)
    process.exit(0)
}

const interactive = !flag('id')
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined
const ask = (q, def) => interactive
    ? rl.question(def ? `${q} [${def}]: ` : `${q}: `).then(v => v.trim() || def || '')
    : Promise.resolve(def || '')

if (interactive) {
    console.log('\n── Kwirth DCE scaffold ─────────────────────────────────────\n')
    console.log('A dynamic core extension brings OBJECTS, not data and not screens: Kwirth calls')
    console.log('its factory once, keeps what it returns, and other extensions ask for it by id.')
    console.log('Code several extensions share but that does not belong in the core goes here.\n')
}

const id          = flag('id') ?? await ask('DCE ID (kebab-case, e.g. my-icons)')
const defaultName = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' ')
const name        = flag('name') ?? await ask('Display name', defaultName)
const publisher   = flag('publisher') ?? await ask('Publisher scope (e.g. @my-scope)', '@my-scope')
const description = flag('description') ?? await ask('Description', `${name}: shared objects for Kwirth extensions`)
const website     = flag('website') ?? await ask('Website URL (optional)', '')
const sidesRaw    = flag('sides') ?? await ask('Sides it brings (back,front / back / front)', 'back,front')
const sides       = sidesRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
if (rl) rl.close()

// ─── validation ────────────────────────────────────────────────────────────

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Error: DCE ID must be lowercase kebab-case (e.g. my-icons)')
    process.exit(1)
}
const badSides = sides.filter(s => s !== 'back' && s !== 'front')
if (badSides.length || !sides.length) {
    console.error(`Error: --sides takes 'back', 'front' or 'back,front' (got '${sidesRaw}')`)
    process.exit(1)
}
const hasBack  = sides.includes('back')
const hasFront = sides.includes('front')

const npmName = `${publisher}/kwirth-dce-${id}`
const dceDir  = path.resolve('dces', id)
const pascal  = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('')

const intoExisting = hasFlag('into-existing')
const kept = []

if (fs.existsSync(dceDir) && !intoExisting) {
    console.error(`Error: Directory already exists: ${dceDir}`)
    console.error(`       Use --into-existing to scaffold into it, keeping the files already there.`)
    process.exit(1)
}

function write(file, content) {
    const fullPath = path.join(dceDir, file)
    // Under --into-existing an existing file is never touched: the scaffold fills the gaps, it does not
    // overwrite. A handwritten README or a tuned build.mjs must survive being scaffolded around.
    if (intoExisting && fs.existsSync(fullPath)) {
        kept.push(file)
        console.log(`  kept  ${file} (already there)`)
        return
    }
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    console.log(`  wrote ${file}`)
}

// ─── package.json ──────────────────────────────────────────────────────────

const websiteLine = website ? `\n    "website": "${website}",` : ''
write('package.json', `{
    "id": "${id}",
    "name": "${npmName}",
    "publisher": "${publisher}",
    "version": "0.1.0",
    "displayName": "${name}",
    "description": "${description}",${websiteLine}
    "type": "module",
    "scripts": {
        "build": "node build.mjs",
        "watch": "node watch.mjs",
        "test": "node tests/run.mjs"
    },
    "dependencies": {
        "@kwirthmagnify/kwirth-common": "^0.5.59"${hasBack ? `,
        "@kwirthmagnify/kwirth-common-back": "^0.5.56"` : ''}
    },
    "devDependencies": {
        "@types/node": "^20.12.13",
        "esbuild": "^0.27.2",
        "typescript": "^5.4.0"
    },
    "requiresRestart": true,
    "requiresExtension": []
}
`)

write('tsconfig.json', `{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "lib": ["ES2020"${hasFront ? ', "DOM"' : ''}],
        "types": ["node"],
        "skipLibCheck": true,
        "esModuleInterop": true
    },
    "include": ["src"]
}
`)

write('.gitignore', `node_modules/
dist/
tests/.out/
*.js.map
`)

// ─── the shared contract ───────────────────────────────────────────────────

write('src/common/index.ts', `/*
    What DCE \`${id}\` hands its consumers, on both ends.

    Consumers import THIS file for the types only: at runtime they get the instance the core keeps,
    through getDce<I${pascal}>('${id}'). Keep it an interface plus a factory, so back and front build the
    same shape and the harness can build one without a host.
*/
export interface I${pascal} {
    /** The DCE's id, as the core installed it. */
    id: string
    /** Replace with what this DCE really shares: a client, a registry, an icon set… */
    greet(name: string): string
}

export const create${pascal} = (id: string): I${pascal} => ({
    id,
    greet: (name: string) => \`Hello \${name}, from DCE '\${id}'\`
})
`)

// ─── back ──────────────────────────────────────────────────────────────────

if (hasBack) write('src/back/index.ts', `import { IDceBack, IDceBackHost } from '@kwirthmagnify/kwirth-common-back'
import { I${pascal}, create${pascal} } from '../common/index'

/*
    The back end of DCE \`${id}\`.

    It exports a FACTORY, not an object: the core calls create() once, hands it the host (logger,
    scoped configMaps and secrets, the core's libs) and keeps what it returns in
    \`global.__kwirth_dce__['${id}']\`. A consumer gets it with getDce<I${pascal}>('${id}').

    The host's stores are scoped to this DCE: whatever you persist cannot clash with the core or with
    another DCE. A change in this file needs the Kwirth back end restarted — the factory runs once.
*/
const dce: IDceBack<I${pascal}> = {
    create: async (host: IDceBackHost): Promise<I${pascal}> => {
        host.logger.info('${id} created')
        return create${pascal}(host.id)
    }
}

export default dce
`)

// ─── front ─────────────────────────────────────────────────────────────────

if (hasFront) write('src/front/index.ts', `import { DCE_FRONT_FACTORIES } from '@kwirthmagnify/kwirth-common'
import { create${pascal} } from '../common/index'

/*
    The front end of DCE \`${id}\`.

    A front script cannot be handed a host as a parameter, so the handshake is a registration: the
    script leaves its factory at \`window.__kwirth_dce_factories__['${id}']\`, and the core's loader
    calls create() once and writes the result into \`window.__kwirth_dce__['${id}']\`, where a consumer
    reads it with getDce() from common-front.
*/
type TFactories = Record<string, { create: () => unknown }>

const w = window as unknown as Record<string, TFactories | undefined>
const factories = (w[DCE_FRONT_FACTORIES] ??= {})
factories['${id}'] = { create: () => create${pascal}('${id}') }
`)

// ─── build.mjs / watch.mjs ─────────────────────────────────────────────────

const globalsPlugins = `/*
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
            build.onResolve({ filter: new RegExp(\`^\${pkg.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')}$\`) }, () => ({ path: pkg, namespace: 'kwirth-globals' }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: \`const _m = \${globals[args.path]}; module.exports = Object.assign({}, _m, { default: _m, __esModule: true });\`,
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
        build.onResolve({ filter: /^@kwirthmagnify\\/kwirth-common(-back)?$/ }, (args) => {
            if (backGlobals[args.path]) return { path: args.path, namespace: 'kwirth-back-globals' }
        })
        build.onLoad({ filter: /.*/, namespace: 'kwirth-back-globals' }, (args) => ({
            contents: 'module.exports = ' + backGlobals[args.path],
            loader: 'js',
        }))
    },
}
`

const frontBuild = (ctx) => hasFront ? `
${ctx ? 'const frontCtx = await esbuild.context' : 'await esbuild.build'}({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    plugins: [kwirthFrontGlobalsPlugin],
    loader: { '.ts': 'ts' },
    target: 'es2020',
    minify: false,
})
${ctx ? '' : "console.log('Built dist/front.js')"}` : ''

const backBuild = (ctx) => hasBack ? `
${ctx ? 'const backCtx = await esbuild.context' : 'await esbuild.build'}({
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
${ctx ? '' : "console.log('Built dist/back.js')"}` : ''

const distMeta = `const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
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
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))`

write('build.mjs', `import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

${globalsPlugins}
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
${frontBuild(false)}
${backBuild(false)}

${distMeta}
console.log('Wrote dist/package.json')

// The package page on npm is this README: publishing without it leaves a page that says nothing.
fs.copyFileSync('README.md', path.join('dist', 'README.md'))
console.log('Copied README.md to dist/')
${hasBack ? `
console.log('')
console.log('A change in back.js needs the kwirth back restarted: the core calls a DCE factory once, at load.')` : ''}
`)

write('watch.mjs', `import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

// The same as build.mjs, but watching src/. Without the typecheck, on purpose: saving stays instantaneous;
// types are checked in build.mjs, which is the one used for publishing. The globals have to be THE SAME.
${globalsPlugins}
fs.mkdirSync('dist', { recursive: true })

${distMeta}
${frontBuild(true)}
${backBuild(true)}
${hasFront ? 'await frontCtx.watch()' : ''}
${hasBack ? 'await backCtx.watch()' : ''}

console.log('[watch] Watching src/ — dist rebuilds on every change.')
${hasBack ? "console.log('[watch] The front is re-read on every request; a change in back.js needs the core RESTARTED (the factory runs once).')" : ''}
`)

// ─── tests ─────────────────────────────────────────────────────────────────

write('tests/run.mjs', `// Unit test runner (the same pattern as the plugins): it bundles tests/**/*.test.ts with esbuild into
// tests/.out (ESM node20) and runs \`node --test\`. The tests import straight from ../src.
import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'

const TEST_DIR = 'tests'
const OUT_DIR = 'tests/.out'

const entries = readdirSync(TEST_DIR, { recursive: true })
    .map(String)
    .filter(f => f.endsWith('.test.ts'))
    .map(f => path.join(TEST_DIR, f))

if (entries.length === 0) { console.log('No tests (tests/**/*.test.ts).'); process.exit(0) }

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

await esbuild.build({
    entryPoints: entries,
    bundle: true, format: 'esm', platform: 'node', target: 'node20',
    outdir: OUT_DIR, outbase: TEST_DIR, outExtension: { '.js': '.mjs' },
    external: ['@kwirthmagnify/kwirth-common', '@kwirthmagnify/kwirth-common-back'],
    loader: { '.ts': 'ts' },
})

const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.mjs')).map(f => path.join(OUT_DIR, f))
try { execFileSync('node', ['--test', ...bundled], { stdio: 'inherit' }) }
catch { process.exit(1) }
`)

write('tests/dce.test.ts', `// DCE \`${id}\`: the object it hands out${hasBack ? ', and what its back-end factory does with the host' : ''}.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { create${pascal} } from '../src/common/index'
${hasBack ? `import dce from '../src/back/index'
import { IDceBackHost, IDceStore } from '@kwirthmagnify/kwirth-common-back'

/** A host in memory: the factory only needs to read and write keys and to log. */
const fakeHost = (): { host: IDceBackHost, logged: string[] } => {
    const store = new Map<string, unknown>()
    const logged: string[] = []
    const memory: IDceStore = {
        read: async (name, def) => store.has(name) ? store.get(name) : def,
        write: async (name, data) => { store.set(name, data) }
    }
    const host: IDceBackHost = {
        id: '${id}',
        logger: { info: m => logged.push(String(m)), warning: m => logged.push(String(m)), error: m => logged.push(String(m)) },
        configMaps: memory,
        secrets: memory,
        libs: {}
    }
    return { host, logged }
}
` : ''}
test('greet names the DCE by its installed id', () => {
    assert.equal(create${pascal}('${id}').greet('kwirth'), "Hello kwirth, from DCE '${id}'")
})
${hasBack ? `
test('the back-end factory builds the object from the host and says so in the log', async () => {
    const { host, logged } = fakeHost()
    const instance = await dce.create(host)
    assert.equal(instance.id, '${id}')
    assert.match(logged[0], /${id} created/)
})` : ''}
`)

// ─── README ────────────────────────────────────────────────────────────────

write('README.md', `# ${name}

A **dynamic core extension** (DCE) for [Kwirth](https://kwirthmagnify.dev): ${description}

A DCE brings **objects**, not data and not screens: Kwirth calls its factory **once**, keeps what it returns, and any other extension can ask for it by id.

## Consuming it

Declare the dependency in the consumer's \`package.json\`, with the minimum version:

\`\`\`json
"requiresExtension": ["dce:${id}:0.1.0"]
\`\`\`
${hasBack ? `
In the back end:

\`\`\`ts
import { getDce } from '@kwirthmagnify/kwirth-common-back'
import { I${pascal} } from '${npmName}/src/common'
const ${id.replace(/-/g, '_')} = getDce<I${pascal}>('${id}')   // throws if it is not loaded, and says why
\`\`\`
` : ''}
## Building

\`\`\`
npm install
npm run build      # typecheck + dist
npm run watch      # rebuild on every save
npm test
\`\`\`

Install it from **☰ → Manage extensions → DCE** in Kwirth. Updating a DCE needs the Kwirth back end **restarted**.

Part of [Kwirth](https://github.com/kwirthmagnify/kwirth).
`)

console.log('')
console.log(`DCE '${id}' scaffolded at ${dceDir}`)
if (kept.length) console.log(`  (${kept.length} file(s) already there were kept)`)
console.log('')
console.log('Next:')
console.log(`  cd dces/${id} && npm install && npm run build && npm test`)
console.log(`  add it to back/kwirth-dev.json under "dces": { "${id}": "../dces/${id}/dist" } and restart the back`)
