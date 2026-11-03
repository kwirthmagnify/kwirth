#!/usr/bin/env node
import { createInterface } from 'readline/promises'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { artifactName, requirePublisher } from './artifact-name.mjs'

// Non-interactive mode: as soon as --id arrives nothing is asked, useful for CI and for repeating a scaffold.
const argv = process.argv.slice(2)
const flag = (n) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined
}
const hasFlag = (n) => argv.includes(`--${n}`)

if (hasFlag('help')) {
    console.log(`
Usage: node tools/create-kwirth-webhook.mjs [options]

With no options the script asks everything interactively. Passing --id skips every
prompt and takes the remaining values from the flags (or their defaults).

  --id <kebab-case>         webhook id, e.g. my-webhook
  --name <text>             display name
  --publisher <@scope>      npm scope (REQUIRED with --id)
  --description <text>      one-line description
  --website <url>           optional website
  --private                 the artifact is NOT published to public npm: the final steps say what has
                            to be done by hand to keep it out of public repositories
  --into-existing           scaffold INTO a directory that already exists, keeping every file
                            already there (each one is reported as kept, not overwritten).
                            For artifacts whose repo is created first — git, remote, README,
                            docs — and get their code afterwards.
  --help                    this text

The authentication is NOT generated: how a call is verified belongs to each source system
(a secret in a header, an HMAC of the body, Basic auth…). verify() is generated CLOSED —
it rejects every call — until you write it.
`)
    process.exit(0)
}

const interactive = !flag('id')
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : undefined
const ask = (q, def) => interactive
    ? rl.question(def ? `${q} [${def}]: ` : `${q}: `).then(v => v.trim() || def || '')
    : Promise.resolve(def || '')
const askYesNo = async (q, def) => /^y/i.test(await ask(`${q} (y/n)`, def))

if (interactive) {
    console.log('\n── Kwirth webhook scaffold ─────────────────────────────────\n')
    console.log('A webhook is a BACKEND-ONLY extension: it is the way INTO Kwirth. An external system')
    console.log('(GitLab, Jira, a ticketing tool) calls its URL, the webhook checks the call is genuine')
    console.log('and turns the payload into a normalised event for whoever subscribed to it.\n')
}

const id          = flag('id') ?? await ask('Webhook ID (kebab-case, e.g. my-webhook)')
const defaultName = id ? id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' ') + ' Webhook' : ''
const name        = flag('name') ?? await ask('Display name', defaultName)
requirePublisher(flag('publisher'), interactive)
const publisher   = flag('publisher') ?? await ask('Publisher scope (e.g. @my-scope)', '@my-scope')
const description = flag('description') ?? await ask('Description', `${name} for Kwirth`)
const website     = flag('website') ?? await ask('Website URL (optional)', '')
const isPrivate   = interactive ? await askYesNo('Private artifact (never published to public npm)?', 'n') : hasFlag('private')
if (rl) rl.close()

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Error: Webhook ID must be lowercase kebab-case (e.g. my-webhook)')
    process.exit(1)
}

const className  = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('')
const npmName    = artifactName(publisher, 'webhook', id)
const webhookDir = path.resolve('webhooks', id)

// Artifacts whose repo is born before their code -- git, remote, README, docs first, scaffold afterwards --
// need to be filled in place. With --into-existing the directory is allowed to exist and every file already
// there is KEPT (see write()), so nothing handwritten is ever lost.
const intoExisting = hasFlag('into-existing')
const kept = []   // files that were already there and therefore not written (reported at the end)

if (fs.existsSync(webhookDir) && !intoExisting) {
    console.error(`Error: Directory already exists: ${webhookDir}`)
    console.error(`       Use --into-existing to scaffold into it, keeping the files already there.`)
    process.exit(1)
}

// The generated webhook depends on the LATEST kwirth-common-back: a webhook born against an old contract
// misses whatever the contract asks for today. The fallback is only for a machine without network.
const COMMON_BACK_FALLBACK = '0.6.10'
const commonBackVersion = (() => {
    try {
        // one fixed command line: npm is a .cmd on Windows and needs a shell, and execFile+shell is deprecated
        const v = execSync('npm view @kwirthmagnify/kwirth-common-back version', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
        return /^\d+\.\d+\.\d+$/.test(v) ? v : COMMON_BACK_FALLBACK
    }
    catch {
        console.log(`  (npm registry not reachable: kwirth-common-back pinned to ${COMMON_BACK_FALLBACK})`)
        return COMMON_BACK_FALLBACK
    }
})()

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
        "test": "node tests/run.mjs",
        "watch": "node watch.mjs"
    },
    "dependencies": {
        "@kwirthmagnify/kwirth-common-back": "^${commonBackVersion}"
    },
    "devDependencies": {
        "@types/node": "^20.12.13",
        "esbuild": "^0.27.7",
        "typescript": "^5.4.0"
    },
    "requiresRestart": false,
    "requiresExtension": []
}
`)

// ─── tsconfig.json ─────────────────────────────────────────────────────────

// The tests are typechecked too: a test that does not compile is a test that silently stops proving anything.
write('tsconfig.json', `{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "lib": ["ES2020"],
        "types": ["node"],
        "skipLibCheck": true,
        "esModuleInterop": true,
        "noEmit": true
    },
    "include": ["src", "tests"]
}
`)

// ─── .gitignore ────────────────────────────────────────────────────────────

write('.gitignore', `node_modules
dist
tests/.out
`)

// ─── dist-meta.mjs / build.mjs / watch.mjs ─────────────────────────────────

// ONE function writes dist/package.json, and both build.mjs and watch.mjs import it. Two literals drift: the
// webhooks written by hand have a watch that forgot 'extensionType', so dev loads something different from
// what gets published.
write('dist-meta.mjs', `import fs from 'fs'
import path from 'path'

// The manifest Kwirth reads from dist/. build.mjs and watch.mjs BOTH call this, so the package loaded in dev
// is exactly the one that gets published.
export const writeDistMeta = () => {
    const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
    const distMeta = {
        type: 'commonjs',
        extensionType: 'webhook',
        id: meta.id,
        name: meta.name,
        displayName: meta.displayName,
        version: meta.version,
        description: meta.description,
        ...(meta.website ? { website: meta.website } : {}),
        requiresRestart: meta.requiresRestart ?? false,
        requiresExtension: meta.requiresExtension ?? [],
    }
    fs.mkdirSync('dist', { recursive: true })
    fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
    return meta
}
`)

const backBuildOptions = `    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    loader: { '.ts': 'ts' },
    minify: false,`

const publishHint = isPrivate
    ? `console.log("Done. Publish from 'dist' to your PRIVATE registry — never to public npm.")`
    : `console.log("Done. Run 'npm publish --access=public' on your 'dist' folder to publish to npmjs.")
console.log(\`Installable on Kwirth via: https://registry.npmjs.org/\${meta.name}/-/kwirth-webhook-\${meta.id}-\${meta.version}.tgz\`)`

write('build.mjs', `import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { writeDistMeta } from './dist-meta.mjs'

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
${backBuildOptions}
})
console.log('Built dist/back.js')

const meta = writeDistMeta()
console.log('Wrote dist/package.json')

// The publish runs from dist/, so the README has to be there or the package ships without it
if (fs.existsSync('README.md')) {
    fs.copyFileSync('README.md', path.join('dist', 'README.md'))
    console.log('Copied README.md to dist/')
}
else {
    console.warn('WARNING: no README.md — the published package would have none')
}

${publishHint}
`)

write('watch.mjs', `import esbuild from 'esbuild'
import { writeDistMeta } from './dist-meta.mjs'

writeDistMeta()

const ctx = await esbuild.context({
${backBuildOptions}
})
await ctx.watch()
console.log('[watch] Watching src/ — dist/back.js rebuilds on every change.')
console.log('[watch] The core loads back.js once: restart the back to pick up a change.')
`)

// ─── src/back/index.ts ─────────────────────────────────────────────────────

const backImports = [
    'IExtensionNodeMeta', 'IWebhook', 'IWebhookAccess', 'IWebhookConfig', 'IWebhookEvent', 'IWebhookFieldDef'
].join(', ')

write('src/back/index.ts', `import { ${backImports} } from '@kwirthmagnify/kwirth-common-back'

/*
    ${name}.

    ${description}
*/

export interface I${className}WebhookConfig extends IWebhookConfig {
    name: string
    // TODO: the fields verify() needs (a shared secret, an HMAC key, a user and password…), declared in
    // getConfigSchema() too. A secret goes with type 'password': masked in the UI, stored as a real value.
}

/*
    The shape of what the source system sends. The skeleton's is a made-up example matching
    tests/fixtures/sample.json; replace both with the real payload, captured from the real system.
*/
interface I${className}Payload {
    event?: string
    id?: string | number
    status?: string
}

export default class ${className}Webhook implements IWebhook {
    readonly id = '${id}'
    private configs = new Map<string, I${className}WebhookConfig>()

    addConfig(config: IWebhookConfig): void {
        this.configs.set(config.name, config as I${className}WebhookConfig)
    }

    removeConfig(name: string): void {
        this.configs.delete(name)
    }

    hasConfig(name: string): boolean {
        return this.configs.has(name)
    }

    getConfigNames(): string[] {
        return Array.from(this.configs.keys())
    }

    /*
        🔴 CLOSED until you write it: every call is rejected, and the core answers 401.

        The core only routes by the opaque token at the end of the URL; checking that the call really comes
        from the source system is THIS method's job, and how to check it belongs to that system — a secret in
        a header, an HMAC of rawBody, Basic auth… A skeleton that returned true would accept anyone's calls
        the moment it is installed, and nothing would show it. A closed one fails at the first test, which is
        what makes it get written.

        When you write it: compare with crypto.timingSafeEqual, accept a header that arrives as an array,
        and reject when the configured secret is empty. Then replace the test that pins this closed state
        with yours (right credential, wrong one, missing one).
    */
    verify(_rawBody: Buffer, _headers: Record<string, string | string[] | undefined>, _config: IWebhookConfig): boolean {
        return false
    }

    /*
        From the raw body to the normalised event. Returning null tells the core there is nothing to deliver
        (it answers 400): a payload this webhook does not understand, or an event it does not care about.

        'externalId' is what a consumer correlates by. If the matching sender returns an id when it creates
        the entity, this has to rebuild EXACTLY the same string, or the callbacks answer 200 and update
        nothing.
    */
    parse(rawBody: Buffer, _headers: Record<string, string | string[] | undefined>): Omit<IWebhookEvent, 'configName'> | null {
        let payload: I${className}Payload
        try {
            payload = JSON.parse(rawBody.toString('utf-8') || '{}') as I${className}Payload
        }
        catch {
            return null
        }
        if (payload.id === undefined || payload.id === '') return null

        return {
            provider: this.id,
            kind: payload.event ?? 'updated',
            externalId: String(payload.id),
            status: payload.status,
            receivedAt: new Date().toISOString(),
            raw: payload
        }
    }

    // Kwirth renders the configuration dialog from this list, and stores what it gets.
    getConfigSchema(): IWebhookFieldDef[] {
        return [
            { name: 'name', label: 'Name', required: true },
        ]
    }

    // 'icon' is a name from the curated set of kwirth-common-front (kwirthicons.ts); an unknown one falls back
    // to the generic icon without a word.
    getNodeMeta(): IExtensionNodeMeta {
        return { label: '${name}', icon: 'Link', description: '${description.replace(/'/g, "\\'")}' }
    }

    async startWebhook(_access: IWebhookAccess): Promise<void> {}

    async stopWebhook(): Promise<void> {
        this.configs.clear()
    }
}
`)

// ─── tests/fixtures/sample.json ────────────────────────────────────────────

write('tests/fixtures/sample.json', `{
    "event": "item.closed",
    "id": 42,
    "status": "closed"
}
`)

// ─── tests/run.mjs ─────────────────────────────────────────────────────────

write('tests/run.mjs', `// Unit test runner: bundles tests/**/*.test.ts with esbuild into tests/.out (ESM, node20) and runs them with
// \`node --test\`. The tests import straight from ../src — the real code, not dist.
import esbuild from 'esbuild'
import { readdirSync, mkdirSync, rmSync, writeFileSync } from 'fs'
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

/*
    COVERAGE=1 → ONE entry that imports every test.

    With one bundle per file, each one carries its OWN copy of src and the report treats them as different
    files: it AVERAGES those copies instead of joining them, well below the real coverage. Only with
    COVERAGE=1: a normal run is still one process per file.
*/
const ALL_ENTRY = path.join(TEST_DIR, '.coverage-all.generated.ts')
let buildEntries = entries
if (process.env.COVERAGE) {
    const imports = entries.map(e => \`import './\${path.relative(TEST_DIR, e).replace(/\\\\/g, '/')}'\`).join('\\n')
    writeFileSync(ALL_ENTRY, \`// Generated by run.mjs to measure coverage. Do NOT edit or commit.\\n\${imports}\\n\`)
    buildEntries = [ALL_ENTRY]
}

try {
    await esbuild.build({
        entryPoints: buildEntries,
        bundle: true, format: 'esm', platform: 'node', target: 'node20',
        outdir: OUT_DIR, outbase: TEST_DIR, outExtension: { '.js': '.mjs' },
        sourcemap: process.env.COVERAGE ? 'inline' : false,
        // kwirth packages resolve at runtime from node_modules, as they do inside the core
        external: ['@kwirthmagnify/kwirth-common', '@kwirthmagnify/kwirth-common-back'],
        loader: { '.ts': 'ts' },
    })
}
finally {
    if (process.env.COVERAGE) rmSync(ALL_ENTRY, { force: true })
}

// Only the test bundles — or the single coverage one. An empty list would let \`node --test\` go and discover
// files on its own, and a coverage run that measures nothing reports 100%.
const bundled = readdirSync(OUT_DIR, { recursive: true }).map(String)
    .filter(f => f.endsWith('.test.mjs') || path.basename(f).startsWith('.coverage-all.generated'))
    .map(f => path.join(OUT_DIR, f))
if (bundled.length === 0) { console.error('No test bundles were produced'); process.exit(1) }
// --enable-source-maps is what maps the report back to src/: without it the report measures the bundle
const coverageArgs = process.env.COVERAGE ? ['--enable-source-maps', '--experimental-test-coverage', '--test-coverage-exclude=**/node_modules/**', '--test-coverage-exclude=**/tests/**'] : []
try {
    execFileSync(process.execPath, ['--test', ...coverageArgs, ...bundled], { stdio: 'inherit' })
}
catch {
    process.exit(1)
}
`)

// ─── tests/<id>.test.ts ────────────────────────────────────────────────────

write(`tests/${id}.test.ts`, `import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'fs'
import ${className}Webhook from '../src/back/index'

/*
    ${name}: the tests the scaffold ships with. They prove the plumbing works — build, configurations, the
    parsing of a sample — not that the webhook is right. Add the ones that matter for its source system.
*/

// The body arrives as raw bytes, exactly as the core hands it over. Read from the working directory: npm test
// runs from the webhook's root.
const sample = (): Buffer => readFileSync('tests/fixtures/sample.json')

test('keeps its configurations by name', () => {
    const webhook = new ${className}Webhook()
    webhook.addConfig({ name: 'a' })
    webhook.addConfig({ name: 'b' })
    assert.deepEqual(webhook.getConfigNames(), ['a', 'b'])
    assert.equal(webhook.hasConfig('a'), true)
    webhook.removeConfig('a')
    assert.equal(webhook.hasConfig('a'), false)
})

test('the configuration schema starts with a required name', () => {
    const [first] = new ${className}Webhook().getConfigSchema()
    assert.equal(first.name, 'name')
    assert.equal(first.required, true)
})

/*
    🔴 This test is MEANT to break. It pins the closed state the skeleton is born in: as long as verify() has
    not been written, no call gets through. When you write the authentication this fails — replace it with
    yours: the right credential passes, a wrong one and a missing one do not.
*/
test('verify is closed until the authentication is written', () => {
    const webhook = new ${className}Webhook()
    assert.equal(webhook.verify(sample(), {}, { name: 'c' }), false)
    assert.equal(webhook.verify(sample(), { authorization: 'anything' }, { name: 'c' }), false)
})

test('parses the sample into the normalised event', () => {
    const event = new ${className}Webhook().parse(sample(), {})
    assert.ok(event)
    assert.equal(event.provider, '${id}')
    assert.equal(event.kind, 'item.closed')
    assert.equal(event.externalId, '42')
    assert.equal(event.status, 'closed')
    assert.ok(!Number.isNaN(Date.parse(event.receivedAt)))
})

test('a body that is not JSON, or has no id, is nothing to deliver', () => {
    const webhook = new ${className}Webhook()
    assert.equal(webhook.parse(Buffer.from('not json'), {}), null)
    assert.equal(webhook.parse(Buffer.from('{"event":"item.closed"}'), {}), null)
    assert.equal(webhook.parse(Buffer.from(''), {}), null)
})
`)

// ─── docs/qa/test-metrics-history.md ───────────────────────────────────────

write('docs/qa/test-metrics-history.md', `# Webhook \`${id}\` — test metrics history

> **Incremental** record of the suite, one row per release. A row is **added on top** at every close; rows
> are **never rewritten** — it is a history.
>
> - **Harness** = number of tests reported by \`npm test\`.
> - **Coverage** = \`COVERAGE=1 npm test\`.
> - **e2e** = a webhook has no UI of its own; its URL and its configuration dialog belong to the core.
>
> The two charts next to this file are generated, never drawn by hand:
> \`node tools/gen-coverage-chart.mjs <this file> <test-metrics-coverage.png> "<title>"\` (Kwirth repository).

| Date | Version / tag | Harness | Coverage (lines / branches / funcs) | e2e (specs / cases) | Notes |
|---|---|---|---|---|---|
`)

// ─── README.md ─────────────────────────────────────────────────────────────

const readmePublish = isPrivate ? `## Publishing

This is a **private** artifact: it is published to a private registry, never to public npm.

\`\`\`
npm run build
cd dist
npm publish          # against the private registry configured for ${publisher}
\`\`\`
` : `## Publishing

\`\`\`
npm run build
cd dist
npm publish --access=public
\`\`\`

The build copies this README into \`dist/\`: it is what npm shows for the package.
`

write('README.md', `# ${name}

${description}

> Website: **https://kwirthmagnify.dev** · Kwirth: **https://github.com/kwirthmagnify/kwirth**

A **webhook** for [Kwirth](https://kwirthmagnify.dev): the way into Kwirth. An external system calls its URL,
the webhook checks that the call is genuine and turns the payload into a normalised event, which Kwirth
hands to whoever subscribed to this webhook's configuration.

## Installing it

From Kwirth: **☰ → Manage extensions → Webhooks**, find **${name}** and install it. Then create a named
configuration for it: once saved, Kwirth shows its **Webhook URL**, read-only, ending in a token that
identifies that configuration.

## Registering it in the source system

TODO: where, in the source system, the Webhook URL goes, which events to enable, and what to put in its
secret or credentials so that they match this webhook's configuration.

## Configuration

| Field | Type | Description |
|---|---|---|
| \`name\` | text | the configuration name; a consumer subscribes to it |

## Development

\`\`\`
npm install
npm run watch          # rebuilds dist/back.js on every change
npm test               # harness
COVERAGE=1 npm test    # harness with coverage
\`\`\`

Register it in the core's \`back/kwirth-dev.json\` so the core loads it in dev, and restart the back after
a change:

\`\`\`json
"webhooks": {
    "${id}": "../webhooks/${id}/dist"
}
\`\`\`

${readmePublish}`)

// ─── done ──────────────────────────────────────────────────────────────────

if (kept.length > 0) {
    console.log(`
! ${kept.length} file(s) already existed and were KEPT, not overwritten:
${kept.map(f => `    ${f}`).join('\n')}
  Check them against the scaffold if the webhook does not build.`)
}

console.log(`
✓ Webhook scaffolded at webhooks/${id}/

Next steps:
  cd webhooks/${id}
  npm install
  npm test                         # the harness passes as generated
  npm run build                    # typecheck + bundle + dist/package.json + README
  npm run watch                    # dev mode

  Add it to back/kwirth-dev.json so the core loads it in dev:
      "webhooks": { "${id}": "../webhooks/${id}/dist" }

  🔴 verify() is generated CLOSED: every call gets a 401 until you write the authentication
     of the source system in src/back/index.ts.
`)

if (isPrivate) {
    // The scaffold never writes outside its own folder (PRD D4): a script of a public repository writing
    // private paths into shared files is one more way for them to end up where they must not.
    console.log(`  🔴 PRIVATE artifact — what the scaffold does NOT do for you:
      - keep webhooks/${id}/ out of the public repository: its .gitignore, and any local guard you use
      - give it its own repository, and publish only to the private registry of ${publisher}
      - list it only in the private marketplace manifest
`)
}

// ─── helpers ───────────────────────────────────────────────────────────────

function write(file, content) {
    const fullPath = path.join(webhookDir, file)
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
