#!/usr/bin/env node
import { createInterface } from 'readline/promises'
import fs from 'fs'
import path from 'path'
import { artifactName, requirePublisher } from './artifact-name.mjs'

/*
    Scaffolder of a ROUTER (plans/router-extension, S5): a back-only extension that carries the core's traffic
    to a cluster with no direct path. What it generates is an ECHO router that compiles, installs and answers
    on the first try, and shows every part of the contract (IRouter): its route data, a config schema with a
    secret field, a scope, HTTP, WebSocket and its status. Replace the echo with the real carrying.
*/

const argv = process.argv.slice(2)
const flag = (n) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined
}
const hasFlag = (n) => argv.includes(`--${n}`)

if (hasFlag('help')) {
    console.log(`
Usage: node tools/create-kwirth-router.mjs [options]

With no options the script asks everything interactively. Passing --id skips every
prompt and takes the remaining values from the flags (or their defaults).

  --id <kebab-case>         router id, e.g. my-router (its traffic arrives at <rootPath>/router/<id>/)
  --name <text>             display name
  --publisher <@scope>      npm scope (required with --id)
  --description <text>      one-line description
  --website <url>           optional website
  --dir <path>              where to create it (default routers/<id>)
  --into-existing           scaffold INTO a directory that already exists, keeping every file already there
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
    console.log('\n── Kwirth router scaffold ──────────────────────────────────\n')
    console.log('A router is a BACKEND-ONLY extension that carries the core\'s traffic to a cluster')
    console.log('with no direct path. It has no tab: it is configured in the Routers manager with')
    console.log('the core\'s generic dialog, and it speaks through the core\'s log.\n')
}

const id          = flag('id') ?? await ask('Router ID (kebab-case, e.g. my-router)')
const defaultName = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' ') + ' Router'
const name        = flag('name') ?? await ask('Display name', defaultName)
requirePublisher(flag('publisher'), interactive)
const publisher   = flag('publisher') ?? await ask('Publisher scope (e.g. @my-scope)', '@my-scope')
const description = flag('description') ?? await ask('Description', `${name} for Kwirth`)
const website     = flag('website') ?? await ask('Website URL (optional)', '')
if (rl) rl.close()

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Error: Router ID must be lowercase kebab-case (e.g. my-router)')
    process.exit(1)
}

const className  = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('') + 'Router'
const npmName    = artifactName(publisher, 'router', id)
const routerDir  = path.resolve(flag('dir') ?? path.join('routers', id))
const intoExisting = hasFlag('into-existing')
const kept = []

if (fs.existsSync(routerDir) && !intoExisting) {
    console.error(`Error: Directory already exists: ${routerDir}`)
    console.error(`       Use --into-existing to scaffold into it, keeping the files already there.`)
    process.exit(1)
}

function write(file, content) {
    const fullPath = path.join(routerDir, file)
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

write('package.json', JSON.stringify({
    id,
    name: npmName,
    displayName: name,
    extensionType: 'router',
    publisher,
    version: '0.1.0',
    description,
    ...(website ? { website } : {}),
    requiresRestart: false,
    requiresExtension: [],
    scripts: {
        build: 'node build.mjs',
        watch: 'node watch.mjs'
    },
    dependencies: {
        '@kwirthmagnify/kwirth-common': '^0.5.88',
        '@kwirthmagnify/kwirth-common-back': '^0.6.16'
    },
    devDependencies: {
        '@types/express': '^4.17.21',
        '@types/node': '^20.12.13',
        esbuild: '^0.27.2',
        typescript: '^5.4.0'
    }
}, null, 4) + '\n')

write('tsconfig.json', `{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "lib": ["ES2020", "DOM"],
        "types": ["node"],
        "skipLibCheck": true,
        "esModuleInterop": true
    },
    "include": ["src"]
}
`)

write('.gitignore', `node_modules
dist
`)

// ─── build.mjs / watch.mjs ─────────────────────────────────────────────────

const buildCommon = `// The core lends its own libraries to extensions (global.__kwirth_back__): bundling them would make the
// router heavy and give it its own copy of what must be the core's (enums compared by identity, for one).
const kwirthBackGlobalsPlugin = {
    name: 'kwirth-back-globals',
    setup(build) {
        const globals = {
            '@kwirthmagnify/kwirth-common': 'global.__kwirth_back__.kwirthCommon',
            '@kwirthmagnify/kwirth-common-back': 'global.__kwirth_back__.kwirthCommonBack',
            'express': 'global.__kwirth_back__.express',
        }
        build.onResolve({ filter: /^(@kwirthmagnify\\/kwirth-common|@kwirthmagnify\\/kwirth-common-back|express)$/ }, (args) => ({ path: args.path, namespace: 'kwirth-back-globals' }))
        build.onLoad({ filter: /.*/, namespace: 'kwirth-back-globals' }, (args) => ({ contents: \`module.exports = \${globals[args.path]};\`, loader: 'js' }))
    },
}

const backOptions = {
    entryPoints: ['src/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    plugins: [kwirthBackGlobalsPlugin],
    loader: { '.ts': 'ts' },
    minify: false,
}

// What the core reads when installing: the extensionType says it is a router
const writeDistMeta = () => {
    const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
    fs.mkdirSync('dist', { recursive: true })
    fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({
        type: 'commonjs',
        extensionType: 'router',
        id: meta.id,
        name: meta.name,
        displayName: meta.displayName,
        version: meta.version,
        description: meta.description,
        ...(meta.website ? { website: meta.website } : {}),
        requiresRestart: false,
        requiresExtension: meta.requiresExtension ?? [],
    }, null, 2))
}
`

write('build.mjs', `import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

${buildCommon}
// esbuild strips types without checking them: tsc runs first and aborts a broken build
const TSC = 'node_modules/typescript/lib/tsc.js'
if (fs.existsSync(TSC)) execFileSync(process.execPath, [TSC, '--noEmit'], { stdio: 'inherit' })

await esbuild.build(backOptions)
writeDistMeta()
console.log("Done. 'npm pack' in dist/ gives the package to install in the Routers manager.")
`)

write('watch.mjs', `import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

${buildCommon}
// Point back/kwirth-dev.json "routers": { "${id}": "<path to this dist>" } at it: the core reloads it on every build
writeDistMeta()
const context = await esbuild.context(backOptions)
await context.watch()
console.log('Watching src/ ...')
`)

// ─── src/index.ts: the echo router ─────────────────────────────────────────

const source = `import { IConfigFieldDef, IExtensionScope, IRouterData } from '@kwirthmagnify/kwirth-common'
import { ERouteCallerVia, IRouteCaller, IRouter, IRouterContext, IRouterStatus, TRouterConfig } from '@kwirthmagnify/kwirth-common-back'
import { Request, Response } from 'express'
import { IncomingMessage } from 'http'

/*
    __NAME__ — a Kwirth ROUTER (generated by tools/create-kwirth-router.mjs).

    Traffic for a cluster whose cluster-list entry says { route: '__ID__', clusterUid } arrives here, at
    <rootPath>/router/__ID__/..., ALREADY AUTHENTICATED by the core: 'caller' says how (a route ticket, an
    access key, or the core's own loopback). Deciding what that caller may do through the route is yours.

    This one only ECHOES, to show every part of the contract. Replace routerRequest/routerWebsocket with the
    real carrying (a tunnel, a bastion, a proxy...).
*/

const ROUTER_ID = '__ID__'
const SCOPE_USE = \`\${ROUTER_ID}$use\`

// What its config dialog shows. A 'password' field is kept in a Secret and shown masked, with the eye.
const SCHEMA: IConfigFieldDef[] = [
    { name: 'greeting', label: 'Greeting', type: 'text', default: 'hello' },
    { name: 'secretToken', label: 'Secret token', type: 'password' }
]

export default class __CLASS__ implements IRouter {
    private config: TRouterConfig = {}
    private requests = 0

    constructor(private context: IRouterContext) {}

    // '{routeTicket}' FIRST: the core takes the ticket from there and removes it before you see the path
    getRouterData = (): IRouterData => ({ id: ROUTER_ID, pathTemplate: '/{routeTicket}/{clusterUid}', needsTicket: true })

    getConfigSchema = (): IConfigFieldDef[] => SCHEMA

    getScopeCatalog = (): IExtensionScope[] => [
        { scope: SCOPE_USE, label: '__NAME__ · Use', description: 'Use this router with an access key (back to back)' }
    ]

    startRouter = async (config: TRouterConfig): Promise<void> => {
        this.config = config
        this.context.logger.info(\`started on \${this.context.clusterName || this.context.clusterUid}\`)
    }

    applyConfig = async (config: TRouterConfig): Promise<void> => {
        this.config = config
        this.context.logger.info('config applied')
    }

    stopRouter = async (): Promise<void> => {
        this.context.logger.info('stopped')
    }

    getStatus = (): IRouterStatus => ({ started: true, detail: \`\${this.requests} request(s) echoed\` })

    // A ticket or the loopback says the core vouches for the session; an access key must carry this router's scope
    private allowed = (caller: IRouteCaller): boolean =>
        caller.via !== ERouteCallerVia.ACCESS_KEY || (caller.accessKey?.resources ?? '').split(':')[0].split(',').includes(SCOPE_USE)

    // 'req.url' is the path BELOW /router/__ID__, without the ticket: '/<clusterUid>/...'
    routerRequest = (req: Request, res: Response, caller: IRouteCaller): void => {
        if (!this.allowed(caller)) {
            res.status(403).json({ error: \`the key needs the \${SCOPE_USE} scope\` })
            return
        }
        this.requests++
        res.json({ router: ROUTER_ID, via: caller.via, method: req.method, path: req.url, greeting: this.config.greeting ?? 'hello' })
    }

    routerWebsocket = (webSocket: WebSocket, req: IncomingMessage, caller: IRouteCaller): void => {
        if (!this.allowed(caller)) {
            webSocket.close(4403, \`the key needs the \${SCOPE_USE} scope\`)
            return
        }
        webSocket.send(JSON.stringify({ router: ROUTER_ID, via: caller.via, path: req.url }))
        webSocket.addEventListener('message', (event) => webSocket.send(\`echo: \${String(event.data)}\`))
    }
}
`

write('src/index.ts', source.replaceAll('__ID__', id).replaceAll('__NAME__', name).replaceAll('__CLASS__', className))

// ─── README.md ─────────────────────────────────────────────────────────────

write('README.md', `# ${name}

${description}

A **Kwirth router**: a back-only extension that carries the core's traffic to a cluster with no direct path.
It has no tab — it is configured in Kwirth's **Routers** manager and speaks through the core's log.

## How it fits

- A cluster-list entry (*Manage clusters*) keeps the cluster's real URL plus a **route**: this router
  (\`${id}\`) and the target cluster's uid.
- Every request and WebSocket for that cluster goes to \`<rootPath>/router/${id}/…\` of **your** Kwirth. The core
  **authenticates** it and hands it to this router with who is calling (\`IRouteCaller\`): a route ticket (a browser),
  an access key in \`Authorization\` (another core's back, a script), or the core's own loopback.
- This router **authorizes** it and carries it. As generated, it only **echoes**.

## The contract (\`IRouter\`, from \`@kwirthmagnify/kwirth-common-back\`)

| Member | What for |
|---|---|
| \`getRouterData()\` | Its id, the path template (\`'/{routeTicket}/{clusterUid}'\`) and whether it needs a ticket |
| \`routerRequest(req, res, caller)\` | An HTTP request below \`/router/${id}\` — \`req.url\` without the ticket |
| \`routerWebsocket(ws, req, caller)\` | A WebSocket below \`/router/${id}\` |
| \`getConfigSchema()\` | The fields of its config dialog (\`password\` ones are kept in a Secret) |
| \`getScopeCatalog()\` | Its scopes, for the security editor (\`${id}$use\`) |
| \`startRouter\` / \`applyConfig\` / \`stopRouter\` | Its lifecycle: installing, saving the config and uninstalling need no restart |
| \`getStatus()\` | What the Routers manager shows |

## Build and install

\`\`\`
npm install
npm run build
cd dist && npm pack
\`\`\`

Install the \`.tgz\` from the **Routers** manager (*Upload*). To develop against a running Kwirth, add it to
\`back/kwirth-dev.json\` → \`"routers": { "${id}": "<path to this dist>" }\` and run \`npm run watch\`: the core reloads
it on every build.
`)

console.log(`\nRouter '${id}' created at ${routerDir}${kept.length ? ` (${kept.length} file(s) kept)` : ''}`)
console.log('Next: npm install && npm run build, then install dist/ (npm pack) from the Routers manager.')
