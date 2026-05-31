#!/usr/bin/env node
import { createInterface } from 'readline/promises'
import fs from 'fs'
import path from 'path'

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (q, def) => rl.question(def ? `${q} [${def}]: ` : `${q}: `).then(v => v.trim() || def || '')

console.log('\n── Kwirth plugin scaffold ──────────────────────────────────\n')

const id          = await ask('Plugin ID (kebab-case, e.g. my-plugin)')
const name        = await ask('Display name', id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' '))
const publisher   = await ask('Publisher name (e.g. @my-scope)')
const description = await ask('Description', `${name} channel plugin for Kwirth`)
const icon        = await ask('MUI icon name', 'Extension')
const website     = await ask('Website URL (optional)', '')
rl.close()

if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
    console.error('Error: Plugin ID must be lowercase kebab-case (e.g. my-plugin)')
    process.exit(1)
}

const className = id.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('')
const pluginDir = path.resolve('plugins', id)

if (fs.existsSync(pluginDir)) {
    console.error(`Error: Directory already exists: ${pluginDir}`)
    process.exit(1)
}

fs.mkdirSync(path.join(pluginDir, 'src', 'common'), { recursive: true })
fs.mkdirSync(path.join(pluginDir, 'src', 'back'), { recursive: true })
fs.mkdirSync(path.join(pluginDir, 'src', 'front'), { recursive: true })

// ─── package.json ──────────────────────────────────────────────────────────

const websiteLine = website ? `\n    "website": "${website}",` : ''
write('package.json', `{
    "id": "${id}",
    "name": "${name}",
    "displayName": "${name}",
    "publisher": "${publisher}",
    "version": "1.0.0",
    "description": "${description}",
    "icon": "${icon}",${websiteLine}
    "type": "module",
    "scripts": {
        "build": "node build.mjs",
        "watch": "node watch.mjs"
    },
    "dependencies": {
        "@kwirthmagnify/kwirth-common": "^0.5.2",
        "@kwirthmagnify/kwirth-common-front": "^0.5.2"
    },
    "devDependencies": {
        "@mui/icons-material": "7.1.2",
        "@mui/material": "7.1.2",
        "@types/node": "^20.12.13",
        "@types/react": "^18.3.0",
        "esbuild": "^0.27.2",
        "react": "^18.3.0",
        "react-dom": "^18.3.0",
        "typescript": "^5.4.0"
    }
}
`)

// ─── build.mjs ─────────────────────────────────────────────────────────────

write('build.mjs', `import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

const kwirthGlobalsPlugin = {
    name: 'kwirth-globals',
    setup(build) {
        const globals = {
            'react': 'window.__kwirth__.React',
            '@mui/material': 'window.__kwirth__.MUI.material',
            '@mui/icons-material': 'window.__kwirth__.MUI.icons',
            '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
        }
        for (const pkg of Object.keys(globals)) {
            build.onResolve({ filter: new RegExp(\`^\${pkg.replace(/[.*+?^\$\{\}()|[\\\\]\\\\]/g, '\\\\$&')}$\`) }, () => ({
                path: pkg,
                namespace: 'kwirth-globals',
            }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: \`module.exports = \${globals[args.path]}\`,
            loader: 'js',
        }))
    },
}

fs.mkdirSync('dist', { recursive: true })

await esbuild.build({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    plugins: [kwirthGlobalsPlugin],
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    minify: false,
})
console.log('Built dist/front.js')

await esbuild.build({
    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    loader: { '.ts': 'ts' },
    minify: false,
})
console.log('Built dist/back.js')

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const npmName = (meta.publisher ? meta.publisher + '/' : '') + 'kwirth-plugin-' + meta.id
const distMeta = {
    id: meta.id,
    name: npmName,
    version: meta.version,
    description: meta.description,
    icon: meta.icon,
    ...(meta.website ? { website: meta.website } : {}),
}
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify(distMeta, null, 2))
console.log('Wrote dist/package.json')

console.log("Done. Run 'npm publish' on your 'dist' folder in order to publish your package to npmjs.")
console.log(\`Package will be accessible (and installable on Kwirth) via this URL: https://registry.npmjs.org/\${npmName}/-/\${meta.id.replace('@', '').replace('/', '-')}-\${meta.version}.tgz\`)
`)

// ─── watch.mjs ─────────────────────────────────────────────────────────────

write('watch.mjs', `import esbuild from 'esbuild'
import fs from 'fs'
import path from 'path'

const kwirthGlobalsPlugin = {
    name: 'kwirth-globals',
    setup(build) {
        const globals = {
            'react': 'window.__kwirth__.React',
            '@mui/material': 'window.__kwirth__.MUI.material',
            '@mui/icons-material': 'window.__kwirth__.MUI.icons',
            '@kwirthmagnify/kwirth-common': 'window.__kwirth__.kwirthCommon',
        }
        for (const pkg of Object.keys(globals)) {
            build.onResolve({ filter: new RegExp(\`^\${pkg.replace(/[.*+?^\$\{\}()|[\\\\]\\\\]/g, '\\\\$&')}$\`) }, () => ({
                path: pkg,
                namespace: 'kwirth-globals',
            }))
        }
        build.onLoad({ filter: /.*/, namespace: 'kwirth-globals' }, (args) => ({
            contents: \`module.exports = \${globals[args.path]}\`,
            loader: 'js',
        }))
    },
}

fs.mkdirSync('dist', { recursive: true })

const meta = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const npmName = (meta.publisher ? meta.publisher + '/' : '') + 'kwirth-plugin-' + meta.id
fs.writeFileSync(path.join('dist', 'package.json'), JSON.stringify({
    id: meta.id, name: npmName, version: meta.version,
    description: meta.description, icon: meta.icon,
    ...(meta.website ? { website: meta.website } : {})
}, null, 2))

const frontCtx = await esbuild.context({
    entryPoints: ['src/front/index.ts'],
    bundle: true,
    format: 'iife',
    outfile: 'dist/front.js',
    plugins: [kwirthGlobalsPlugin],
    loader: { '.tsx': 'tsx', '.ts': 'ts' },
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    target: 'es2020',
    minify: false,
})

const backCtx = await esbuild.context({
    entryPoints: ['src/back/index.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/back.js',
    loader: { '.ts': 'ts' },
    minify: false,
})

await frontCtx.watch()
await backCtx.watch()

console.log('[watch] Watching src/ — front.js and back.js rebuild on every change.')
console.log('[watch] kwirth backend hot-reloads back.js automatically.')
console.log('[watch] kwirth frontend polls for front.js changes every 2s.')
`)

// ─── src/common/<Name>Types.ts ─────────────────────────────────────────────

write(`src/common/${className}Types.ts`, `import { IInstanceMessage } from '@kwirthmagnify/kwirth-common'

export interface I${className}InstanceConfig {
}

export interface I${className}Message extends IInstanceMessage {
    msgtype: '${id}message'
}

export interface I${className}MessageResponse extends IInstanceMessage {
    msgtype: '${id}messageresponse'
    text: string
}
`)

// ─── src/back/index.ts ─────────────────────────────────────────────────────

write('src/back/index.ts', `import {
    IInstanceConfig, ISignalMessage, IInstanceMessage, AccessKey, accessKeyDeserialize,
    EClusterType, BackChannelData, EInstanceMessageType,
    EInstanceMessageAction, EInstanceMessageFlow, ESignalMessageLevel,
    IBackChannelObject, IBackChannelRequirements
} from '@kwirthmagnify/kwirth-common'
import { Request, Response } from 'express'
import { I${className}InstanceConfig, I${className}MessageResponse } from '../common/${className}Types'

interface IAsset {
    podNamespace: string
    podName: string
    containerName: string
}

interface IInstance {
    instanceId: string
    accessKey: AccessKey
    config: I${className}InstanceConfig
    paused: boolean
    assets: IAsset[]
}

export class ${className}Channel {
    readonly channelId = '${id}'
    readonly requirements: IBackChannelRequirements = { storage: false, providers: [] }

    clusterInfo: any
    backChannelObject: IBackChannelObject
    private webSockets: { ws: WebSocket; lastRefresh: number; instances: IInstance[] }[] = []

    constructor(clusterInfo: any, backChannelObject: IBackChannelObject) {
        this.clusterInfo = clusterInfo
        this.backChannelObject = backChannelObject
    }

    getChannelData = (): BackChannelData => ({
        id: '${id}',
        routable: false,
        pauseable: false,
        modifiable: false,
        reconnectable: false,
        metrics: false,
        sources: [EClusterType.KUBERNETES],
        endpoints: [],
        websocket: false,
        cluster: false,
        resourced: true
    })

    getChannelScopeLevel = (scope: string): number => ['', 'none', 'cluster'].indexOf(scope)

    startChannel = async (): Promise<void> => {}
    processProviderEvent = (_providerId: string, _obj: unknown): void => {}
    endpointRequest = async (_endpoint: string, _req: Request, _res: Response): Promise<void> => {}
    websocketRequest = async (_ws: WebSocket): Promise<void> => {}

    processCommand = async (webSocket: WebSocket, instanceMessage: IInstanceMessage): Promise<boolean> => {
        if (!this.getInstance(webSocket, instanceMessage.instance)) {
            this.sendSignal(webSocket, EInstanceMessageAction.NONE, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.ERROR, instanceMessage.instance, 'Instance not found')
            return false
        }
        return true
    }

    addObject = async (webSocket: WebSocket, instanceConfig: IInstanceConfig, podNamespace: string, podName: string, containerName: string): Promise<boolean> => {
        let socket = this.webSockets.find(s => s.ws === webSocket)
        if (!socket) {
            this.webSockets.push({ ws: webSocket, lastRefresh: Date.now(), instances: [] })
            socket = this.webSockets[this.webSockets.length - 1]
        }
        let instance = socket.instances.find(i => i.instanceId === instanceConfig.instance)
        if (!instance) {
            instance = { instanceId: instanceConfig.instance, accessKey: accessKeyDeserialize(instanceConfig.accessKey), config: instanceConfig.data as I${className}InstanceConfig, paused: false, assets: [] }
            socket.instances.push(instance)
        }
        instance.assets.push({ podNamespace, podName, containerName })
        this.sendData(webSocket, instanceConfig.instance, \`Hello from ${name}! Monitoring \${podNamespace}/\${podName}/\${containerName}\`)
        return true
    }

    deleteObject = async (_ws: WebSocket, _cfg: IInstanceConfig, _ns: string, _pod: string, _ctr: string): Promise<boolean> => true

    pauseContinueInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig, action: EInstanceMessageAction): void => {
        const instance = this.getInstance(webSocket, instanceConfig.instance)
        if (instance) instance.paused = action === EInstanceMessageAction.PAUSE
    }

    modifyInstance = (_ws: WebSocket, _cfg: IInstanceConfig): void => {}

    stopInstance = (webSocket: WebSocket, instanceConfig: IInstanceConfig): void => {
        this.removeInstance(webSocket, instanceConfig.instance)
        this.sendSignal(webSocket, EInstanceMessageAction.STOP, EInstanceMessageFlow.RESPONSE, ESignalMessageLevel.INFO, instanceConfig.instance, '${name} stopped')
    }

    removeInstance = (webSocket: WebSocket, instanceId: string): void => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) socket.instances = socket.instances.filter(i => i.instanceId !== instanceId)
    }

    containsAsset = (_ws: WebSocket, _ns: string, _pod: string, _ctr: string): boolean => false

    containsInstance = (instanceId: string): boolean =>
        this.webSockets.some(s => s.instances.some(i => i.instanceId === instanceId))

    containsConnection = (webSocket: WebSocket): boolean =>
        Boolean(this.webSockets.find(s => s.ws === webSocket))

    removeConnection = (webSocket: WebSocket): void => {
        this.webSockets = this.webSockets.filter(s => s.ws !== webSocket)
    }

    refreshConnection = (webSocket: WebSocket): boolean => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        if (socket) { socket.lastRefresh = Date.now(); return true }
        return false
    }

    updateConnection = (newWebSocket: WebSocket, instanceId: string): boolean => {
        for (const entry of this.webSockets) {
            if (entry.instances.some(i => i.instanceId === instanceId)) {
                entry.ws = newWebSocket
                return true
            }
        }
        return false
    }

    private sendData = (ws: WebSocket, instanceId: string, text: string): void => {
        const msg: I${className}MessageResponse = {
            channel: '${id}',
            action: EInstanceMessageAction.NONE,
            flow: EInstanceMessageFlow.UNSOLICITED,
            type: EInstanceMessageType.DATA,
            instance: instanceId,
            msgtype: '${id}messageresponse',
            text
        }
        ws.send(JSON.stringify(msg))
    }

    private sendSignal = (ws: WebSocket, action: EInstanceMessageAction, flow: EInstanceMessageFlow, level: ESignalMessageLevel, instanceId: string, text: string): void => {
        const msg: ISignalMessage = { action, flow, channel: '${id}', instance: instanceId, type: EInstanceMessageType.SIGNAL, text, level }
        ws.send(JSON.stringify(msg))
    }

    private getInstance = (webSocket: WebSocket, instanceId: string): IInstance | undefined => {
        const socket = this.webSockets.find(s => s.ws === webSocket)
        return socket?.instances.find(i => i.instanceId === instanceId)
    }
}
`)

// ─── src/front/index.ts ────────────────────────────────────────────────────

write('src/front/index.ts', `import { ${className}Channel } from './${className}Channel'

declare global {
    interface Window { __kwirth_plugins__: Record<string, unknown> }
}

if (!window.__kwirth_plugins__) window.__kwirth_plugins__ = {}
window.__kwirth_plugins__['${id}'] = ${className}Channel
`)

// ─── src/front/<Name>Channel.tsx ───────────────────────────────────────────

write(`src/front/${className}Channel.tsx`, `import { FC } from 'react'
import { IChannel, IChannelRequirements, IChannelObject, IContentProps, ISetupProps, EChannelRefreshAction, IChannelMessageAction } from '@kwirthmagnify/kwirth-common-front'
import { EInstanceConfigScope } from '@kwirthmagnify/kwirth-common'
import { ${className}Setup, ${className}Icon } from './${className}Setup'
import { ${className}TabContent } from './${className}TabContent'
import { ${className}Config, ${className}InstanceConfig } from './${className}Config'
import { I${className}Data, ${className}Data } from './${className}Data'
import { I${className}MessageResponse } from '../common/${className}Types'

export class ${className}Channel implements IChannel {
    private setupVisible = false
    SetupDialog: FC<ISetupProps> = ${className}Setup
    TabContent: FC<IContentProps> = ${className}TabContent
    channelId = '${id}'

    requirements: IChannelRequirements = {
        accessString: false,
        clusterUrl: false,
        clusterInfo: false,
        exit: false,
        frontChannels: false,
        metrics: false,
        notifier: false,
        notifications: false,
        setup: true,
        settings: false,
        palette: false,
        userSettings: false,
        webSocket: false,
    }

    getScope = () => EInstanceConfigScope.NONE
    getChannelIcon = (): JSX.Element => ${className}Icon
    getSetupVisibility = (): boolean => this.setupVisible
    setSetupVisibility = (v: boolean): void => { this.setupVisible = v }

    processChannelMessage = (channelObject: IChannelObject, wsEvent: MessageEvent): IChannelMessageAction => {
        const msg = JSON.parse(wsEvent.data) as I${className}MessageResponse
        const data = channelObject.data as I${className}Data
        if (msg.text) data.messages.push(msg.text)
        return { action: EChannelRefreshAction.REFRESH }
    }

    initChannel = async (channelObject: IChannelObject): Promise<boolean> => {
        channelObject.data = new ${className}Data()
        channelObject.instanceConfig = new ${className}InstanceConfig()
        channelObject.config = new ${className}Config()
        return false
    }

    startChannel = (channelObject: IChannelObject): boolean => {
        (channelObject.data as I${className}Data).messages = []
        return true
    }

    stopChannel = (_channelObject: IChannelObject): boolean => true
    pauseChannel = (_channelObject: IChannelObject): boolean => true
    continueChannel = (_channelObject: IChannelObject): boolean => true
    socketDisconnected = (_channelObject: IChannelObject): boolean => false
    socketReconnect = (_channelObject: IChannelObject): boolean => false
}
`)

// ─── src/front/<Name>Config.ts ─────────────────────────────────────────────

write(`src/front/${className}Config.ts`, `export { I${className}InstanceConfig } from '../common/${className}Types'

export interface I${className}Config {
}

export class ${className}Config implements I${className}Config {
}

export class ${className}InstanceConfig {
}
`)

// ─── src/front/<Name>Data.ts ───────────────────────────────────────────────

write(`src/front/${className}Data.ts`, `export interface I${className}Data {
    messages: string[]
    paused: boolean
    started: boolean
}

export class ${className}Data implements I${className}Data {
    messages: string[] = []
    paused = false
    started = false
}
`)

// ─── src/front/<Name>Setup.tsx ─────────────────────────────────────────────

write(`src/front/${className}Setup.tsx`, `import React from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material'
import { ${icon} } from '@mui/icons-material'
import { ISetupProps } from '@kwirthmagnify/kwirth-common-front'
import { ${className}Config, ${className}InstanceConfig } from './${className}Config'

const ${className}Icon = <${icon} />

const ${className}Setup: React.FC<ISetupProps> = (props: ISetupProps) => {
    const instanceConfig: ${className}InstanceConfig = props.setupConfig?.channelInstanceConfig || new ${className}InstanceConfig()
    const config: ${className}Config = props.setupConfig?.channelConfig || new ${className}Config()

    const ok = () => {
        props.onChannelSetupClosed(props.channel, { channelId: props.channel.channelId, channelConfig: config, channelInstanceConfig: instanceConfig }, true, false)
    }

    const cancel = () => {
        props.onChannelSetupClosed(props.channel, { channelId: props.channel.channelId, channelConfig: undefined, channelInstanceConfig: undefined }, false, false)
    }

    return (
        <Dialog open={true}>
            <DialogTitle>${name} settings</DialogTitle>
            <DialogContent>
            </DialogContent>
            <DialogActions>
                <Button onClick={cancel}>Cancel</Button>
                <Button variant='contained' onClick={ok}>OK</Button>
            </DialogActions>
        </Dialog>
    )
}

export { ${className}Setup, ${className}Icon }
`)

// ─── src/front/<Name>TabContent.tsx ────────────────────────────────────────

write(`src/front/${className}TabContent.tsx`, `import React from 'react'
import { IContentProps } from '@kwirthmagnify/kwirth-common-front'
import { Box, List, ListItem, ListItemText, Typography } from '@mui/material'
import { ${icon} } from '@mui/icons-material'
import { I${className}Data } from './${className}Data'

export const ${className}TabContent: React.FC<IContentProps> = ({ channelObject }) => {
    const data = channelObject?.data as I${className}Data
    const messages = data?.messages ?? []

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', p: 2, gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <${icon} color='primary' />
                <Typography variant='h6'>${name}</Typography>
            </Box>
            {messages.length === 0
                ? <Typography color='text.secondary' variant='body2'>No messages yet. Start the channel to receive data.</Typography>
                : <List dense sx={{ overflow: 'auto', flex: 1 }}>
                    {messages.map((msg, i) => (
                        <ListItem key={i} disablePadding>
                            <ListItemText primary={msg} primaryTypographyProps={{ variant: 'body2', fontFamily: 'monospace' }} />
                        </ListItem>
                    ))}
                  </List>
            }
        </Box>
    )
}
`)

// ─── done ──────────────────────────────────────────────────────────────────

console.log(`
✓ Plugin scaffolded at plugins/${id}/

Next steps:
  cd plugins/${id}
  npm install
  npm run build        # one-shot build
  npm run watch        # dev mode (hot-reload)
  cd dist
  npm publish          # publish to npmjs
`)

// ─── helpers ───────────────────────────────────────────────────────────────

function write(file, content) {
    const fullPath = path.join(pluginDir, file)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    console.log(`  wrote ${file}`)
}
