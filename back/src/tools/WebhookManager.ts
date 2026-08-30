import { IWebhook, IWebhookAccess, IWebhookConfig, IWebhookConsumer, IWebhookEvent, IWebhookFieldDef, IWebhookStoredConfig, TWebhookConstructor } from '@kwirthmagnify/kwirth-common-back'
import { IConfigMaps } from './IConfigMap'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'
import tar from 'tar'
import os from 'os'
import path from 'path'
import fs from 'fs'
import zlib from 'zlib'
import https from 'https'
import http from 'http'
import crypto from 'crypto'

export interface IWebhookMeta {
    id: string
    name: string
    displayName?: string
    version: string
    description: string
    website?: string
    installedFrom?: string
    backStored?: boolean
    frontStored?: boolean
    requiresRestart?: boolean
    requiresExtension?: string[]
}

export type { IWebhookConfig, IWebhookEvent }

const CONFIGMAP_SIZE_LIMIT = 800 * 1024

interface IDevWebhook {
    distPath: string
    meta: IWebhookMeta
}

// Resultado de resolver un token entrante → a qué webhook/config/consumidor corresponde.
export interface IWebhookResolution {
    webhookId: string
    configName: string
    config: IWebhookConfig
}

export class WebhookManager implements IWebhookAccess {
    private configMaps: IConfigMaps
    private urlBase: string                                   // p.ej. `${envRootPath}/webhook`
    private registeredWebhooks = new Map<string, TWebhookConstructor>()
    private instances = new Map<string, IWebhook>()
    private devWebhooks = new Map<string, IDevWebhook>()
    private devWatchers = new Map<string, fs.FSWatcher>()
    private configStore = new Map<string, Map<string, IWebhookConfig>>()
    private installedIds: string[] = []
    private installedMetas = new Map<string, IWebhookMeta>()
    private cachedIndex: IWebhookMeta[] = []
    // Registro de tokens: token ↔ (webhookId, configName). El token enruta el callback entrante.
    private tokenByConfig = new Map<string, string>()        // `${id}:${name}` → token
    private configByToken = new Map<string, { webhookId: string; configName: string }>()
    // Consumidores suscritos por webhookId (modelo provider-like: te suscribes a un webhook y recibes SUS eventos).
    private subscribers = new Map<string, Set<IWebhookConsumer>>()

    constructor(configMaps: IConfigMaps, urlBase: string = '/webhook') {
        this.configMaps = configMaps
        this.urlBase = urlBase
    }

    async init(): Promise<void> {
        const index = (await this.configMaps.read('kwirth-webhooks-index', [])) as IWebhookMeta[]
        this.cachedIndex = index || []
        this.installedIds = this.cachedIndex.map(w => w.id)
        for (const meta of this.cachedIndex) this.installedMetas.set(meta.id, meta)
    }

    getInstalledIds(): string[] {
        return this.installedIds
    }

    getDevIds(): string[] {
        return Array.from(this.devWebhooks.keys())
    }

    isDevWebhook(id: string): boolean {
        return this.devWebhooks.has(id)
    }

    hasFront(id: string): boolean {
        const dev = this.devWebhooks.get(id)
        if (dev) return fs.existsSync(path.join(dev.distPath, 'front.js'))
        const meta = this.installedMetas.get(id)
        return meta?.frontStored === true
    }

    async getFrontJs(id: string): Promise<string | undefined> {
        const dev = this.devWebhooks.get(id)
        if (dev) {
            try { return fs.readFileSync(path.join(dev.distPath, 'front.js'), 'utf-8') } catch { return undefined }
        }
        const metaData = await this.configMaps.read(`kwirth-webhook-${id}-meta`) as IWebhookMeta | null
        if (!metaData) return undefined
        if (metaData.frontStored === false) return this.fetchFrontJsFromSource(metaData)
        const data = await this.configMaps.read(`kwirth-webhook-${id}-front`)
        if (!data?.code) return undefined
        return data.compressed ? zlib.gunzipSync(Buffer.from(data.code, 'base64')).toString('utf-8') : data.code
    }

    private async fetchFrontJsFromSource(meta: IWebhookMeta): Promise<string | undefined> {
        const cacheFile = path.join(os.tmpdir(), `kwirth-webhook-${meta.id}-front.js`)
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') return undefined
        const tmpTgz = path.join(os.tmpdir(), `kwirth-webhook-${meta.id}-frontsrc-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-webhook-${meta.id}-frontsrc-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await this.downloadFile(meta.installedFrom, tmpTgz)
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            const content = fs.readFileSync(path.join(tmpDir, 'front.js'), 'utf-8')
            fs.writeFileSync(cacheFile, content)
            return content
        } catch { return undefined } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    // ── Dev loading ─────────────────────────────────────────────────────────────

    loadDevWebhooks(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const webhooksMap: Record<string, string> = raw.webhooks ?? {}
            for (const [id, distPath] of Object.entries(webhooksMap)) {
                this.registerDevWebhook(id, distPath)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (webhooks): ${err}`)
        }
    }

    loadDevWebhookConfigs(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const configsMap: Record<string, IWebhookConfig[]> = raw.webhookConfigs ?? {}
            for (const [webhookId, configs] of Object.entries(configsMap)) {
                for (const config of configs) {
                    this.addConfigInternal(webhookId, this.interpolateEnvVars(config))
                }
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (webhookConfigs): ${err}`)
        }
    }

    async loadPersistedConfigs(): Promise<void> {
        const storedTokens = (await this.configMaps.read('kwirth-webhook-tokens', {})) as Record<string, string>
        for (const [key, token] of Object.entries(storedTokens || {})) {
            this.tokenByConfig.set(key, token)
            const [webhookId, configName] = this.splitKey(key)
            this.configByToken.set(token, { webhookId, configName })
        }

        const allKeys = await this.configMaps.readAllKeys('kwirth-webhook-configs')
        for (const [webhookId, value] of Object.entries(allKeys)) {
            let configs: IWebhookConfig[]
            if (Array.isArray(value)) {
                configs = value as IWebhookConfig[]
            } else if (value && typeof value === 'object' && Array.isArray((value as IWebhookStoredConfig).configs)) {
                configs = (value as IWebhookStoredConfig).configs as IWebhookConfig[]
            } else {
                continue
            }
            for (const config of configs) {
                this.addConfigInternal(webhookId, config)
            }
        }
    }

    private interpolateEnvVars(obj: IWebhookConfig): IWebhookConfig {
        const json = JSON.stringify(obj).replace(/\$\{([^}]+)\}/g, (_, varName) => {
            const value = process.env[varName]
            if (!value) logWarning(ELogComponent.CORE, `Webhook config references undefined env var: ${varName}`)
            return value ?? ''
        })
        return JSON.parse(json)
    }

    private registerDevWebhook(id: string, distPath: string): void {
        const absPath = path.resolve(distPath)
        const backPath = path.join(absPath, 'back.js')
        const metaPath = path.join(absPath, 'package.json')

        const meta: IWebhookMeta = { id, name: id, version: 'dev', description: 'dev webhook', installedFrom: 'dev' }
        try {
            const pkg = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
            meta.name = pkg.name ?? id
            meta.displayName = pkg.displayName
            meta.version = pkg.version ?? 'dev'
            meta.description = pkg.description ?? ''
            meta.website = pkg.website
        } catch {}

        this.devWebhooks.set(id, { distPath: absPath, meta })
        this.reloadDevBack(id, backPath)

        try {
            const watcher = fs.watch(backPath, () => {
                logInfo(ELogComponent.CORE, `[dev] Webhook '${id}' back.js changed — hot-reloading`)
                this.reloadDevBack(id, backPath)
            })
            this.devWatchers.set(id, watcher)
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Cannot watch '${backPath}': ${err}`)
        }

        logInfo(ELogComponent.CORE, `[dev] Webhook '${id}' registered from ${absPath}`)
    }

    private reloadDevBack(id: string, backPath: string): void {
        try {
            const resolved = require.resolve(backPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const mod = require(backPath)
            const WebhookClass: TWebhookConstructor = mod.default ?? Object.values(mod).find(v => typeof v === 'function') as TWebhookConstructor
            if (WebhookClass) {
                this.registeredWebhooks.set(id, WebhookClass)
                this.instances.delete(id)
                logInfo(ELogComponent.CORE, `[dev] Webhook '${id}' backend reloaded`)
            } else {
                logError(ELogComponent.CORE, `[dev] Webhook '${id}' back.js exports no class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Webhook '${id}' reload error: ${err}`)
        }
    }

    // ── Persistent install/uninstall ────────────────────────────────────────────

    async loadAll(): Promise<void> {
        for (const meta of this.cachedIndex) {
            try {
                let backJs: string | undefined
                if (meta.backStored === false) {
                    backJs = await this.fetchJsFromSource(meta)
                } else {
                    const backData = await this.configMaps.read(`kwirth-webhook-${meta.id}-back`)
                    if (backData?.code)
                        backJs = backData.compressed ? zlib.gunzipSync(Buffer.from(backData.code, 'base64')).toString('utf-8') : backData.code
                }
                if (backJs) await this.loadBackWebhook(meta.id, backJs)
                else logError(ELogComponent.CORE, `Webhook '${meta.id}' has no back.js — skipping`)
            } catch (err) {
                logError(ELogComponent.CORE, `Failed to load webhook '${meta.id}': ${err}`)
            }
        }
    }

    private async loadBackWebhook(id: string, backJs: string): Promise<void> {
        const tmpPath = path.join(os.tmpdir(), `kwirth-webhook-${id}-back.js`)
        fs.writeFileSync(tmpPath, backJs)
        try {
            if (require.cache[require.resolve(tmpPath)]) delete require.cache[require.resolve(tmpPath)]
            const mod = require(tmpPath)
            const WebhookClass = mod.default ?? Object.values(mod).find(v => typeof v === 'function')
            if (WebhookClass) {
                this.registeredWebhooks.set(id, WebhookClass as TWebhookConstructor)
                logInfo(ELogComponent.CORE, `Webhook '${id}' backend registered`)
            } else {
                logError(ELogComponent.CORE, `Webhook '${id}' back.js exports no webhook class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Error loading webhook '${id}' backend: ${err}`)
        }
    }

    async install(tarGzUrl: string, installedFrom?: string): Promise<IWebhookMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-webhook-${Date.now()}.tgz`)
        let tmpDir = path.join(os.tmpdir(), `kwirth-webhook-extract-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })

        const isLocalPath = tarGzUrl.startsWith('file://') || (!tarGzUrl.startsWith('http://') && !tarGzUrl.startsWith('https://'))

        try {
            if (isLocalPath) {
                const localPath = tarGzUrl.startsWith('file://') ? new URL(tarGzUrl).pathname.replace(/^\/([A-Za-z]:)/, '$1') : tarGzUrl
                fs.copyFileSync(localPath, tmpTgz)
            } else {
                await this.downloadFile(tarGzUrl, tmpTgz)
            }
            await tar.x({ file: tmpTgz, cwd: tmpDir })

            let metaPath = path.join(tmpDir, 'package.json')
            let backPath = path.join(tmpDir, 'back.js')

            if (!fs.existsSync(metaPath) || !fs.existsSync(backPath)) {
                tmpDir = path.join(tmpDir, 'package')
                metaPath = path.join(tmpDir, 'package.json')
                backPath = path.join(tmpDir, 'back.js')
                if (!fs.existsSync(metaPath) || !fs.existsSync(backPath))
                    throw new Error('Invalid webhook bundle: missing package.json or back.js')
            }

            const meta: IWebhookMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))

            if (this.installedIds.includes(meta.id))
                throw new Error(`Webhook '${meta.id}' is already installed`)

            meta.installedFrom = installedFrom ?? tarGzUrl
            meta.requiresRestart = meta.requiresRestart ?? false
            meta.requiresExtension = meta.requiresExtension ?? []
            const backJs = fs.readFileSync(backPath, 'utf-8')

            const backCompressed = zlib.gzipSync(Buffer.from(backJs, 'utf-8')).toString('base64')
            meta.backStored = backCompressed.length <= CONFIGMAP_SIZE_LIMIT
            if (!meta.backStored)
                logInfo(ELogComponent.CORE, `Webhook '${meta.id}' back.js exceeds configmap limit — will fetch from source on startup`)

            const frontPath = path.join(tmpDir, 'front.js')
            if (fs.existsSync(frontPath)) {
                const frontJs = fs.readFileSync(frontPath, 'utf-8')
                const frontCompressed = zlib.gzipSync(Buffer.from(frontJs, 'utf-8')).toString('base64')
                meta.frontStored = frontCompressed.length <= CONFIGMAP_SIZE_LIMIT
                if (!meta.frontStored)
                    logInfo(ELogComponent.CORE, `Webhook '${meta.id}' front.js exceeds configmap limit — will fetch from source on request`)
                if (meta.frontStored) await this.configMaps.write(`kwirth-webhook-${meta.id}-front`, { code: frontCompressed, compressed: true })
            }

            await this.configMaps.write(`kwirth-webhook-${meta.id}-meta`, meta)
            if (meta.backStored) await this.configMaps.write(`kwirth-webhook-${meta.id}-back`, { code: backCompressed, compressed: true })

            const index = (await this.configMaps.read('kwirth-webhooks-index', []) as IWebhookMeta[]) || []
            const existingIdx = index.findIndex(w => w.id === meta.id)
            if (existingIdx >= 0) index[existingIdx] = meta
            else index.push(meta)
            await this.configMaps.write('kwirth-webhooks-index', index)
            if (!this.installedIds.includes(meta.id)) this.installedIds.push(meta.id)
            this.installedMetas.set(meta.id, meta)

            await this.loadBackWebhook(meta.id, backJs)
            logInfo(ELogComponent.CORE, `Webhook '${meta.id}' v${meta.version} installed`)
            return meta
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async installFromBuffer(buffer: Buffer): Promise<IWebhookMeta> {
        const tmpTgz = path.join(os.tmpdir(), `kwirth-webhook-upload-${Date.now()}.tgz`)
        fs.writeFileSync(tmpTgz, buffer)
        try {
            return await this.install(tmpTgz, 'local')
        } finally {
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    async uninstall(id: string): Promise<void> {
        if (this.isDevWebhook(id)) throw new Error(`Webhook '${id}' is a dev webhook and cannot be uninstalled`)
        const meta = this.installedMetas.get(id)
        if (meta?.installedFrom?.startsWith('pack:')) throw new Error(`Webhook '${id}' was installed by pack '${meta.installedFrom.slice(5)}' — uninstall the pack instead`)
        await this._doUninstall(id)
    }

    async uninstallFromPack(id: string): Promise<void> {
        await this._doUninstall(id)
    }

    private async _doUninstall(id: string): Promise<void> {
        this.instances.delete(id)
        this.registeredWebhooks.delete(id)
        this.installedIds = this.installedIds.filter(i => i !== id)

        const index = (await this.configMaps.read('kwirth-webhooks-index', []) as IWebhookMeta[]) || []
        await this.configMaps.write('kwirth-webhooks-index', index.filter(w => w.id !== id))
        await this.configMaps.write(`kwirth-webhook-${id}-meta`, null)
        await this.configMaps.write(`kwirth-webhook-${id}-back`, null)
        await this.configMaps.write(`kwirth-webhook-${id}-front`, null)
        // Evict all configs + tokens of this webhook.
        for (const name of Array.from(this.configStore.get(id)?.keys() ?? [])) this.evictToken(id, name)
        this.configStore.delete(id)
        await this.configMaps.writeKey('kwirth-webhook-configs', id, null)
        this.persistTokens()
        this.installedMetas.delete(id)

        for (const suffix of ['back.js', 'front.js']) {
            const cacheFile = path.join(os.tmpdir(), `kwirth-webhook-${id}-${suffix}`)
            if (fs.existsSync(cacheFile)) fs.rmSync(cacheFile)
        }

        logInfo(ELogComponent.CORE, `Webhook '${id}' uninstalled`)
    }

    async listInstalled(): Promise<Array<IWebhookMeta & { configNames: string[] }>> {
        const stored = (await this.configMaps.read('kwirth-webhooks-index', [])) as IWebhookMeta[] || []
        const devMetas = Array.from(this.devWebhooks.entries()).map(([id, dev]) => {
            try {
                const pkg = JSON.parse(fs.readFileSync(path.join(dev.distPath, 'package.json'), 'utf-8'))
                return { ...dev.meta, name: pkg.name ?? id, displayName: pkg.displayName, version: pkg.version ?? 'dev', description: pkg.description ?? '', website: pkg.website }
            } catch {
                return dev.meta
            }
        })
        return [...stored, ...devMetas].map(meta => ({
            ...meta,
            configNames: Array.from(this.configStore.get(meta.id)?.values() ?? []).map(c => c.name),
            hasFront: this.hasFront(meta.id),
        }))
    }

    private async fetchJsFromSource(meta: IWebhookMeta): Promise<string | undefined> {
        const cacheFile = path.join(os.tmpdir(), `kwirth-webhook-${meta.id}-back.js`)
        if (fs.existsSync(cacheFile)) return fs.readFileSync(cacheFile, 'utf-8')
        if (!meta.installedFrom || meta.installedFrom === 'local') {
            logError(ELogComponent.CORE, `Webhook '${meta.id}' back.js not stored and has no remote source`)
            return undefined
        }
        const tmpTgz = path.join(os.tmpdir(), `kwirth-webhook-${meta.id}-src-${Date.now()}.tgz`)
        const tmpDir = path.join(os.tmpdir(), `kwirth-webhook-${meta.id}-src-${Date.now()}`)
        fs.mkdirSync(tmpDir, { recursive: true })
        try {
            await this.downloadFile(meta.installedFrom, tmpTgz)
            await tar.x({ file: tmpTgz, cwd: tmpDir })
            const content = fs.readFileSync(path.join(tmpDir, 'back.js'), 'utf-8')
            fs.writeFileSync(cacheFile, content)
            logInfo(ELogComponent.CORE, `Webhook '${meta.id}' back.js fetched from source and cached`)
            return content
        } catch (err) {
            logError(ELogComponent.CORE, `Webhook '${meta.id}' failed to fetch back.js from source: ${err}`)
            return undefined
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true })
            if (fs.existsSync(tmpTgz)) fs.rmSync(tmpTgz)
        }
    }

    // ── Instances ─────────────────────────────────────────────────────────────

    getWebhook(id: string): IWebhook | undefined {
        if (this.instances.has(id)) return this.instances.get(id)
        const Ctor = this.registeredWebhooks.get(id)
        if (!Ctor) return undefined
        const instance = new Ctor()
        instance.startWebhook?.(this).catch(err => logError(ELogComponent.CORE, `Webhook '${id}' startWebhook error: ${err}`))
        this.instances.set(id, instance)
        return instance
    }

    // ── Token registry ──────────────────────────────────────────────────────────

    private configKey(webhookId: string, configName: string): string {
        return `${webhookId}:${configName}`
    }

    private splitKey(key: string): [string, string] {
        const idx = key.indexOf(':')
        return [key.slice(0, idx), key.slice(idx + 1)]
    }

    private ensureToken(webhookId: string, configName: string): string {
        const key = this.configKey(webhookId, configName)
        const existing = this.tokenByConfig.get(key)
        if (existing) return existing
        const token = crypto.randomBytes(24).toString('base64url')
        this.tokenByConfig.set(key, token)
        this.configByToken.set(token, { webhookId, configName })
        return token
    }

    private evictToken(webhookId: string, configName: string): void {
        const key = this.configKey(webhookId, configName)
        const token = this.tokenByConfig.get(key)
        if (token) this.configByToken.delete(token)
        this.tokenByConfig.delete(key)
    }

    private persistTokens(): void {
        const data: Record<string, string> = {}
        for (const [key, token] of this.tokenByConfig) data[key] = token
        this.configMaps.write('kwirth-webhook-tokens', data).catch((err: unknown) =>
            logError(ELogComponent.CORE, `Failed to persist webhook tokens: ${err}`)
        )
    }

    // Resuelve un token entrante → webhook/config. Undefined si el token no existe.
    resolve(token: string): IWebhookResolution | undefined {
        const ref = this.configByToken.get(token)
        if (!ref) return undefined
        const config = this.getConfig(ref.webhookId, ref.configName)
        if (!config) return undefined
        return { webhookId: ref.webhookId, configName: ref.configName, config }
    }

    // ── IWebhookAccess (inyectado en consumidores) ────────────────────────────────

    // Suscripción por par estricto (webhookId, configName): recibes SOLO los eventos de ESA config. Los webhooks
    // son generales de Kwirth (varias configs/consumidores del mismo tipo) → cada consumidor fija su instancia.
    subscribe(webhookId: string, configName: string, consumer: IWebhookConsumer): void {
        const key = this.configKey(webhookId, configName)
        if (!this.subscribers.has(key)) this.subscribers.set(key, new Set())
        this.subscribers.get(key)!.add(consumer)
    }

    unsubscribe(webhookId: string, configName: string, consumer: IWebhookConsumer): void {
        this.subscribers.get(this.configKey(webhookId, configName))?.delete(consumer)
    }

    // Entrega un evento verificado+parseado a los consumidores suscritos a ESA config (par webhookId+configName).
    deliver(webhookId: string, configName: string, event: IWebhookEvent): void {
        const consumers = this.subscribers.get(this.configKey(webhookId, configName))
        if (!consumers || consumers.size === 0) {
            logWarning(ELogComponent.CORE, `Webhook '${webhookId}' config '${configName}' event has no subscribers — dropped`)
            return
        }
        for (const consumer of consumers) {
            try { consumer.processWebhookEvent(event) } catch (err) {
                logError(ELogComponent.CORE, `Webhook '${webhookId}' consumer threw: ${err}`)
            }
        }
    }

    // Lista los webhooks INSTALADOS (npm + dev), con sus configs desde el configStore (fuente autoritativa) — NO
    // desde `instances`, que se pueblan de forma lazy (un webhook sin callbacks aún no está instanciado y no saldría).
    listWebhooks(): Array<{ id: string; configNames: string[] }> {
        const ids = new Set<string>([...this.installedIds, ...this.devWebhooks.keys(), ...this.configStore.keys()])
        return Array.from(ids).map(id => ({
            id,
            configNames: Array.from(this.configStore.get(id)?.values() ?? []).map(c => c.name),
        }))
    }

    getUrl(webhookId: string, configName: string): string | undefined {
        const token = this.tokenByConfig.get(this.configKey(webhookId, configName))
        if (!token) return undefined
        return `${this.urlBase}/${webhookId}/${token}`
    }

    rotateToken(webhookId: string, configName: string): string {
        this.evictToken(webhookId, configName)
        const token = this.ensureToken(webhookId, configName)
        this.persistTokens()
        return token
    }

    // ── Config management ─────────────────────────────────────────────────────────

    private addConfigInternal(webhookId: string, config: IWebhookConfig): boolean {
        const webhook = this.getWebhook(webhookId)
        if (!webhook) {
            logError(ELogComponent.CORE, `Webhook '${webhookId}' not found — cannot add config '${config.name}'`)
            return false
        }
        const alreadyExists = this.configStore.has(webhookId) && this.configStore.get(webhookId)!.has(config.name)
        webhook.addConfig(config)
        if (!this.configStore.has(webhookId)) this.configStore.set(webhookId, new Map())
        this.configStore.get(webhookId)!.set(config.name, { ...config })
        this.ensureToken(webhookId, config.name)
        if (!alreadyExists) logInfo(ELogComponent.CORE, `Webhook '${webhookId}' config '${config.name}' registered`)
        return true
    }

    private persistWebhookConfig(webhookId: string): void {
        const configs = Array.from(this.configStore.get(webhookId)?.values() ?? [])
        const data: IWebhookStoredConfig = { configs }
        this.configMaps.writeKey('kwirth-webhook-configs', webhookId, data).catch((err: unknown) =>
            logError(ELogComponent.CORE, `Failed to persist webhook '${webhookId}' configs: ${err}`)
        )
    }

    addConfig(webhookId: string, config: IWebhookConfig): boolean {
        const ok = this.addConfigInternal(webhookId, config)
        if (ok) {
            this.persistWebhookConfig(webhookId)
            this.persistTokens()
        }
        return ok
    }

    removeConfig(webhookId: string, configName: string): boolean {
        const webhook = this.getWebhook(webhookId)
        if (!webhook) return false
        webhook.removeConfig(configName)
        this.configStore.get(webhookId)?.delete(configName)
        this.evictToken(webhookId, configName)
        this.persistWebhookConfig(webhookId)
        this.persistTokens()
        return true
    }

    getWebhookStoredConfig(webhookId: string): IWebhookStoredConfig {
        const configs = Array.from(this.configStore.get(webhookId)?.values() ?? [])
        return { configs }
    }

    setWebhookStoredConfig(webhookId: string, data: IWebhookStoredConfig): boolean {
        const webhook = this.getWebhook(webhookId)
        if (!webhook) return false
        for (const name of Array.from(this.configStore.get(webhookId)?.keys() ?? [])) {
            webhook.removeConfig(name)
            this.evictToken(webhookId, name)
        }
        this.configStore.delete(webhookId)
        for (const config of (data.configs as IWebhookConfig[])) {
            this.addConfigInternal(webhookId, config)
        }
        this.persistWebhookConfig(webhookId)
        this.persistTokens()
        return true
    }

    getSchema(webhookId: string): IWebhookFieldDef[] {
        const webhook = this.getWebhook(webhookId)
        return webhook?.getConfigSchema?.() ?? []
    }

    getConfigs(webhookId: string): IWebhookConfig[] {
        return Array.from(this.configStore.get(webhookId)?.values() ?? [])
    }

    getConfig(webhookId: string, configName: string): IWebhookConfig | undefined {
        return this.configStore.get(webhookId)?.get(configName)
    }

    exportAll(): Record<string, IWebhookConfig[]> {
        const result: Record<string, IWebhookConfig[]> = {}
        for (const [id, configs] of this.configStore) {
            result[id] = Array.from(configs.values())
        }
        return result
    }

    async stopAll(): Promise<void> {
        for (const [id, instance] of this.instances) {
            try { await instance.stopWebhook?.() } catch (err) {
                logError(ELogComponent.CORE, `Webhook '${id}' stopWebhook error: ${err}`)
            }
        }
        this.instances.clear()
    }

    // ── Utilities ───────────────────────────────────────────────────────────────

    private downloadFile(url: string, destPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http
            const file = fs.createWriteStream(destPath)
            protocol.get(url, { headers: { 'User-Agent': 'kwirth/1.0' } }, res => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    file.close()
                    this.downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
                    return
                }
                if (res.statusCode && res.statusCode !== 200) {
                    file.close()
                    reject(new Error(`HTTP ${res.statusCode} downloading ${url}`))
                    return
                }
                res.pipe(file)
                file.on('finish', () => { file.close(); resolve() })
            }).on('error', err => { file.close(); reject(err) })
        })
    }
}
