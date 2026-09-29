import { monitorEventLoopDelay, IntervalHistogram } from 'perf_hooks'
import { IStatusProcess } from '../common/StatusTypes'

/*
    What the Performance tab shows about the Kwirth process.

    Memory, CPU time and uptime are read when a snapshot is taken: they are counters the process already
    keeps, so reading them costs nothing. The event-loop delay is different — it has to be SAMPLED while
    time passes — so its histogram is switched on only while somebody is looking at a status tab, and
    switched off with the last one. With the channel closed nothing runs, which is the rule of this plugin.

    Each snapshot reads what the histogram saw since the previous one and resets it, so the figure is
    about that interval and not an average since the tab was opened.
*/

/** Resolution of the event-loop sampler, in ms. 20 ms is the Node default and cheap enough. */
const RESOLUTION_MS = 20

const NS_PER_MS = 1e6

export class ProcessProbe {
    private delay?: IntervalHistogram

    /** Switches the event-loop sampler on or off. Idempotent: called on every connection change. */
    watch = (someoneLooking: boolean): void => {
        if (someoneLooking && !this.delay) {
            this.delay = monitorEventLoopDelay({ resolution: RESOLUTION_MS })
            this.delay.enable()
        }
        else if (!someoneLooking && this.delay) {
            this.delay.disable()
            this.delay = undefined
        }
    }

    get watching(): boolean {
        return Boolean(this.delay)
    }

    sample = (): IStatusProcess => {
        const memory = process.memoryUsage()
        const cpu = process.cpuUsage()
        return {
            pid: process.pid,
            nodeVersion: process.version,
            uptimeSeconds: Math.round(process.uptime()),
            rssBytes: memory.rss,
            heapUsedBytes: memory.heapUsed,
            heapTotalBytes: memory.heapTotal,
            externalBytes: memory.external,
            cpuUserMicros: cpu.user,
            cpuSystemMicros: cpu.system,
            ...this.readDelay()
        }
    }

    private readDelay = (): Pick<IStatusProcess, 'eventLoop'> => {
        const h = this.delay
        // No samples yet (just switched on): unknown, not zero.
        if (!h || h.count === 0) return {}
        const eventLoop = { meanMs: h.mean / NS_PER_MS, p99Ms: h.percentile(99) / NS_PER_MS, maxMs: h.max / NS_PER_MS }
        h.reset()
        return { eventLoop }
    }
}
