import { IBackDaemonObject, IDaemonEvent, IDaemonInstanceConfig, IDaemonManager } from '@kwirthmagnify/kwirth-common'
import { IDaemon } from '@kwirthmagnify/kwirth-common-back'
import { ClusterInfo } from '../model/ClusterInfo'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo } from './Logging'
import { TDaemonConstructor, createDaemonInstance } from '../daemons/IDaemon'
import fs from 'fs'
import path from 'path'
import os from 'os'

export interface IDaemonMeta {
    id: string
    name: string
    version: string
    description: string
    installedFrom?: string
    backStored?: boolean
}

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
        logInfo(ELogComponent.CORE, `Daemon instance '${instanceConfig.id}' (${daemonId}) created`)
    }

    async stopInstance(instanceId: string): Promise<void> {
        const running = this.runningInstances.get(instanceId)
        if (!running) return
        running.daemon.stopInstance(instanceId)
        this.runningInstances.delete(instanceId)
        await this.persistInstances()
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
        return running.daemon.processCommand(instanceId, command, data)
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
            logInfo(ELogComponent.CORE, `Daemon instance '${instanceConfig.id}' (${instanceConfig.daemonId}) restored`)
        }
    }

    private async persistInstances(): Promise<void> {
        const all = Array.from(this.runningInstances.values()).map(r => r.instanceConfig)
        await this.configMaps.write('kwirth-daemon-instances', all)
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

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
}
