#!/usr/bin/env node
import { createInterface } from 'readline/promises'
import fs from 'fs'
import path from 'path'

// Modo no interactivo: en cuanto llega --id no se pregunta nada, util para CI y para repetir un scaffold.
const argv = process.argv.slice(2)
const flag = (n) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 && i + 1 < argv.length && !argv[i + 1].startsWith('--') ? argv[i + 1] : undefined
}
const hasFlag = (n) => argv.includes(`--${n}`)

if (hasFlag('help')) {
    console.log(`
Usage: node tools/create-kwirth-provider.mjs [options]

With no options the script asks everything interactively. Passing --id skips every
prompt and takes the remaining values from the flags (or their defaults).

  --id <kebab-case>         provider id, e.g. my-provider
  --name <text>             display name
  --publisher <@scope>      npm scope (default @my-scope)
  --description <text>      one-line description
  --website <url>           optional website
  --router                  expose a public HTTP ingest router
  --config <mode>           none | schema | front   (default schema)
  --help                    this text
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
    console.log('\n── Kwirth provider scaffold ────────────────────────────────\n')
    console.log('A provider is a BACKEND-ONLY extension: it produces events and fans them')
    console.log('out to the channels that subscribe to it. It has no tab and no UI of its')
    console.log('own beyond an optional configuration dialog.\n')
}

const id          = flag('id') ?? await ask('Provider ID (kebab-case, e.g. my-provider)')
const defaultName = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' ') + ' Provider'
const name        = flag('name') ?? await ask('Display name', defaultName)
const publisher   = flag('publisher') ?? await ask('Publisher scope (e.g. @my-scope)', '@my-scope')
const description = flag('description') ?? await ask('Description', `${name} for Kwirth`)
const website     = flag('website') ?? await ask('Website URL (optional)', '')

if (interactive) {
    console.log('\nA public router lets external agents POST data into the provider. It is mounted')
    console.log('at {clusterUrl}/provider/<id> WITHOUT accessKey validation (protect it yourself).')
}
const wantsRouter = interactive ? await askYesNo('Expose a public HTTP ingest router?', 'n') : hasFlag('router')

if (interactive) {
    console.log('\nConfiguration modes:')
    console.log('  none   - the provider has no configurable options')
    console.log('  schema - export a field list; kwirth renders a generic dialog and calls configure()')
    console.log('  front  - your own React dialog + a private configRouter (full control)')
}
const configMode  = (flag('config') ?? await ask('Configuration mode (none/schema/front)', 'schema')).toLowerCase()
if (rl) rl.close()

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Error: Provider ID must be lowercase kebab-case (e.g. my-provider)')
    process.exit(1)
}
if (!['none', 'schema', 'front'].includes(configMode)) {
    console.error(`Error: Unknown configuration mode '${configMode}' (expected none, schema or front)`)
    process.exit(1)
}

const className   = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('')
const constPrefix = id.toUpperCase().replace(/-/g, '_')
const npmName     = `${publisher}/kwirth-provider-${id}`
const providerDir = path.resolve('providers', id)

const hasFront   = configMode === 'front'
const hasSchema  = configMode === 'schema'
// configRouter y router publico son dos vias distintas, pero ambas necesitan express bundleado.
const usesExpress = wantsRouter || hasFront

if (fs.existsSync(providerDir)) {
    console.error(`Error: Directory already exists: ${providerDir}`)
    process.exit(1)
}

// ─── package.json ──────────────────────────────────────────────────────────

const websiteLine = website ? `\n    "website": "${website}",` : ''
const runtimeDeps = [
    '        "@kwirthmagnify/kwirth-common-back": "^0.5.42"',
    ...(usesExpress ? ['        "express": "^4.19.2"'] : [])
].join(',\n')
const devDeps = [
    '        "@types/node": "^20.12.13"',
    ...(usesExpress ? ['        "@types/express": "^4.17.21"'] : []),
    ...(hasFront ? [
        '        "@types/react": "^18.3.0"',
        '        "@types/react-dom": "^18.3.0"',
        '        "@mui/material": "^7.1.2"',
        '        "@mui/icons-material": "^7.1.2"'
    ] : []),
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
        "watch": "node watch.mjs"
    },
    "dependencies": {
${runtimeDeps}
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
        "lib": [${hasFront ? '"ES2020", "DOM"' : '"ES2020"'}],
        "types": ["node"],${hasFront ? '\n        "jsx": "react",' : ''}
        "skipLibCheck": true,
        "esModuleInterop": true
    },
    "include": ["src"]
}
`)

// ─── .gitignore ────────────────────────────────────────────────────────────

write('.gitignore', `node_modules
dist
`)

// ─── build.mjs / watch.mjs ─────────────────────────────────────────────────

// El core resuelve express desde su propio runtime: bundlearlo rompe el binario de escritorio.
const backGlobalsPlugin = `
// Map express to the host's shared instance so the provider also loads inside the desktop binary.
const kwirthBackGlobalsPlugin = {
    name: 'kwirth-back-globals',
    setup(build) {
        build.onResolve({ filter: /^express$/ }, () => ({ path: 'express', namespace: 'kwirth-back-globals' }))
        build.onLoad({ filter: /.*/, namespace: 'kwirth-back-globals' }, () => ({
            contents: 'module.exports = global.__kwirth_back__.express;',
            loader: 'js',
        }))
    },
}
`

// React y MUI los pone la pagina anfitriona: bundlearlos rompe @emotion y dispara el peso.
const frontGlobalsPlugin = `
// Front deps come from the host page (kwirth globals): never bundle react/MUI into a provider.
const kwirthGlobalsPlugin = {
    name: 'kwirth-globals',
    setup(build) {
        const globals = {
            'react': 'window.__kwirth__.React',
            '@mui/material': 'window.__kwirth__.MUI.material',
            '@mui/icons-material': 'window.__kwirth__.MUI.icons',
            '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
        }
        build.onResolve({ filter: /^(react|@mui\\/material|@mui\\/icons-material|@kwirthmagnify\\/kwirth-common)$/ }, (args) => ({
            path: args.path, namespace: 'kwirth-globals',
        }))
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: \`module.exports = \${globals[args.path]}\`, loader: 'js',
        }))
    },
}
`

const backBuildOptions = `    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',${usesExpress ? '\n    plugins: [kwirthBackGlobalsPlugin],' : ''}
    loader: { '.ts': 'ts' },
    minify: false,`

const frontBuildOptions = `    entryPoints: ['src/front/index.tsx'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    plugins: [kwirthGlobalsPlugin],
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    minify: false,`

const distMetaBlock = `const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
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
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))`

write('build.mjs', `import esbuild from 'esbuild'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
${usesExpress ? backGlobalsPlugin : ''}${hasFront ? frontGlobalsPlugin : ''}
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
${hasFront ? `
await esbuild.build({
${frontBuildOptions}
})
console.log('Built dist/front.js')
` : ''}
${distMetaBlock}
console.log('Wrote dist/package.json')

console.log("Done. Run 'npm publish --access=public' on your 'dist' folder to publish to npmjs.")
console.log(\`Installable on Kwirth via: https://registry.npmjs.org/\${meta.name}/-/kwirth-provider-\${meta.id}-\${meta.version}.tgz\`)
`)

write('watch.mjs', `import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'
${usesExpress ? backGlobalsPlugin : ''}${hasFront ? frontGlobalsPlugin : ''}
fs.mkdirSync('dist', { recursive: true })

${distMetaBlock}

const backCtx = await esbuild.context({
${backBuildOptions}
})
await backCtx.watch()
${hasFront ? `
const frontCtx = await esbuild.context({
${frontBuildOptions}
})
await frontCtx.watch()
` : ''}
console.log('[watch] Watching src/ — dist rebuilds on every change.')
console.log('[watch] kwirth reloads the provider back.js on restart of the core.')
`)

// ─── src/common/<Name>Types.ts ─────────────────────────────────────────────

const configFields = [
    '    /** Seconds between two heartbeat events. */',
    '    intervalSeconds: number',
    ...(wantsRouter ? [
        '    /** Bearer token external agents must present on the public ingest route. Empty = open. */',
        '    ingestToken: string'
    ] : [])
].join('\n')

const configDefaults = [
    '    intervalSeconds: 10',
    ...(wantsRouter ? ['    ingestToken: \'\''] : [])
].join(',\n')

write(`src/common/${className}Types.ts`, `/**
 * Types shared between the back (event production) and, when there is one, the front
 * configuration dialog. Keep this file free of node and browser imports.
 */

/** Storage keys used by the provider. String unions live as enums so back and front cannot drift. */
export enum E${className}StorageKey {
    CONFIG = '${id}-config'
}

/** An event this provider dispatches to its subscribers. */
export interface I${className}Event {
    /** Logical grouping the event belongs to. Subscribers filter by it. */
    space: string
    timestamp: number
    payload: Record<string, unknown>
}

/**
 * Payload a channel passes to addSubscriber. Describe it in getSubscriptionHelp so provider-debug
 * (and any channel offering a provider picker) can explain it to the user.
 */
export interface I${className}Subscription {
    /** Spaces the subscriber is interested in. Empty or absent means "everything". */
    spaces?: string[]
}

/** Provider-wide configuration. */
export interface I${className}Config {
${configFields}
}

export const ${constPrefix}_DEFAULT_CONFIG: I${className}Config = {
${configDefaults}
}
`)

// ─── src/back/index.ts ─────────────────────────────────────────────────────

const backImports = [
    ...(usesExpress ? ["import express, { Request, Response } from 'express'"] : []),
    `import { IProvider, ${hasSchema ? 'IProviderFieldDef, ' : ''}IProviderStorage, IProviderSubscriber, IProviderSubscriptionHelp, KwirthData } from '@kwirthmagnify/kwirth-common-back'`,
    `import { E${className}StorageKey, I${className}Config, I${className}Event, I${className}Subscription, ${constPrefix}_DEFAULT_CONFIG } from '../common/${className}Types'`
].join('\n')

const schemaExport = hasSchema ? `
/**
 * Configuration fields kwirth renders in the generic provider dialog. IProviderFieldDef is the
 * contract every extension shares — senders, webhooks, idps and logins describe their fields
 * with exactly this type.
 *
 * The same array is published twice on purpose:
 *   - getConfigSchema() on the class below is the STANDARD way, identical to ISender.getConfigSchema.
 *     The core asks the live provider instance for it.
 *   - this module-level 'schema' export is the fallback the core reads at install time, without
 *     instantiating anything. It is what keeps the dialog working for a provider kwirth never
 *     instantiates: one with no router that no channel has subscribed to.
 */
export const schema: IProviderFieldDef[] = [
    { name: 'intervalSeconds', label: 'Heartbeat interval (seconds)', type: 'number', required: true, default: 10 },${wantsRouter ? `
    { name: 'ingestToken', label: 'Ingest token', type: 'password', default: '' },` : ''}
]
` : ''

const configureMethod = hasSchema ? `
    /** The standard way to declare a configuration schema, the same one ISender and IWebhook use. */
    getConfigSchema = (): IProviderFieldDef[] => schema

    /**
     * Called by the core at instantiation with whatever the generic dialog saved. Never trust the
     * shape: the values come from a form and from previous versions of this schema.
     */
    configure = (config: Record<string, unknown>): void => {
        if (typeof config['intervalSeconds'] === 'number' && config['intervalSeconds'] > 0) this.config.intervalSeconds = config['intervalSeconds']${wantsRouter ? `
        if (typeof config['ingestToken'] === 'string') this.config.ingestToken = config['ingestToken']` : ''}
    }
` : ''

const routerBlock = wantsRouter ? `
    /**
     * Public ingest route. The core mounts it at {clusterUrl}/provider/${id} WITHOUT accessKey
     * validation, so external agents can reach it: authenticate it yourself.
     */
    private buildRouter = (): void => {
        this.router.use(express.json({ limit: '4mb' }))
        this.router.post('/', (req: Request, res: Response) => {
            if (this.config.ingestToken) {
                const auth = String(req.headers['authorization'] ?? '')
                if (auth !== \`Bearer \${this.config.ingestToken}\`) return void res.status(401).json({ error: 'Invalid ingest token' })
            }
            const space = typeof req.body?.space === 'string' ? req.body.space : 'default'
            const payload = (req.body?.payload ?? {}) as Record<string, unknown>
            this.dispatch({ space, timestamp: Date.now(), payload })
            res.json({ ok: true })
        })
    }
` : ''

const configRouterBlock = hasFront ? `
    /**
     * Management route. The core mounts it BEHIND accessKey validation at
     * '/core/providerconfig/${id}', which is what the configuration dialog calls.
     */
    private buildConfigRouter = (): void => {
        this.configRouter.use(express.json())
        this.configRouter.get('/config', (_req: Request, res: Response) => {
            res.json(this.config)
        })
        this.configRouter.put('/config', async (req: Request, res: Response) => {
            const incoming = req.body as Partial<I${className}Config>
            if (typeof incoming.intervalSeconds === 'number' && incoming.intervalSeconds > 0) this.config.intervalSeconds = incoming.intervalSeconds${wantsRouter ? `
            if (typeof incoming.ingestToken === 'string') this.config.ingestToken = incoming.ingestToken` : ''}
            await this.saveConfig()
            this.restartTimer()
            res.json({ ok: true })
        })
    }

    /** Shown on the provider card in the extension manager. Names only, never values. */
    getConfigNames = (): string[] => ['default']
` : ''

const constructorBody = [
    `        console.log(\`[\${PROVIDER_ID}] Instantiating provider\`)`,
    '        this.storage = storage',
    ...(wantsRouter ? ['        this.buildRouter()'] : []),
    ...(hasFront ? ['        this.buildConfigRouter()'] : [])
].join('\n')

write('src/back/index.ts', `${backImports}

export * from '../common/${className}Types'

const PROVIDER_ID = '${id}'
${schemaExport}
export class ${className}Provider implements IProvider {
    public readonly id = PROVIDER_ID
    public readonly providesRouter = ${wantsRouter}
    public router = ${wantsRouter ? 'express.Router()' : 'undefined'}
    public routerAlias = ${wantsRouter ? 'PROVIDER_ID' : 'undefined'}${hasFront ? '\n    public configRouter = express.Router()' : ''}
    public readonly requiresApiKeyApi = false
    public apiKeyApi = undefined

    private subscribers = new Map<IProviderSubscriber, I${className}Subscription>()
    private storage: IProviderStorage | undefined
    private config: I${className}Config = { ...${constPrefix}_DEFAULT_CONFIG }
    private timer: NodeJS.Timeout | undefined

    constructor(_clusterInfo: unknown, _kwirthData: KwirthData, storage?: IProviderStorage) {
${constructorBody}
    }

    /**
     * A channel subscribes passing its own filter. Store the payload: dispatch() decides per
     * subscriber what it should receive, the provider never fans out blindly.
     */
    addSubscriber = async (subscriber: IProviderSubscriber, data: I${className}Subscription): Promise<void> => {
        this.subscribers.set(subscriber, data ?? {})
    }

    removeSubscriber = async (subscriber: IProviderSubscriber): Promise<void> => {
        this.subscribers.delete(subscriber)
    }

    /** Optional: lets a channel change its filter without unsubscribing and subscribing again. */
    updateSubscription = async (subscriber: IProviderSubscriber, data: I${className}Subscription): Promise<void> => {
        if (this.subscribers.has(subscriber)) this.subscribers.set(subscriber, data ?? {})
    }

    /** Optional, but it is what makes the provider self-explanatory in provider-debug. */
    getSubscriptionHelp = (): IProviderSubscriptionHelp => ({
        usage: 'Subscribe with the list of spaces you care about. An empty list (or no "spaces" field at all) delivers every event the provider produces.',
        example: { spaces: ['default'] },
        fields: [
            { name: 'spaces', type: 'string[]', required: false, description: 'Spaces to receive. Empty or absent means all of them.' }
        ]
    })

    startProvider = async (): Promise<void> => {
        await this.loadConfig()
        this.restartTimer()
        console.log(\`[\${PROVIDER_ID}] Provider started\`)
    }

    stopProvider = async (): Promise<void> => {
        if (this.timer) clearInterval(this.timer)
        this.timer = undefined
        this.subscribers.clear()
        console.log(\`[\${PROVIDER_ID}] Provider stopped\`)
    }
${configureMethod}${routerBlock}${configRouterBlock}
    /** Sends an event to every subscriber whose filter accepts it. */
    private dispatch = (event: I${className}Event): void => {
        for (const [subscriber, subscription] of this.subscribers.entries()) {
            if (subscription.spaces && subscription.spaces.length > 0 && !subscription.spaces.includes(event.space)) continue
            try {
                subscriber.processProviderEvent(PROVIDER_ID, event)
            }
            catch (err) {
                // Un subscriber que revienta no puede tumbar la difusion al resto.
                console.log(\`[\${PROVIDER_ID}] Subscriber threw while processing an event: \${err}\`)
            }
        }
    }

    /** Sample producer: replace it with whatever this provider really observes. */
    private restartTimer = (): void => {
        if (this.timer) clearInterval(this.timer)
        this.timer = setInterval(() => {
            this.dispatch({ space: 'default', timestamp: Date.now(), payload: { message: '${name} heartbeat' } })
        }, this.config.intervalSeconds * 1000)
    }

    private loadConfig = async (): Promise<void> => {
        if (!this.storage) return
        try {
            const stored = await this.storage.readStorage(E${className}StorageKey.CONFIG, false)
            if (stored) this.config = { ...${constPrefix}_DEFAULT_CONFIG, ...stored as I${className}Config }
        }
        catch (err) {
            console.log(\`[\${PROVIDER_ID}] Could not read stored config: \${err}\`)
        }
    }

    private saveConfig = async (): Promise<void> => {
        if (!this.storage) return
        // 'secret' decide el destino: true -> Secret de Kubernetes, false -> ConfigMap.
        await this.storage.writeStorage(E${className}StorageKey.CONFIG, ${wantsRouter ? 'true' : 'false'}, this.config)
    }
}

export default ${className}Provider
`)

// ─── src/front (only in 'front' configuration mode) ────────────────────────

if (hasFront) {
    write('src/front/index.tsx', `import ${className}ConfigDialog from './${className}ConfigDialog'

declare global { interface Window { __kwirth_providers__: Record<string, unknown> } }

// kwirth loads this bundle when the user opens the provider card and renders ConfigDialog.
window.__kwirth_providers__ = window.__kwirth_providers__ ?? {}
window.__kwirth_providers__['${id}'] = { ConfigDialog: ${className}ConfigDialog }
`)

    const tokenField = wantsRouter ? `
                    <TextField
                        label='Ingest token'
                        type={showToken ? 'text' : 'password'}
                        value={config.ingestToken}
                        onChange={(e) => setConfig(prev => ({ ...prev, ingestToken: e.target.value }))}
                        helperText='Bearer token external agents must present. Empty means the ingest route is open.'
                        InputProps={{ endAdornment:
                            <InputAdornment position='end'>
                                <IconButton onClick={() => setShowToken(!showToken)} edge='end'>
                                    {showToken ? <VisibilityOff /> : <Visibility />}
                                </IconButton>
                            </InputAdornment>
                        }}
                    />` : ''

    const tokenImports = wantsRouter
        ? `import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Stack, TextField, Typography } from '@mui/material'
import { Visibility, VisibilityOff } from '@mui/icons-material'`
        : `import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'`

    write(`src/front/${className}ConfigDialog.tsx`, `import React, { useEffect, useState } from 'react'
${tokenImports}
import { I${className}Config, ${constPrefix}_DEFAULT_CONFIG } from '../common/${className}Types'

interface I${className}ConfigDialogProps {
    onClose: () => void
    backendUrl: string
    accessString: string
}

// The core mounts the provider configRouter here, behind accessKey validation.
const CONFIG_URL = (backendUrl: string) => \`\${backendUrl}/core/providerconfig/${id}/config\`

const authHeaders = (accessString: string) => ({
    Authorization: accessString ? \`Bearer \${accessString}\` : '',
    'Content-Type': 'application/json',
    'X-Kwirth-App': 'true',
})

const ${className}ConfigDialog: React.FC<I${className}ConfigDialogProps> = ({ onClose, backendUrl, accessString }) => {
    const [config, setConfig] = useState<I${className}Config>({ ...${constPrefix}_DEFAULT_CONFIG })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | undefined>()${wantsRouter ? '\n    const [showToken, setShowToken] = useState(false)' : ''}

    useEffect(() => {
        fetch(CONFIG_URL(backendUrl), { headers: authHeaders(accessString) })
            .then(r => r.ok ? r.json() : Promise.reject(\`HTTP \${r.status}\`))
            .then((data: I${className}Config) => setConfig(prev => ({ ...prev, ...data })))
            .catch(err => setError(\`Failed to load config: \${err}\`))
            .finally(() => setLoading(false))
    }, [])

    const save = async () => {
        setSaving(true)
        setError(undefined)
        try {
            const res = await fetch(CONFIG_URL(backendUrl), { method: 'PUT', headers: authHeaders(accessString), body: JSON.stringify(config) })
            if (!res.ok) throw new Error(\`HTTP \${res.status}\`)
            onClose()
        }
        catch (err) {
            setError(\`Failed to save: \${err}\`)
        }
        finally {
            setSaving(false)
        }
    }

    // Un campo vacio no debe convertirse en 0: se conserva el valor previo hasta que escriban un numero.
    const setInterval = (value: string) => {
        const parsed = Number(value)
        if (value === '' || Number.isNaN(parsed)) return
        setConfig(prev => ({ ...prev, intervalSeconds: parsed }))
    }

    return (
        <Dialog open={true} maxWidth={false} sx={{ '& .MuiDialog-paper': { width: '520px', minHeight: '320px' } }}>
            <DialogTitle>Configure: ${name}</DialogTitle>
            <DialogContent sx={{ pt: '16px !important' }}>
                {loading
                    ? <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}><CircularProgress size={24} /></Box>
                    : <Stack spacing={2}>
                        <TextField
                            label='Heartbeat interval (seconds)'
                            type='number'
                            value={config.intervalSeconds}
                            onChange={(e) => setInterval(e.target.value)}
                        />${tokenField}
                        {error && <Typography variant='body2' color='error'>{error}</Typography>}
                      </Stack>
                }
            </DialogContent>
            <DialogActions>
                <Button variant='contained' disabled={loading || saving} onClick={save}>
                    {saving ? <CircularProgress size={14} /> : 'Save'}
                </Button>
                <Button onClick={onClose}>Cancel</Button>
            </DialogActions>
        </Dialog>
    )
}

export default ${className}ConfigDialog
`)
}

// ─── README.md ─────────────────────────────────────────────────────────────

const readmeConfigSection = {
    none: `This provider has no configurable options. Everything it needs is hardcoded or derived
from the subscription payload.`,
    schema: `The provider exports a \`schema\` array from \`src/back/index.ts\`. kwirth reads it and renders a
generic configuration dialog on the provider card — no front bundle needed. Whatever the user
saves is handed back to \`configure()\` the next time the provider is instantiated, so the core
must be restarted for a change to take effect.

| Field | Type | Description |
|---|---|---|
| \`intervalSeconds\` | number | Seconds between two heartbeat events |${wantsRouter ? `
| \`ingestToken\` | password | Bearer token required on the public ingest route |` : ''}`,
    front: `The provider ships its own React dialog (\`dist/front.js\`) and its own management router.
kwirth mounts \`configRouter\` behind accessKey validation at \`/core/providerconfig/${id}\`, and the
dialog reads and writes \`GET|PUT /core/providerconfig/${id}/config\`. Changes are persisted through
\`IProviderStorage\` and applied live — no restart needed.

| Field | Type | Description |
|---|---|---|
| \`intervalSeconds\` | number | Seconds between two heartbeat events |${wantsRouter ? `
| \`ingestToken\` | password | Bearer token required on the public ingest route |` : ''}`
}[configMode]

const readmeRouterSection = wantsRouter ? `
## Public ingest endpoint

The core mounts the public router at \`{clusterUrl}/provider/${id}\` **without accessKey
validation**, so external agents can reach it. It is the provider's job to authenticate the
caller — this skeleton does it with a bearer token.

\`\`\`
POST {clusterUrl}/provider/${id}
Content-Type: application/json
Authorization: Bearer <ingestToken>        # only when an ingest token is configured

{
    "space": "default",
    "payload": { "anything": "you want" }
}
\`\`\`

Response: \`{ "ok": true }\`
` : ''

write('README.md', `# ${name}

${description}

Installable kwirth **provider**: a backend-only extension that produces events and fans them out
to the channels that subscribe to it. A provider has no tab of its own${hasFront ? ' — only a configuration dialog' : ''}.

## Subscription

A channel subscribes by calling \`addSubscriber(subscriber, data)\`, where \`data\` is:

\`\`\`json
{
    "spaces": ["default"]
}
\`\`\`

\`spaces\` is optional: empty or absent means "every event". The provider publishes this contract
through \`getSubscriptionHelp()\`, which is what \`provider-debug\` shows the user.

Events delivered to \`processProviderEvent(providerId, event)\` look like:

\`\`\`json
{
    "space": "default",
    "timestamp": 1717000000000,
    "payload": { "message": "${name} heartbeat" }
}
\`\`\`

## Configuration

${readmeConfigSection}
${readmeRouterSection}
## Development

\`\`\`
npm install
npm run watch          # rebuilds dist on every change
\`\`\`

Register the provider in \`back/kwirth-dev.json\` so the core picks it up as a dev provider:

\`\`\`json
"providers": {
    "${id}": "../providers/${id}/dist"
}
\`\`\`

## Publishing

\`\`\`
npm run build
cd dist
npm publish --access=public
\`\`\`

The tarball published from \`dist\` is what kwirth installs, and \`dist/package.json\` carries
\`extensionType: "provider"\`, which is how the extension manager classifies it.

## Layout

\`\`\`
src/common/${className}Types.ts    types shared by back and front — no node, no browser imports
src/back/index.ts${' '.repeat(Math.max(1, className.length + 6))}the provider itself; default export is the class the core instantiates${hasFront ? `
src/front/index.tsx${' '.repeat(Math.max(1, className.length + 4))}registers the dialog on window.__kwirth_providers__
src/front/${className}ConfigDialog.tsx   the configuration dialog` : ''}
\`\`\`
`)

// ─── done ──────────────────────────────────────────────────────────────────

console.log(`
✓ Provider scaffolded at providers/${id}/

Next steps:
  cd providers/${id}
  npm install
  npm run watch                    # dev mode
  npm run build                    # one-shot build

  Add it to back/kwirth-dev.json so the core loads it in dev:
      "providers": { "${id}": "../providers/${id}/dist" }

  Publish when ready:
      cd dist && npm publish --access=public
`)

// ─── helpers ───────────────────────────────────────────────────────────────

function write(file, content) {
    const fullPath = path.join(providerDir, file)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    console.log(`  wrote ${file}`)
}
