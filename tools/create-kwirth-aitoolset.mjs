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
Usage: node tools/create-kwirth-aitoolset.mjs [options]

With no options the script asks everything interactively. Passing --id skips every
prompt and takes the remaining values from the flags (or their defaults).

  --id <kebab-case>         toolset id, e.g. my-toolset
  --name <text>             display name
  --publisher <@scope>      npm scope (default @my-scope)
  --description <text>      one-line description
  --website <url>           optional website
  --capabilities <list>     what the host must lend: k8s,metrics,events,repos (comma separated,
                            empty for a toolset that needs nothing)
  --tool <snake_case>       name of the first tool (default depends on the capability)
  --effect <read|write>     what the first tool does to the world (default read)
  --sensitivity <public|internal>
                            who may be offered it (default public; internal with repos)
  --verify                  also write verify.mjs, to run the tools against a REAL cluster (k8s only)
  --help                    this text
`)
    process.exit(0)
}

const CAPS = ['k8s', 'metrics', 'events', 'repos']

const interactive = !flag('id')
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined
const ask = (q, def) => interactive
    ? rl.question(def ? `${q} [${def}]: ` : `${q}: `).then(v => v.trim() || def || '')
    : Promise.resolve(def || '')
const askYesNo = async (q, def) => /^y/i.test(await ask(`${q} (y/n)`, def))

if (interactive) {
    console.log('\n── Kwirth AI toolset scaffold ──────────────────────────────\n')
    console.log('An AI toolset is a BACKEND-ONLY extension: a package of tools that a model')
    console.log('can call while it investigates. It has no UI at all — it is installed once')
    console.log('and then GRANTED to the plugins allowed to use it.\n')
}

const id          = flag('id') ?? await ask('Toolset ID (kebab-case, e.g. my-toolset)')
const defaultName = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' ')
const name        = flag('name') ?? await ask('Display name', defaultName)
const publisher   = flag('publisher') ?? await ask('Publisher scope (e.g. @my-scope)', '@my-scope')
const description = flag('description') ?? await ask('Description', `${name} tools for Kwirth`)
const website     = flag('website') ?? await ask('Website URL (optional)', '')

if (interactive) {
    console.log('\nCapabilities are what the host LENDS to your tools, and kwirth provisions only')
    console.log('what you declare — a toolset that declares nothing receives only trace():')
    console.log('  k8s      - cluster identity, node map and the core/apps/networking clients')
    console.log('  metrics  - the metric samples the core keeps in memory')
    console.log('  events   - the cluster event buffer')
    console.log('  repos    - source repository credentials (GitHub / GitLab)')
}
const capsRaw = flag('capabilities') ?? await ask('Capabilities (comma separated, empty for none)', 'k8s')
const caps = capsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)

const primary = caps[0] ?? 'none'
const defaultTool = { k8s: 'list_namespaces', metrics: 'get_latest_usage', events: 'get_recent_events', repos: 'list_repo_hosts', none: 'echo_back' }[primary]

const toolName    = flag('tool') ?? await ask('Name of the first tool (snake_case)', defaultTool)
const effect      = (flag('effect') ?? await ask('What it does to the world (read/write)', 'read')).toLowerCase()
const sensDefault = caps.includes('repos') ? 'internal' : 'public'
const sensitivity = (flag('sensitivity') ?? await ask('Who may be offered it (public/internal)', sensDefault)).toLowerCase()

const wantsVerify = caps.includes('k8s')
    ? (interactive ? await askYesNo('Also write verify.mjs, to run the tools against a REAL cluster?', 'y') : hasFlag('verify'))
    : false
if (rl) rl.close()

// ─── validacion ────────────────────────────────────────────────────────────

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Error: Toolset ID must be lowercase kebab-case (e.g. my-toolset)')
    process.exit(1)
}
const malas = caps.filter(c => !CAPS.includes(c))
if (malas.length) {
    console.error(`Error: Unknown capability '${malas.join(', ')}' (expected ${CAPS.join(', ')})`)
    process.exit(1)
}
if (!/^[a-z][a-z0-9_]*$/.test(toolName)) {
    console.error('Error: Tool name must be lowercase snake_case (e.g. list_namespaces)')
    process.exit(1)
}
if (!['read', 'write'].includes(effect)) {
    console.error(`Error: Unknown effect '${effect}' (expected read or write)`)
    process.exit(1)
}
if (!['public', 'internal'].includes(sensitivity)) {
    console.error(`Error: Unknown sensitivity '${sensitivity}' (expected public or internal)`)
    process.exit(1)
}

const npmName    = `${publisher}/kwirth-aitoolset-${id}`
const toolsetDir = path.resolve('aitoolsets', id)
const camelId    = id.split('-').map((s, i) => i ? s[0].toUpperCase() + s.slice(1) : s).join('')

if (fs.existsSync(toolsetDir)) {
    console.error(`Error: Directory already exists: ${toolsetDir}`)
    process.exit(1)
}

const usesK8s   = caps.includes('k8s')
const effectRef = effect === 'write' ? 'EToolEffect.WRITE' : 'EToolEffect.READ'
const sensRef   = sensitivity === 'internal' ? 'EToolSensitivity.INTERNAL' : 'EToolSensitivity.PUBLIC'
const requires  = caps.length ? caps.map(c => `ECapability.${c.toUpperCase()}`).join(', ') : ''

// ─── package.json ──────────────────────────────────────────────────────────

const websiteLine = website ? `\n    "website": "${website}",` : ''
const devDeps = [
    ...(usesK8s ? ['        "@kubernetes/client-node": "^1.4.0"'] : []),
    '        "@types/node": "^20.12.13"',
    '        "esbuild": "^0.27.2"',
    '        "typescript": "^5.4.0"'
].join(',\n')

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
        "test": "node --test tests/*.test.mjs"
    },
    "dependencies": {
        "@kwirthmagnify/kwirth-common-ai": "^0.5.58"
    },
    "devDependencies": {
${devDeps}
    },
    "requiresRestart": false,
    "requiresExtension": []
}
`)

// ─── tsconfig.json ─────────────────────────────────────────────────────────

write('tsconfig.json', `{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "lib": ["ES2020"],
        "types": ["node"],
        "skipLibCheck": true,
        "esModuleInterop": true
    },
    "include": ["src"]
}
`)

write('.gitignore', `node_modules/
dist/
build/
*.js.map
`)

// ─── build.mjs ─────────────────────────────────────────────────────────────

write('build.mjs', `import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// The common packages are NOT bundled: the core's back-end global serves them, as with every other
// kwirth extension. That way a toolset does not drag its own copy of zod or common-ai, and uses exactly
// the same one as the core — which is what makes the registry a single one.
const kwirthBackGlobalsPlugin = {
    name: 'kwirth-back-globals',
    setup(build) {
        const backGlobals = {
            '@kwirthmagnify/kwirth-common': 'global.__kwirth_back__.kwirthCommon',
            '@kwirthmagnify/kwirth-common-back': 'global.__kwirth_back__.kwirthCommonBack',
            '@kwirthmagnify/kwirth-common-ai': 'global.__kwirth_back__.kwirthCommonAi',
            '@kwirthmagnify/kwirth-common-ai/back': 'global.__kwirth_back__.kwirthCommonAiBack',
        }
        build.onResolve({ filter: /^@kwirthmagnify\\/kwirth-common(-back|-ai|-ai\\/back)?$/ }, (args) => {
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
    extensionType: 'aitoolset',
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

// ⚠️ The core does NOT watch an aitoolset's dist: it reads it ONCE, at startup. Building is not enough.
console.log('')
console.log('Restart the kwirth back to load this build — AI toolsets have no hot reload.')
`)

// ─── src/index.ts ──────────────────────────────────────────────────────────

// Each capability brings its own example: the scaffold has to COMPILE and pass its harness exactly as
// it comes out, and for that the sample tool must really use what the toolset declares.
const ejemplos = {
    k8s: {
        importa: 'IK8sCapability',
        guarda: `const k8s = (host: IToolHost, toolName: string, args: Record<string, unknown>): IK8sCapability => {
    host.trace(toolName, args)
    if (!host.k8s) throw new Error(\`[${id}] '\${toolName}' needs cluster access and the host did not provide it\`)
    return host.k8s
}`,
        schema: 'z.object({})',
        cuerpo: `                const c = k8s(host, '${toolName}', {})
                try {
                    const resp = await c.coreApi.listNamespace()
                    return {
                        cluster: c.name,
                        namespaces: resp.items.map(ns => ns.metadata?.name).filter(Boolean)
                    }
                }
                catch (err) { return { error: err instanceof Error ? err.message : String(err) } }`,
        descr: 'Lists the namespaces of the cluster this channel is pointed at.'
    },
    metrics: {
        importa: 'IMetricsCapability',
        guarda: `const metrics = (host: IToolHost, toolName: string, args: Record<string, unknown>): IMetricsCapability => {
    host.trace(toolName, args)
    if (!host.metrics) throw new Error(\`[${id}] '\${toolName}' needs metrics and the host did not provide them\`)
    return host.metrics
}`,
        schema: 'z.object({})',
        cuerpo: `                const m = metrics(host, '${toolName}', {})
                // The most recent sample goes at the END of the buffer.
                const last = m.samples[m.samples.length - 1]
                if (!last) return { error: 'no metric samples yet: the core collects them periodically' }
                return { sample: last, samplesHeld: m.samples.length }`,
        descr: 'Returns the most recent metric sample the core holds, and how many it is keeping.'
    },
    events: {
        importa: 'IEventsCapability',
        guarda: `const events = (host: IToolHost, toolName: string, args: Record<string, unknown>): IEventsCapability => {
    host.trace(toolName, args)
    if (!host.events) throw new Error(\`[${id}] '\${toolName}' needs the event buffer and the host did not provide it\`)
    return host.events
}`,
        schema: `z.object({ limit: z.number().optional().describe('How many events to return, newest last (default 20)') })`,
        cuerpo: `                const e = events(host, '${toolName}', { limit })
                // The buffer grows at the end: the last ones are the most recent.
                const n = limit ?? 20
                return { events: e.recent.slice(-n), buffered: e.recent.length }`,
        descr: 'Returns the most recent entries of the cluster event buffer.'
    },
    repos: {
        importa: 'IReposCapability',
        guarda: `const repos = (host: IToolHost, toolName: string, args: Record<string, unknown>): IReposCapability => {
    host.trace(toolName, args)
    if (!host.repos) throw new Error(\`[${id}] '\${toolName}' needs source repository credentials and the host did not provide them\`)
    return host.repos
}`,
        schema: 'z.object({})',
        cuerpo: `                const r = repos(host, '${toolName}', {})
                // The tokens are never returned: what is useful to the model is KNOWING which hosts it can read.
                return { hosts: r.creds.map(c => ({ host: c.host, type: c.type })) }`,
        descr: 'Lists the Git hosts this channel has credentials for, so you know what can be read.'
    },
    none: {
        importa: '',
        guarda: '',
        schema: `z.object({ text: z.string().describe('Anything you want echoed back') })`,
        cuerpo: `                // Sin capabilities, el host presta unicamente la traza — y esa no se declara.
                host.trace('${toolName}', { text })
                return { text, length: text.length }`,
        descr: 'Echoes the text back. Replace it with your first real tool.'
    }
}

const ej = ejemplos[primary]
const argsFirma = primary === 'events' ? '{ limit }' : primary === 'none' ? '{ text }' : '_args'
const importsBack = ['IAiToolset', ej.importa, 'IToolHost', 'defineTool', 'z'].filter(Boolean).join(', ')
const importsCommon = ['ECapability', 'EToolEffect', 'EToolSensitivity'].filter(x => x !== 'ECapability' || caps.length).join(', ')

write('src/index.ts', `import { ${importsBack} } from '@kwirthmagnify/kwirth-common-ai/back'
import { ${importsCommon} } from '@kwirthmagnify/kwirth-common-ai'

/*
    Toolset \`${id}\` — ${description}

    Un aitoolset es un paquete de tools que un modelo puede llamar mientras investiga. No pinta nada: se
    instala una vez y despues se CONCEDE a los plugins que pueden usarlo (instalar no es conceder).

    ⚠️ El host presta SOLO lo declarado en \`requires\`: ${caps.length ? `aqui, \`${caps.join('\`, \`')}\`` : 'aqui, nada — solo la traza'}.
    Pedir una capability que no se declara no da un error de compilacion, da \`undefined\` en runtime.
*/
${ej.guarda ? '\n' + ej.guarda + '\n' : ''}
const ${camelId}: IAiToolset = {
    id: '${id}',
    version: '0.1.0',
    displayName: '${name}',
    description: '${description}',
    requires: [${requires}],
    tools: [
        defineTool({
            name: '${toolName}',
            // The MODEL reads this description, and it is all it has to decide whether to call you: say
            // when to use it and with what, not just what it does.
            description: '${ej.descr}',
            effect: ${effectRef},
            sensitivity: ${sensRef},
            inputSchema: ${ej.schema},
            execute: async (${argsFirma}, host) => {
${ej.cuerpo}
            }
        })
    ]
}

export default ${camelId}
`)

// ─── tests/tools.test.mjs ──────────────────────────────────────────────────

const mocks = {
    k8s: `/** Un cluster falso: el harness tiene que pasar en una maquina SIN cluster. */
const fakeHost = () => {
    const traced = []
    const k8s = {
        name: 'test-cluster',
        flavour: 'k3d',
        vcpus: 4,
        memory: 8 * 1024 * 1024 * 1024,
        nodes: new Map(),
        coreApi: { listNamespace: async () => ({ items: [{ metadata: { name: 'default' } }, { metadata: { name: 'kube-system' } }] }) },
        appsApi: {},
        networkApi: {}
    }
    return { traced, host: { trace: (t, a) => traced.push({ tool: t, args: a }), k8s } }
}`,
    metrics: `const fakeHost = () => {
    const traced = []
    const metrics = { samples: [{ timestamp: 1, values: {} }, { timestamp: 2, values: {} }] }
    return { traced, host: { trace: (t, a) => traced.push({ tool: t, args: a }), metrics } }
}`,
    events: `const fakeHost = () => {
    const traced = []
    const events = { recent: Array.from({ length: 30 }, (_, i) => ({ type: 'ADDED', obj: { kind: 'Event', n: i } })) }
    return { traced, host: { trace: (t, a) => traced.push({ tool: t, args: a }), events } }
}`,
    repos: `const fakeHost = () => {
    const traced = []
    const repos = { creds: [{ host: 'github.com', type: 'github', token: 'ghp_x' }] }
    return { traced, host: { trace: (t, a) => traced.push({ tool: t, args: a }), repos } }
}`,
    none: `const fakeHost = () => {
    const traced = []
    return { traced, host: { trace: (t, a) => traced.push({ tool: t, args: a }) } }
}`
}

const llamada = { k8s: '{}', metrics: '{}', events: '{ limit: 5 }', repos: '{}', none: "{ text: 'hola' }" }[primary]
const asercion = {
    k8s: `    assert.deepEqual(res.namespaces, ['default', 'kube-system'])
    assert.equal(res.cluster, 'test-cluster')`,
    metrics: `    assert.equal(res.samplesHeld, 2)
    assert.equal(res.sample.timestamp, 2)   // la mas reciente va al FINAL del buffer`,
    events: `    assert.equal(res.events.length, 5)
    assert.equal(res.buffered, 30)
    assert.equal(res.events[4].obj.n, 29)   // los ultimos son los mas recientes`,
    repos: `    assert.deepEqual(res.hosts, [{ host: 'github.com', type: 'github' }])
    assert.equal(JSON.stringify(res).includes('ghp_x'), false, 'el token no puede salir de aqui')`,
    none: `    assert.equal(res.text, 'hola')
    assert.equal(res.length, 4)`
}[primary]

const sinCapability = primary === 'none' ? '' : `
test('sin la capability provisionada, la tool lo dice', async () => {
    // The host lends ONLY what was declared: a tool that does not check its own blows up with an opaque TypeError.
    await assert.rejects(
        () => tool.execute(${llamada}, { trace: () => {} }),
        /${primary === 'repos' ? 'source repository credentials' : primary === 'k8s' ? 'cluster access' : primary}/
    )
})
`

write('tests/tools.test.mjs', `/*
    Harness del toolset \`${id}\`. Corre contra el \`dist\` CONSTRUIDO —lo mismo que carga el core— y con el
    host FALSO: \`npm test\` no puede depender de un cluster, ni de la red, ni de tener credenciales.

        npm run build && npm test
*/
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const commonAi = require('@kwirthmagnify/kwirth-common-ai')
const commonAiBack = require('@kwirthmagnify/kwirth-common-ai/back')

// The dist expects to find the common packages in the back-end global, which is how the core serves them.
globalThis.__kwirth_back__ = { kwirthCommonAi: commonAi, kwirthCommonAiBack: commonAiBack }

const toolset = require('../dist/back.js').default
const tool = toolset.tools[0]

${mocks[primary]}

// ── the contract ─────────────────────────────────────────────────────────────────────────────────────

test('el toolset declara lo que necesita, y su tool', () => {
    assert.equal(toolset.id, '${id}')
    assert.deepEqual(toolset.requires, [${caps.map(c => `commonAi.ECapability.${c.toUpperCase()}`).join(', ')}])
    assert.equal(toolset.tools.length, 1)
    assert.equal(tool.name, '${toolName}')
    assert.equal(tool.effect, commonAi.EToolEffect.${effect.toUpperCase()})
    assert.equal(tool.sensitivity, commonAi.EToolSensitivity.${sensitivity.toUpperCase()})
})
${sinCapability}
// ── what it does ─────────────────────────────────────────────────────────────────────────────────────

test('${toolName} devuelve lo que promete', async () => {
    const { host } = fakeHost()

    const res = await tool.execute(${llamada}, host)

${asercion}
})

test('toda invocacion deja traza, con sus argumentos', async () => {
    const { host, traced } = fakeHost()
    await tool.execute(${llamada}, host)
    assert.deepEqual(traced[0], { tool: '${toolName}', args: ${llamada === '{}' ? '{}' : llamada} })
})
`)

// ─── verify.mjs (optional, k8s only) ───────────────────────────────────────

if (wantsVerify) {
    const verify = [
        '/*',
        '    Prueba contra un cluster DE VERDAD, a mano. No entra en `npm test` a proposito: el harness',
        '    tiene que pasar en una maquina sin cluster, y esto necesita un kubeconfig activo.',
        '',
        '        node verify.mjs [namespace]',
        '',
        '    Usa el kubeconfig por defecto (el mismo que kubectl). Solo ejecuta tools de LECTURA.',
        '*/',
        "import { createRequire } from 'module'",
        "import { KubeConfig, CoreV1Api, AppsV1Api, NetworkingV1Api } from '@kubernetes/client-node'",
        '',
        'const require = createRequire(import.meta.url)',
        "const commonAi = require('@kwirthmagnify/kwirth-common-ai')",
        "const commonAiBack = require('@kwirthmagnify/kwirth-common-ai/back')",
        'globalThis.__kwirth_back__ = { kwirthCommonAi: commonAi, kwirthCommonAiBack: commonAiBack }',
        '',
        "const toolset = require('./dist/back.js').default",
        '',
        'const kc = new KubeConfig()',
        'kc.loadFromDefault()',
        '',
        '// El host de verdad: lo mismo que el core presta a una tool, pero montado a mano.',
        'const host = {',
        "    trace: (tool, args) => console.log('  -> ' + tool, JSON.stringify(args)),",
        '    k8s: {',
        "        name: kc.getCurrentCluster()?.name ?? 'unknown',",
        "        flavour: 'unknown',",
        '        vcpus: 0,',
        '        memory: 0,',
        '        nodes: new Map(),',
        '        coreApi: kc.makeApiClient(CoreV1Api),',
        '        appsApi: kc.makeApiClient(AppsV1Api),',
        '        networkApi: kc.makeApiClient(NetworkingV1Api)',
        '    }',
        '}',
        '',
        "const namespace = process.argv[2] ?? 'default'",
        'let ok = 0',
        'let ko = 0',
        '',
        'for (const tool of toolset.tools) {',
        '    if (tool.effect !== commonAi.EToolEffect.READ) {',
        "        console.log('~ ' + tool.name + ': SALTADA (no es de lectura)')",
        '        continue',
        '    }',
        '    try {',
        '        const res = await tool.execute({ namespace }, host)',
        '        if (res && res.error) throw new Error(res.error)',
        "        console.log('OK ' + tool.name, JSON.stringify(res).slice(0, 300))",
        '        ok++',
        '    }',
        '    catch (err) {',
        "        console.error('KO ' + tool.name + ': ' + (err instanceof Error ? err.message : err))",
        '        ko++',
        '    }',
        '}',
        '',
        "console.log('\\n' + ok + '/' + (ok + ko) + ' tools de lectura OK contra ' + host.k8s.name)",
        'process.exit(ko ? 1 : 0)',
        ''
    ]
    write('verify.mjs', verify.join('\n'))
}

// ─── README.md ─────────────────────────────────────────────────────────────

const capsTabla = caps.length
    ? caps.map(c => `| \`${c.toUpperCase()}\` | ${{ k8s: 'cluster identity, node map and the core/apps/networking clients', metrics: 'the metric samples the core keeps in memory', events: 'the cluster event buffer', repos: 'source repository credentials (GitHub / GitLab)' }[c]} |`).join('\n')
    : '| *(none)* | only `trace()`, which is lent to every tool and is never declared |'

write('README.md', `# ${name}

${description}

An **AI toolset** (\`extensionType: aitoolset\`): a backend-only package of tools that a model can call
while it investigates. It has no UI of its own.

## Tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| \`${toolName}\` | ${effect} | ${sensitivity} | ${ej.descr} |

- **effect** \`read\` never changes anything; \`write\` does, and a read-only agent refuses it.
- **sensitivity** \`public\` may be offered to anyone; \`internal\` is held back from channels that do not
  need it, even when the effect is harmless.

## What it needs from the host

| Capability | What it lends |
|---|---|
${capsTabla}

kwirth provisions **only what is declared**, so asking for something you did not declare is \`undefined\`
at runtime, not a compile error.

## Build and test

\`\`\`bash
npm install
npm run build      # typecheck + esbuild → dist/back.js (+ dist/package.json)
npm test           # harness against the built dist, with a fake host
\`\`\`
${wantsVerify ? `
Against a real cluster (not part of \`npm test\`, needs a kubeconfig):

\`\`\`bash
node verify.mjs [namespace]
\`\`\`
` : ''}
## Using it in development

1. Register it in \`back/kwirth-dev.json\` so the core picks it up:

   \`\`\`json
   "aitoolsets": { "${id}": "../aitoolsets/${id}/dist" }
   \`\`\`

2. **Restart the kwirth back.** ⚠️ AI toolsets have **no hot reload**: the core reads their \`dist\` once,
   at startup. Rebuilding is not enough, and the symptom of forgetting is a tool that answers with its
   old behaviour as if your change had not compiled.

3. **Grant it.** Installing a toolset makes it available; it does not give it to anyone. Open
   Extensions → **AI toolsets** and grant it to the plugins that may use it, or their bots will not see a
   single tool.

## Publishing

\`\`\`bash
cd dist && npm publish --access=public
\`\`\`

The tarball is just \`back.js\` + \`package.json\` — check it with \`npm pack --dry-run\` before publishing.
Then add the new version to the marketplace manifest you serve it from.
`)

// ─── final ─────────────────────────────────────────────────────────────────

console.log(`
✅ AI toolset '${id}' created at aitoolsets/${id}

  Next:
      cd aitoolsets/${id}
      npm install
      npm run build
      npm test

  Register it in back/kwirth-dev.json so the core loads it in dev:
      "aitoolsets": { "${id}": "../aitoolsets/${id}/dist" }

  ⚠️ Then RESTART THE BACK: AI toolsets have no hot reload — the core reads the dist once, at startup.

  And GRANT it in Extensions → AI toolsets: installing is not granting, and a plugin
  without the grant gets no tools at all.
`)

// ─── helpers ───────────────────────────────────────────────────────────────

function write(file, content) {
    const fullPath = path.join(toolsetDir, file)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    console.log(`  wrote ${file}`)
}
