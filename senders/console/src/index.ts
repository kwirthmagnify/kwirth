import { ISender, ISenderAccess, ISenderConfig, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

// ─── Config ────────────────────────────────────────────────────────────────────

export interface IConsoleSenderConfig extends ISenderConfig {
    name: string
    prefix?: string       // string prepended to every line, e.g. '[KWIRTH]'
    timestamps?: boolean  // include ISO timestamp (default: true)
    levels?: boolean      // include level tag like [ERROR] (default: true)
}

const LEVEL_COLORS: Record<string, string> = {
    debug:   '\x1b[36m',   // cyan
    info:    '\x1b[32m',   // green
    warning: '\x1b[33m',   // yellow
    error:   '\x1b[31m',   // red
}
const RESET = '\x1b[0m'

// ─── Sender ────────────────────────────────────────────────────────────────────

export class ConsoleSender implements ISender {
    readonly id = 'console'
    private configs = new Map<string, IConsoleSenderConfig>()

    addConfig(config: ISenderConfig): void {
        this.configs.set(config.name, config as IConsoleSenderConfig)
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

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`ConsoleSender: config '${configName}' not found`)

        const useTimestamps = config.timestamps ?? true
        const useLevels     = config.levels ?? true
        const prefix        = config.prefix ? `${config.prefix} ` : ''

        const ts    = useTimestamps ? `[${new Date().toISOString()}] ` : ''
        const level = message.level ?? 'info'
        const lvTag = useLevels ? `[${level.toUpperCase()}] ` : ''
        const color = LEVEL_COLORS[level] ?? ''

        const subject = message.subject ? `${message.subject}: ` : ''
        const to      = message.to ? ` → ${Array.isArray(message.to) ? message.to.join(', ') : message.to}` : ''

        const line = `${color}${ts}${prefix}${lvTag}${subject}${message.body}${to}${RESET}`

        if (level === 'error') {
            console.error(line)
        } else if (level === 'warning') {
            console.warn(line)
        } else {
            console.log(line)
        }
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}
    async stopSender(): Promise<void> {}
}

export default ConsoleSender
