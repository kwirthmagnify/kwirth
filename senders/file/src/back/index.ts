import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'
import fs from 'fs'
import path from 'path'

// ─── Config ────────────────────────────────────────────────────────────────────

export interface IFileSenderConfig extends ISenderConfig {
    name: string
    filePath: string       // absolute or relative path to the log file
    timestamps?: boolean   // include ISO timestamp (default: true)
    levels?: boolean       // include level tag (default: true)
    maxLines?: number      // if set, rotate file when it exceeds this many lines (0 = no limit)
    origin?: boolean       // prefix each line with where it came from (default: false)
}

// ─── Sender ────────────────────────────────────────────────────────────────────

export class FileSender implements ISender {
    readonly id = 'file'
    readonly senderType = 'output' as const
    private configs = new Map<string, IFileSenderConfig>()
    getNodeMeta() { return { label: 'File', icon: 'Description' } }
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

    /**
     * One formatted line. Shared by send() and sendBatch() so both write exactly the same thing —
     * a batch is a performance detail, not a different format.
     */
    private formatLine(config: IFileSenderConfig, message: ISenderMessage): string {
        const useTimestamps = config.timestamps ?? true
        const useLevels     = config.levels ?? true

        /*
         * The line's OWN time when the producer states it, and only otherwise the time of writing.
         * It matters with batches: a forwarder hands over a hundred lines at once, and stamping them
         * all with the moment they were written gives fifteen lines the same instant — losing exactly
         * what makes a log useful.
         */
        const cuando = message.origin?.timestamp ? new Date(message.origin.timestamp) : new Date()
        const ts    = useTimestamps ? `[${cuando.toISOString()}] ` : ''
        const level = message.level ?? 'info'
        const lvTag = useLevels ? `[${level.toUpperCase()}] ` : ''

        const subject = message.subject ? `${message.subject}: ` : ''
        const to      = message.to ? ` → ${Array.isArray(message.to) ? message.to.join(', ') : message.to}` : ''

        /*
         * Where the line came from, when the producer bothered to say it and this config asks for it.
         * Off by default: it changes the shape of every line, and existing files should keep looking
         * like they did. For log forwarding it is the whole point — without it a file of lines from
         * twenty pods is unreadable.
         */
        let origin = ''
        if ((config.origin ?? false) && message.origin) {
            const o = message.origin
            /*
             * A line from a cluster is identified by namespace/pod/container. A line from a MACHINE has
             * no namespace: what identifies it is the host plus the service that produced it — and the
             * service is the half that matters, because one machine runs many. Producers put the host
             * in the pod field on purpose (it is what a destination expects as its host), so taking
             * the Kubernetes trio whenever a pod is present dropped the service and left every line of
             * a machine looking the same, whichever service wrote it.
             */
            const etiqueta = o.namespace
                ? [o.namespace, o.pod, o.container].filter(Boolean).join('/')
                : [o.pod, o.service].filter(Boolean).join('/')
            if (etiqueta) origin = `[${etiqueta}] `
        }

        return `${ts}${lvTag}${origin}${subject}${message.body}${to}\n`
    }

    /** Rotates when maxLines is set and exceeded, counting how many lines are about to be written. */
    private rotateIfNeeded(configName: string, config: IFileSenderConfig, resolved: string, incoming: number): void {
        const maxLines  = config.maxLines ?? 0
        const lineCount = this.lineCounts.get(configName) ?? 0
        if (maxLines > 0 && lineCount + incoming > maxLines) {
            const rotated = `${resolved}.${Date.now()}.bak`
            try { fs.renameSync(resolved, rotated) } catch {}
            this.lineCounts.set(configName, 0)
        }
    }

    async send(configName: string, message: ISenderMessage): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`FileSender: config '${configName}' not found`)

        const resolved = path.resolve(config.filePath)
        this.rotateIfNeeded(configName, config, resolved, 1)

        fs.appendFileSync(resolved, this.formatLine(config, message), 'utf-8')
        this.lineCounts.set(configName, (this.lineCounts.get(configName) ?? 0) + 1)
    }

    /**
     * A whole batch in ONE write.
     *
     * This is what `sendBatch` is for: a log forwarder hands over a hundred lines at a time, and doing
     * a syscall per line turns a cheap append into the slowest part of the pipeline. The format is
     * identical to send()'s, so a file written either way reads the same.
     */
    async sendBatch(configName: string, messages: ISenderMessage[]): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) throw new Error(`FileSender: config '${configName}' not found`)
        if (messages.length === 0) return

        const resolved = path.resolve(config.filePath)
        this.rotateIfNeeded(configName, config, resolved, messages.length)

        const bloque = messages.map(m => this.formatLine(config, m)).join('')
        fs.appendFileSync(resolved, bloque, 'utf-8')
        this.lineCounts.set(configName, (this.lineCounts.get(configName) ?? 0) + messages.length)
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name', label: 'Name', required: true },
            { name: 'filePath', label: 'File path', required: true },
            /*
             * The defaults are DECLARED, not just applied further down: the dialog paints a switch from
             * the schema, so a field whose default is true but says nothing shows up as off while
             * behaving as on. What you see has to be what you get.
             */
            { name: 'timestamps', label: 'Timestamps', type: 'boolean', default: true },
            { name: 'levels', label: 'Levels', type: 'boolean', default: true },
            { name: 'maxLines', label: 'Max lines', type: 'number' },
            { name: 'origin', label: 'Prefix each line with its origin', type: 'boolean' },
        ]
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}

    async stopSender(): Promise<void> {
        // Nothing to flush — appendFileSync is synchronous
    }
}

export default FileSender
