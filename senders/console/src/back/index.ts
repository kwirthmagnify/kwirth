import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

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

/*
    What the core lends the sender to write with. Declared here structurally rather than imported
    from kwirth-common-back, so this sender does not depend on a particular version of it.
*/
interface IExtensionLogger {
    info(message: unknown): void
    warning(message: unknown): void
    error(message: unknown): void
}

export class ConsoleSender implements ISender {
    readonly id = 'console'
    readonly senderType = 'output' as const
    /*
        This sender is a special case: its DESTINATION is the log, so what it delivers goes through
        the logger the core hands it and comes out like every other line of the back —
        '[15:46:08] [send] [WARN] [console] ...' — instead of with a format of its own.

        Until the core hands one over, it writes to the console exactly as before: that fallback is
        also what keeps it working on an older core.
    */
    private log: IExtensionLogger | undefined
    setLogger = (logger: IExtensionLogger): void => { this.log = logger }
    private configs = new Map<string, IConsoleSenderConfig>()
    getNodeMeta() { return { label: 'Console', icon: 'Terminal' } }

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

        const prefix  = config.prefix ? `${config.prefix} ` : ''
        const level   = message.level ?? 'info'
        const subject = message.subject ? `${message.subject}: ` : ''
        const to      = message.to ? ` → ${Array.isArray(message.to) ? message.to.join(', ') : message.to}` : ''
        const body    = `${prefix}${subject}${message.body}${to}`

        /*
            With a logger, the timestamp and the level are the core's, and they come out in the same
            shape as the rest of the back. That is why 'timestamps' and 'levels' no longer apply
            here: they existed to compensate for not having any of this.
        */
        if (this.log) {
            if (level === 'error') this.log.error(body)
            else if (level === 'warning') this.log.warning(body)
            else this.log.info(body)
            return
        }

        // With no logger (an older core): the usual format, with its usual configuration.
        const useTimestamps = config.timestamps ?? true
        const useLevels     = config.levels ?? true
        const ts    = useTimestamps ? `[${new Date().toISOString()}] ` : ''
        const lvTag = useLevels ? `[${level.toUpperCase()}] ` : ''
        const color = LEVEL_COLORS[level] ?? ''
        const line  = `${color}${ts}${prefix}${lvTag}${subject}${message.body}${to}${RESET}`

        if (level === 'error') {
            console.error(line)
        } else if (level === 'warning') {
            console.warn(line)
        } else {
            console.log(line)
        }
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name', label: 'Name', required: true },
            { name: 'prefix', label: 'Prefix' },
            { name: 'timestamps', label: 'Timestamps', type: 'boolean' },
            { name: 'levels', label: 'Levels', type: 'boolean' },
        ]
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}
    async stopSender(): Promise<void> {}
}

export default ConsoleSender
