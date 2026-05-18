import { ISender, ISenderAccess, ISenderConfig, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import fs from 'fs'
import path from 'path'

// ─── Config ────────────────────────────────────────────────────────────────────

export interface IFileSenderConfig extends ISenderConfig {
    name: string
    filePath: string       // absolute or relative path to the log file
    timestamps?: boolean   // include ISO timestamp (default: true)
    levels?: boolean       // include level tag (default: true)
    maxLines?: number      // if set, rotate file when it exceeds this many lines (0 = no limit)
}

// ─── Sender ────────────────────────────────────────────────────────────────────

export class FileSender implements ISender {
    readonly id = 'file'
    private configs = new Map<string, IFileSenderConfig>()
    private lineCounts = new Map<string, number>()  // configName -> current line count

    addConfig(config: ISenderConfig): void {
        const fc = config as IFileSenderConfig
        this.configs.set(fc.name, fc)

        // Count existing lines so rotation respects pre-existing content
        const resolved = path.resolve(fc.filePath)
        if (fs.existsSync(resolved)) {
            try {
                const content = fs.readFileSync(resolved, 'utf-8')
                this.lineCounts.set(fc.name, content.split('\n').length - 1)
            } catch {
                this.lineCounts.set(fc.name, 0)
            }
        } else {
            // Ensure parent directory exists
            fs.mkdirSync(path.dirname(resolved), { recursive: true })
            this.lineCounts.set(fc.name, 0)
        }
    }

    removeConfig(name: string): void {
        this.configs.delete(name)
        this.lineCounts.delete(name)
    }

    hasConfig(name: string): boolean {
        return this.configs.has(name)
    }

    getConfigNames(): string[] {
        return Array.from(this.configs.keys())
    }

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`FileSender: config '${configName}' not found`)

        const useTimestamps = config.timestamps ?? true
        const useLevels     = config.levels ?? true

        const ts    = useTimestamps ? `[${new Date().toISOString()}] ` : ''
        const level = message.level ?? 'info'
        const lvTag = useLevels ? `[${level.toUpperCase()}] ` : ''

        const subject = message.subject ? `${message.subject}: ` : ''
        const to      = message.to ? ` → ${Array.isArray(message.to) ? message.to.join(', ') : message.to}` : ''

        const line = `${ts}${lvTag}${subject}${message.body}${to}\n`

        const resolved = path.resolve(config.filePath)

        // Rotate if maxLines is set and exceeded
        const maxLines   = config.maxLines ?? 0
        const lineCount  = this.lineCounts.get(configName) ?? 0
        if (maxLines > 0 && lineCount >= maxLines) {
            const rotated = `${resolved}.${Date.now()}.bak`
            try { fs.renameSync(resolved, rotated) } catch {}
            this.lineCounts.set(configName, 0)
        }

        fs.appendFileSync(resolved, line, 'utf-8')
        this.lineCounts.set(configName, (this.lineCounts.get(configName) ?? 0) + 1)
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}

    async stopSender(): Promise<void> {
        // Nothing to flush — appendFileSync is synchronous
    }
}

export default FileSender
