import { format } from 'util'

/*
    A circular buffer of the last N lines written to stdout/stderr.

    It exists for the case where there is no Kubernetes API: in a pod, the kubelet keeps the container's
    log and the Status plugin reads it through the core's REST endpoint. In ECS, ACI, Cloud Run or a bare
    process there is no such thing, and the only source of the log is the process's own stdout. This
    buffer captures it in memory so the CoreLogProvider can hand it to the Status plugin.

    The buffer is ALWAYS capturing — it costs a few KB and a function call per line — but the provider
    that exposes it is only instantiated when the core has no Kubernetes API, so in a pod the REST
    endpoint stays the source and nothing travels over the WebSocket.

    The size is configurable through KWIRTH_LOG_BUFFER_LINES and defaults to 5000.
*/

const DEFAULT_MAX_LINES = 5000

class LogBuffer {
    private lines: string[] = []
    private maxSize: number

    constructor(maxSize: number = DEFAULT_MAX_LINES) {
        this.maxSize = Math.max(1, maxSize)
    }

    /**
     * Pushes a line into the buffer. Multi-line output (e.g. an Error stack) is split into individual
     * lines so each one occupies a slot — 'the last 5000 lines' means 5000 lines, not 5000 console calls.
     */
    add = (line: string): void => {
        const parts = line.split('\n')
        for (const part of parts) {
            this.lines.push(part)
        }
        if (this.lines.length > this.maxSize) {
            this.lines = this.lines.slice(-this.maxSize)
        }
    }

    /** The last `count` lines, in the order they were written. */
    getLines = (count: number = this.maxSize): string[] => {
        const n = Math.min(count, this.lines.length)
        if (n <= 0) return []
        return this.lines.slice(-n)
    }

    /** Resizes the buffer. Lines beyond the new size are dropped. Applied hot from the settings. */
    resize = (maxSize: number): void => {
        this.maxSize = Math.max(1, maxSize)
        if (this.lines.length > this.maxSize) {
            this.lines = this.lines.slice(-this.maxSize)
        }
    }

    /** The current capacity, for the settings GET to return what actually rules. */
    getMaxSize = (): number => this.maxSize
}

/*
    The singleton. Created once, at module load time, so there is a single buffer for the whole process.

    The monkey-patch of console.log/console.error happens here too, and it is the reason this module must
    be imported BEFORE the first log line is written: anything logged before the import is lost to the
    buffer. The original functions are preserved and still called, so stdout is unchanged.
*/
const coreLogBuffer = new LogBuffer(DEFAULT_MAX_LINES)

const originalLog = console.log
const originalError = console.error

console.log = (...args: unknown[]): void => {
    coreLogBuffer.add(format(...args))
    originalLog(...args)
}

console.error = (...args: unknown[]): void => {
    coreLogBuffer.add(format(...args))
    originalError(...args)
}

export { coreLogBuffer, LogBuffer }
