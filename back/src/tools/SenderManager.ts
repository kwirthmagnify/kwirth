import { ISender, ISenderAccess, ISenderConfig, ISenderMessage, TSenderConstructor } from '@kwirthmagnify/kwirth-common-back'
import { ELogComponent, logError, logInfo } from './Logging'
import path from 'path'
import fs from 'fs'

export { ISender, ISenderConfig, ISenderMessage }

interface IDevSender {
    distPath: string
}

export class SenderManager implements ISenderAccess {
    private registeredSenders = new Map<string, TSenderConstructor>()
    private instances = new Map<string, ISender>()
    private devSenders = new Map<string, IDevSender>()

    loadDevSenders(): void {
        const devConfigPath = path.resolve(process.cwd(), 'kwirth-dev.json')
        if (!fs.existsSync(devConfigPath)) return
        try {
            const raw = JSON.parse(fs.readFileSync(devConfigPath, 'utf-8'))
            const sendersMap: Record<string, string> = raw.senders ?? {}
            for (const [id, distPath] of Object.entries(sendersMap)) {
                this.registerDevSender(id, distPath)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `Failed to load kwirth-dev.json (senders): ${err}`)
        }
    }

    private registerDevSender(id: string, distPath: string): void {
        const absPath = path.resolve(distPath)
        const backPath = path.join(absPath, 'back.js')

        this.devSenders.set(id, { distPath: absPath })
        this.reloadDevBack(id, backPath)

        try {
            fs.watch(backPath, { persistent: false }, () => {
                logInfo(ELogComponent.CORE, `[dev] Sender '${id}' back.js changed — hot-reloading`)
                // Preserve configs before reload
                const configs = this.instances.get(id)?.getConfigNames().map(name => name) ?? []
                this.reloadDevBack(id, backPath)
                logInfo(ELogComponent.CORE, `[dev] Sender '${id}' reloaded (${configs.length} config(s) will need re-registering)`)
            })
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Cannot watch '${backPath}': ${err}`)
        }

        logInfo(ELogComponent.CORE, `[dev] Sender '${id}' registered from ${absPath}`)
    }

    private reloadDevBack(id: string, backPath: string): void {
        try {
            const resolved = require.resolve(backPath)
            if (require.cache[resolved]) delete require.cache[resolved]
            const mod = require(backPath)
            const SenderClass: TSenderConstructor = mod.default ?? Object.values(mod).find(v => typeof v === 'function') as TSenderConstructor
            if (SenderClass) {
                this.registeredSenders.set(id, SenderClass)
                // Re-create instance so the hot-reload takes effect
                this.instances.delete(id)
                logInfo(ELogComponent.CORE, `[dev] Sender '${id}' backend reloaded`)
            } else {
                logError(ELogComponent.CORE, `[dev] Sender '${id}' back.js exports no class`)
            }
        } catch (err) {
            logError(ELogComponent.CORE, `[dev] Sender '${id}' reload error: ${err}`)
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Returns the singleton instance for a sender type, creating it if needed.
     */
    getSender(id: string): ISender | undefined {
        if (this.instances.has(id)) return this.instances.get(id)
        const Ctor = this.registeredSenders.get(id)
        if (!Ctor) return undefined
        const instance = new Ctor()
        instance.startSender(this).catch(err => logError(ELogComponent.CORE, `Sender '${id}' startSender error: ${err}`))
        this.instances.set(id, instance)
        return instance
    }

    /**
     * Registers a named config on a sender, creating the sender instance if needed.
     */
    addConfig(senderId: string, config: ISenderConfig): boolean {
        const sender = this.getSender(senderId)
        if (!sender) {
            logError(ELogComponent.CORE, `Sender '${senderId}' not found — cannot add config '${config.name}'`)
            return false
        }
        sender.addConfig(config)
        logInfo(ELogComponent.CORE, `Sender '${senderId}' config '${config.name}' registered`)
        return true
    }

    removeConfig(senderId: string, configName: string): boolean {
        const sender = this.instances.get(senderId)
        if (!sender) return false
        sender.removeConfig(configName)
        return true
    }

    /**
     * Sends a message through a specific sender + named config.
     */
    async send(senderId: string, configName: string, message: ISenderMessage): Promise<void> {
        const sender = this.getSender(senderId)
        if (!sender) {
            logError(ELogComponent.CORE, `Sender '${senderId}' not found — message dropped`)
            return
        }
        if (!sender.hasConfig(configName)) {
            logError(ELogComponent.CORE, `Sender '${senderId}' has no config '${configName}' — message dropped`)
            return
        }
        await sender.send(configName, message)
    }

    listSenders(): Array<{ id: string; configNames: string[] }> {
        return Array.from(this.instances.entries()).map(([id, sender]) => ({
            id,
            configNames: sender.getConfigNames(),
        }))
    }

    getRegisteredIds(): string[] {
        return Array.from(this.registeredSenders.keys())
    }

    async stopAll(): Promise<void> {
        for (const [id, instance] of this.instances) {
            try { await instance.stopSender() } catch (err) {
                logError(ELogComponent.CORE, `Sender '${id}' stopSender error: ${err}`)
            }
        }
        this.instances.clear()
    }
}
