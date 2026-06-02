import { IBackDaemonObject, IDaemonEvent, IDaemonInstanceConfig, IDaemonManager } from '@kwirthmagnify/kwirth-common'
import { IDaemon } from '@kwirthmagnify/kwirth-common-back'
import { ClusterInfo } from '../model/ClusterInfo'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo } from './Logging'
import { TDaemonConstructor, createDaemonInstance } from '../daemons/IDaemon'
import fs from 'fs'
import path from 'path'
import tar from 'tar'
import os from 'os'
import zlib from 'zlib'

export interface IDaemonMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    backStored?: boolean
}

const CONFIGMAP_SIZE_LIMIT = 800 * 1024

interface IDevDaemon {
    distPath: string
    meta: IDaemonMeta
}

interface IRunningDaemon {
    daemon: IDaemon
    instanceConfig: IDaemonInstanceConfig
    subscribers: Set<(event: IDaemonEvent) => void>
}

export class DaemonManager implements IDaemonManager {
    private configMaps: IConfigMaps
    private clusterInfo: ClusterInfo
    private backDaemonObject: IBackDaemonObject
    private registeredDaemons = new Map<string, TDaemonConstructor>()
    private daemonInstances = new Map<string, IDaemon>()           // daemonId → singleton IDaemon
    private runningInstances = new Map<string, IRunningDaemon>()   // instanceId → runtime
    private devDaemons = new Map<string, IDevDaemon>()
    private devWatchers = new Map<string, fs.FSWatcher>()

    processProviderEvent(providerId: string, event: unknown): void {
        this.routeProviderEvent(providerId, event)
    }

    constructor(clusterInfo: ClusterInfo, configMaps: IConfigMaps, backDaemonObject: IBackDaemonObject) {
        this.clusterInfo = clusterInfo
        this.configMaps = configMaps
        this.backDaemonObject = backDaemonObject
    }

    async init(): Promise<void> {
        // Load dev daemons from kwirth-dev.json
        this.loadDevDaemons()
        // Instantiate registered daemon types and call startDaemon
        for (const [id, ctor] of this.registeredDaemons) {
            try {
                const instance = createDaemonInstance(ctor, this.clusterInfo, this.backDaemonObject)
                if (instance) {
                    this.daemonInstances.set(id, instance)
                    await instance.startDaemon()
                    logInfo(ELogComponent.CORE, `Daemon '${id}' started`)
                }
            } catch (err) {
                logError(ELogComponent.CORE, `Failed to start daemon '${id}': ${err}`)
            }
        }
        // Restore persisted instances
        await this.restoreInstances()
        // Subscribe to providers required by daemons
        this.subscribeToEventsProvider()
        this.rebuildBusinessSubscription()
    }

    register(id: string, ctor: TDaemonConstructor): void {
        this.registeredDaemons.set(id, ctor)
    }

    // ── IDaemonManager interface ────────────────────────────────────────────────

    async createInstance(daemonId: string, instanceConfig: IDaemonInstanceConfig): Promise<void> {
        const daemon = this.daemonInstances.get(daemonId)
        if (!daemon) throw new Error(`Daemon '${daemonId}' not registered`)
        this.runningInstances.set(instanceConfig.id, { daemon, instanceConfig, subscribers: new Set() })
        await this.persistInstances()
        this.rebuildBusinessSubscription()
        logInfo(ELogComponent.CORE, `Daemon instance '${instanceConfig.id}' (${daemonId}) created`)
    }

    async stopInstance(instanceId: string): Promise<void> {
        const running = this.runningInstances.get(instanceId)
        if (!running) return
        running.daemon.stopInstance(instanceId)
        this.runningInstances.delete(instanceId)
        await this.persistInstances()
        this.rebuildBusinessSubscription()
        logInfo(ELogComponent.CORE, `Daemon instance '${instanceId}' stopped`)
    }

    listInstances(daemonId?: string): IDaemonInstanceConfig[] {
        const all = Array.from(this.runningInstances.values()).map(r => r.instanceConfig)
        return daemonId ? all.filter(c => c.daemonId === daemonId) : all
    }

    subscribe(instanceId: string, callback: (event: IDaemonEvent) => void): () => void {
        const running = this.runningInstances.get(instanceId)
        if (!running) return () => {}
        running.subscribers.add(callback)
        // Wire the daemon's own subscribe so events reach this callback
        const unsub = running.daemon.subscribe(instanceId, (raw: unknown) => {
            callback(raw as IDaemonEvent)
        })
        return () => {
            running.subscribers.delete(callback)
            unsub()
        }
    }

    async sendCommand(instanceId: string, command: string, data: unknown): Promise<unknown> {
        const running = this.runningInstances.get(instanceId)
        if (!running) throw new Error(`Daemon instance '${instanceId}' not found`)
        const result = await running.daemon.processCommand(instanceId, command, data)
        if (command === 'configset' && data) {
            running.instanceConfig.data = data
            this.rebuildBusinessSubscription()
        }
        return result
    }

    // ── Pod event routing ───────────────────────────────────────────────────────

    async routeAddObject(podNamespace: string, podName: string, containerName: string): Promise<void> {
        for (const { daemon, instanceConfig } of this.runningInstances.values()) {
            if (this.matchesScope(instanceConfig, podNamespace, podName, containerName)) {
                if (!daemon.containsAsset(instanceConfig.id, podNamespace, podName, containerName)) {
                    await daemon.addObject(instanceConfig, podNamespace, podName, containerName)
                }
            }
        }
    }

    async directAddObject(instanceId: string, podNamespace: string, podName: string, containerName: string): Promise<void> {
        const running = this.runningInstances.get(instanceId)
        if (!running) return
        if (!running.daemon.containsAsset(instanceId, podNamespace, podName, containerName)) {
            await running.daemon.addObject(running.instanceConfig, podNamespace, podName, containerName)
        }
    }

    async directDeleteObject(instanceId: string, podNamespace: string, podName: string, containerName: string): Promise<void> {
        const running = this.runningInstances.get(instanceId)
        if (!running) return
        if (running.daemon.containsAsset(instanceId, podNamespace, podName, containerName)) {
            await running.daemon.deleteObject(running.instanceConfig, podNamespace, podName, containerName)
        }
    }

    async routeDeleteObject(podNamespace: string, podName: string, containerName: string): Promise<void> {
        for (const { daemon, instanceConfig } of this.runningInstances.values()) {
            if (daemon.containsAsset(instanceConfig.id, podNamespace, podName, containerName)) {
                await daemon.deleteObject(instanceConfig, podNamespace, podName, containerName)
            }
        }
    }

    routeProviderEvent(providerId: string, event: unknown): void {
        for (const { daemon } of this.runningInstances.values()) {
            daemon.processProviderEvent(providerId, event)
        }
    }

    // ── Dev loading ─────────────────────────────────────────────────────────────

    loadDevDaemons(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const daemonsMap: Record<string, string> = raw.daemons ?? {}
            for (const [id, distPath] of Object.entries(daemonsMap)) {
                this.registerDevDaemon(id, distPath)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (daemons): ${err}`)
        }
    }

    private registerDevDaemon(id: string, distPath: string): void {
        const absPath = path.resolve(distPath)
        const backPath = path.join(absPath, 'back.js')
        const metaPath = path.join(absPath, 'package.json')
        const meta: IDaemonMeta = { id, name: id, version: 'dev', description: 'dev daemon', installedFrom: 'dev' }
        try {
            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            meta.name = pkg.name ?? id
            meta.version = pkg.version ?? 'dev'
            meta.description = pkg.description ?? ''
        } catch {}
        this.devDaemons.set(id, { distPath: absPath, meta })
        this.reloadDevBack(id, backPath)
        try {
            const watcher = fs.watch(backPath, () => {
                logInfo(ELogComponent.CORE, `[dev] Daemon '${id}' back.js changed — hot-reloading`)
                this.reloadDevBack(id, backPath)
            })
            this.devWatchers.set(id, watcher)
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Cannot watch '${backPath}': ${err}`)
        }
        logInfo(ELogComponent.CORE, `[dev] Daemon '${id}' registered from ${absPath}`)
    }

    private reloadDevBack(id: string, backPath: string): void {
        try {
            const resolved = require.resolve(backPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const mod = require(backPath)
            const DaemonClass: TDaemonConstructor = mod.default ?? Object.values(mod).find(v => typeof v === 'function') as TDaemonConstructor
            if (DaemonClass) {
                this.registeredDaemons.set(id, DaemonClass)
                logInfo(ELogComponent.CORE, `[dev] Daemon '${id}' backend reloaded`)
            } else {
                logError(ELogComponent.CORE, `[dev] Daemon '${id}' back.js exports no class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Daemon '${id}' reload error: ${err}`)
        }
    }

    // ── Persistence ─────────────────────────────────────────────────────────────

    private async restoreInstances(): Promise<void> {
        const saved = (await this.configMaps.read('kwirth-daemon-instances', [])) as IDaemonInstanceConfig[]
        for (const instanceConfig of (saved ?? [])) {
            if (!instanceConfig.started) continue
            const daemon = this.daemonInstances.get(instanceConfig.daemonId)
            if (!daemon) {
                logError(ELogComponent.CORE, `Cannot restore daemon instance '${instanceConfig.id}': daemon '${instanceConfig.daemonId}' not registered`)
                continue
            }
            this.runningInstances.set(instanceConfig.id, { daemon, instanceConfig, subscribers: new Set() })
            if (instanceConfig.data) {
                await daemon.processCommand(instanceConfig.id, 'configset', instanceConfig.data).catch((err: unknown) =>
                    logError(ELogComponent.CORE, `Failed to restore in-memory instance '${instanceConfig.id}': ${err}`)
                )
            }
            logInfo(ELogComponent.CORE, `Daemon instance '${instanceConfig.id}' (${instanceConfig.daemonId}) restored`)
        }
    }

    private async persistInstances(): Promise<void> {
        const all = Array.from(this.runningInstances.values()).map(r => r.instanceConfig)
        await this.configMaps.write('kwirth-daemon-instances', all)
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private subscribeToEventsProvider(): void {
        const ci = this.clusterInfo as { providers?: { find: (fn: (p: { id: string }) => boolean) => { addSubscriber: (sub: unknown, cfg: unknown) => void } | undefined } }
        const eventsProvider = ci.providers?.find(p => p.id === 'events')
        if (eventsProvider) {
            eventsProvider.addSubscriber(this, {})
            logInfo(ELogComponent.CORE, `DaemonManager subscribed to 'events' provider`)
        }
    }

    private rebuildBusinessSubscription(): void {
        const ci = this.clusterInfo as { providers?: { find: (fn: (p: { id: string }) => boolean) => { addSubscriber: (sub: unknown, cfg: unknown) => void } | undefined } }
        const businessProvider = ci.providers?.find(p => p.id === 'business')
        if (!businessProvider) return
        const spacesMap = new Map<string, Set<string>>()
        for (const { daemon, instanceConfig } of this.runningInstances.values()) {
            if (!daemon.requirements.providers.includes('business')) continue
            const data = instanceConfig.data as { businessPath?: string, space?: string, type?: string } | undefined
            if (!data?.businessPath || !data.space) continue
            const types = spacesMap.get(data.space) ?? new Set<string>()
            types.add(data.type ?? '')
            spacesMap.set(data.space, types)
        }
        const spaces = Array.from(spacesMap.entries()).map(([name, types]) => ({ name, types: Array.from(types) }))
        if (spaces.length > 0) {
            businessProvider.addSubscriber(this, { spaces })
            logInfo(ELogComponent.CORE, `DaemonManager subscribed to 'business' provider with spaces=${JSON.stringify(spaces)}`)
        }
    }

    private matchesScope(cfg: IDaemonInstanceConfig, ns: string, pod: string, container: string): boolean {
        if (cfg.namespace && cfg.namespace !== ns) return false
        if (cfg.pod && !cfg.pod.split(',').includes(pod)) return false
        if (cfg.container && !cfg.container.split(',').includes(`${pod}+${container}`)) return false
        if (cfg.group) {
            const groupName = cfg.group.split('+')[1] ?? cfg.group
            if (!pod.startsWith(groupName)) return false
        }
        return true
    }

    // ── Install / Uninstall ─────────────────────────────────────────────────────

    async listInstalled(): Promise<IDaemonMeta[]> {
        const stored = (await this.configMaps.read('kwirth-daemons-index', [])) as IDaemonMeta[]
        const devMetas = Array.from(this.devDaemons.entries()).map(([id, dev]) => {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(dev.distPath, 'package.json'), 'utf-8'))
                return { ...dev.meta, name: pkg.name ?? id, displayName: pkg.displayName, version: pkg.version ?? 'dev', description: pkg.description ?? '', website: pkg.website }
            } catch { return dev.meta }
        })
        return [...(stored ?? []), ...devMetas]
    }

    async install(tarGzUrl: string, installedFrom?: string): Promise<IDaemonMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-daemon-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-daemon-extract-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        const isLocalPath = !tarGzUrl.startsWith('http://') && !tarGzUrl.startsWith('https://')
        try {
            if (isLocalPath) fs.copyFileSync(tarGzUrl, tmpTgz)
            else await this.downloadFile(tarGzUrl, tmpTgz)
            await tar.x({ file: tmpTgz, cwd: tmpDir })

            let metaPath = path.join(tmpDir, 'package.json')
            let backPath = path.join(tmpDir, 'back.js')
            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) {
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                backPath = path.join(tmpDir, 'back.js')
                if (!fs.existsSync(metaPath) || !fs.existsSync(backPath))
                    throw new Error('Invalid daemon bundle: missing package.json or back.js')
            }

            const meta: IDaemonMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            meta.installedFrom = installedFrom ?? tarGzUrl
            const backJs = fs.readFileSync(backPath, 'utf-8')
            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT

            await this.configMaps.write(`kwirth-daemon-${meta.id}-meta`, meta)
            if (meta.backStored) await this.configMaps.write(`kwirth-daemon-${meta.id}-back`, { code: backCompressed, compressed: true })

            const index = ((await this.configMaps.read('kwirth-daemons-index', [])) as IDaemonMeta[]) ?? []
            const existingIdx = index.findIndex(d => d.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta; else index.push(meta)
            await this.configMaps.write('kwirth-daemons-index', index)

            await this.loadBackDaemon(meta.id, backJs)
            logInfo(ELogComponent.CORE, `Daemon '${meta.id}' v${meta.version} installed`)
            return meta
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IDaemonMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-daemon-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try { return await this.install(tmpTgz, 'local') }
        finally { if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz) }
    }

    async uninstall(id: string): Promise<void> {
        if (this.devDaemons.has(id)) throw new Error(`Daemon '${id}' is a dev daemon and cannot be uninstalled`)
        const daemon = this.daemonInstances.get(id)
        if (daemon) {
            for (const [instanceId, running] of this.runningInstances) {
                if (running.instanceConfig.daemonId === id) {
                    running.daemon.stopInstance(instanceId)
                    this.runningInstances.delete(instanceId)
                }
            }
            await this.persistInstances()
        }
        this.daemonInstances.delete(id)
        this.registeredDaemons.delete(id)

        const index = ((await this.configMaps.read('kwirth-daemons-index', [])) as IDaemonMeta[]) ?? []
        await this.configMaps.write('kwirth-daemons-index', index.filter(d => d.id !== id))
        await this.configMaps.write(`kwirth-daemon-${id}-meta`, null)
        await this.configMaps.write(`kwirth-daemon-${id}-back`, null)
        const cacheFile = path.join(os.tmpdir(), `kwirth-daemon-${id}-back.js`)
        if (fs.existsSync(cacheFile)) fs.rmSync(cacheFile)
        logInfo(ELogComponent.CORE, `Daemon '${id}' uninstalled`)
    }

    async loadAll(): Promise<void> {
        const index = ((await this.configMaps.read('kwirth-daemons-index', [])) as IDaemonMeta[]) ?? []
        for (const meta of index) {
            try {
                let backJs: string | undefined
                if (meta.backStored === false) {
                    logError(ELogComponent.CORE, `Daemon '${meta.id}' back.js not stored — cannot load`)
                } else {
                    const backData = await this.configMaps.read(`kwirth-daemon-${meta.id}-back`)
                    if (backData?.code)
                        backJs = backData.compressed ? zlib.gunzipSync(Buffer.from(backData.code, 'base64')).toString('utf-8') : backData.code
                }
                if (backJs) await this.loadBackDaemon(meta.id, backJs)
                else logError(ELogComponent.CORE, `Daemon '${meta.id}' has no back.js — skipping`)
            } catch (err) {
                logError(ELogComponent.CORE, `Failed to load daemon '${meta.id}': ${err}`)
            }
        }
    }

    private async loadBackDaemon(id: string, backJs: string): Promise<void> {
        const tmpPath = path.join(os.tmpdir(), `kwirth-daemon-${id}-back.js`)
        fs.writeFileSync(tmpPath, backJs)
        try {
            if (require.cache[require.resolve(tmpPath)]) delete require.cache[require.resolve(tmpPath)]
            const mod = require(tmpPath)
            const DaemonClass: TDaemonConstructor = mod.default ?? Object.values(mod).find(v => typeof v === 'function') as TDaemonConstructor
            if (DaemonClass) {
                this.registeredDaemons.set(id, DaemonClass)
                const instance = createDaemonInstance(DaemonClass, this.clusterInfo, this.backDaemonObject)
                if (instance) {
                    this.daemonInstances.set(id, instance)
                    await instance.startDaemon()
                    logInfo(ELogComponent.CORE, `Daemon '${id}' backend registered and started`)
                }
            } else {
                logError(ELogComponent.CORE, `Daemon '${id}' back.js exports no daemon class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Error loading daemon '${id}' backend: ${err}`)
        }
    }

    private downloadFile(url: string, destPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const proto = url.startsWith('https://') ? require('https') : require('http')
            const file = fs.createWriteStream(destPath)
            proto.get(url, (res: any) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    file.close()
                    this.downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
                    return
                }
                res.pipe(file)
                file.on('finish', () => file.close(() => resolve()))
            }).on('error', (err: Error) => { fs.unlink(destPath, () => {}); reject(err) })
        })
    }
}
