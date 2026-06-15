#!/usr/bin/env node
import { createInterface } from 'readline/promises'
import fs from 'fs'
import path from 'path'

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q, def) => rl.question(def ? `${q} [${def}]: ` : `${q}: `).then(v => v.trim() || def || '')

console.log('\n── Kwirth daemon scaffold ──────────────────────────────────\n')

const id          = await ask('Daemon ID (kebab-case, e.g. my-daemon)')
const name        = await ask('Display name', id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '))
const description = await ask('Description', `${name} daemon for Kwirth`)
const website     = await ask('Website URL (optional)', '')
rl.close()

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Error: Daemon ID must be lowercase kebab-case (e.g. my-daemon)')
    process.exit(1)
}

const className = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('')
const daemonDir = path.resolve('daemons', id)

if (fs.existsSync(daemonDir)) {
    console.error(`Error: Directory already exists: ${daemonDir}`)
    process.exit(1)
}

fs.mkdirSync(path.join(daemonDir, 'src', 'back'), { recursive: true })

// ─── package.json ──────────────────────────────────────────────────────────────

const websiteLine = website ? `\n    "website": "${website}",` : ''
write('package.json', `{
    "id": "${id}",
    "name": "${name}",
    "publisher": "@kwirthmagnify",
    "version": "0.1.0",
    "description": "${description}",${websiteLine}
    "type": "module",
    "scripts": {
        "build": "node build.mjs",
        "watch": "node watch.mjs"
    },
    "dependencies": {
        "@kwirthmagnify/kwirth-common": "^0.5.14",
        "@kwirthmagnify/kwirth-common-back": "^0.5.12"
    },
    "devDependencies": {
        "@types/node": "^20.12.13",
        "esbuild": "^0.27.2",
        "typescript": "^5.4.0"
    }
}
`)

// ─── tsconfig.json ─────────────────────────────────────────────────────────────

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
        "paths": {
            "@kwirthmagnify/kwirth-common": ["../../common/src/index.ts"],
            "@kwirthmagnify/kwirth-common-back": ["../../common-back/src/index.ts"]
        }
    },
    "include": ["src"]
}
`)

// ─── build.mjs ─────────────────────────────────────────────────────────────────

const websiteDistLine = website ? `\n    ...(meta.website ? { website: meta.website } : {}),` : ''
write('build.mjs', `import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

fs.mkdirSync('dist', { recursive: true })

await esbuild.build({
    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    external: ['express'],
    loader: { '.ts': 'ts' },
    minify: false,
})
console.log('Built dist/back.js')

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const distMeta = {
    id: meta.id,
    name: \`@kwirthmagnify/kwirth-daemon-\${meta.id}\`,
    displayName: meta.name,
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {}),
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

const npmName = \`@kwirthmagnify/kwirth-daemon-\${meta.id}\`
console.log("Done. Run 'npm publish --access=public' on your 'dist' folder to publish to npmjs.")
console.log(\`URL: https://registry.npmjs.org/\${npmName}/-/kwirth-daemon-\${meta.id}-\${meta.version}.tgz\`)
`)

// ─── watch.mjs ─────────────────────────────────────────────────────────────────

write('watch.mjs', `import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

fs.mkdirSync('dist', { recursive: true })

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({
    id: meta.id,
    name: \`@kwirthmagnify/kwirth-daemon-\${meta.id}\`,
    displayName: meta.name,
    version: meta.version,
    description: meta.description,
    ...(meta.website ? { website: meta.website } : {}),
}, null, 2))

const backCtx = await esbuild.context({
    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    external: ['express'],
    loader: { '.ts': 'ts' },
    minify: false,
})

await backCtx.watch()

console.log('[watch] Watching src/ — back.js rebuilds on every change.')
console.log('[watch] kwirth backend hot-reloads back.js automatically.')
`)

// ─── src/back/index.ts ─────────────────────────────────────────────────────────

write('src/back/index.ts', `import {
    IDaemonInstanceConfig, BackDaemonData, IBackDaemonRequirements,
    IBackDaemonObject, IDaemonEvent
} from '@kwirthmagnify/kwirth-common'
import { IDaemon } from '@kwirthmagnify/kwirth-common-back'

export enum E${className}Command {
    // Add your daemon-specific commands here
    // EXAMPLE = 'example',
}

interface IDaemonInstance {
    instanceId: string
    subscribers: Set<(event: unknown) => void>
}

export class ${className}Daemon implements IDaemon {
    readonly daemonId = '${id}'
    readonly requirements: IBackDaemonRequirements = { storage: false, providers: [] }

    private clusterInfo: unknown
    private backDaemonObject: IBackDaemonObject
    private instances = new Map<string, IDaemonInstance>()

    constructor(clusterInfo: unknown, backDaemonObject: IBackDaemonObject) {
        this.clusterInfo = clusterInfo
        this.backDaemonObject = backDaemonObject
    }

    getDaemonData = (): BackDaemonData => ({ id: this.daemonId })

    startDaemon = async (): Promise<void> => {
        console.log('[${id}-daemon] startDaemon')
    }

    async initInstance(instanceConfig: IDaemonInstanceConfig): Promise<void> {
        console.log(\`[${id}-daemon] initInstance \${instanceConfig.id}\`)
    }

    addObject = async (instanceConfig: IDaemonInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        console.log(\`[${id}-daemon] addObject \${podNamespace}/\${podName}/\${containerName}\`)
        if (!this.instances.has(instanceConfig.id))
            this.instances.set(instanceConfig.id, { instanceId: instanceConfig.id, subscribers: new Set() })
        return true
    }

    deleteObject = async (_cfg: IDaemonInstanceConfig, _ns: string, _pod: string, _ctr: string): Promise<boolean> => true

    containsInstance = (instanceId: string): boolean => this.instances.has(instanceId)

    containsAsset = (_instanceId: string, _ns: string, _pod: string, _ctr: string): boolean => false

    stopInstance = (instanceId: string): void => {
        this.instances.delete(instanceId)
        console.log(\`[${id}-daemon] stopInstance \${instanceId}\`)
    }

    processProviderEvent = (_providerId: string, _event: unknown): void => {}

    processCommand = async (_instanceId: string, _command: string, _data: unknown): Promise<unknown> => {
        return null
    }

    subscribe = (instanceId: string, callback: (event: unknown) => void): () => void => {
        let inst = this.instances.get(instanceId)
        if (!inst) {
            inst = { instanceId, subscribers: new Set() }
            this.instances.set(instanceId, inst)
        }
        inst.subscribers.add(callback)
        return () => inst!.subscribers.delete(callback)
    }

    private broadcast = (instanceId: string, type: string, data: unknown): void => {
        const inst = this.instances.get(instanceId)
        if (!inst) return
        const event: IDaemonEvent = { instanceId, type, data }
        inst.subscribers.forEach(cb => cb(event))
    }
}
`)

// ─── done ──────────────────────────────────────────────────────────────────────

console.log(`
✓ Daemon scaffolded at daemons/${id}/

Next steps:
  cd daemons/${id}
  npm install
  npm run build        # one-shot build
  npm run watch        # dev mode (hot-reload)
  cd dist
  npm publish --access=public   # publish to npmjs
`)

// ─── helpers ───────────────────────────────────────────────────────────────────

function write(file, content) {
    const fullPath = path.join(daemonDir, file)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    console.log(`  wrote ${file}`)
}
