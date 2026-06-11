import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

const UNIT_MS: Record<string, number> = { sec: 1000, min: 60_000, hour: 3_600_000, day: 86_400_000 }

export interface IRatelimitSenderConfig extends ISenderConfig {
    name: string
    limit: number
    interval: number
    unit: 'sec' | 'min' | 'hour' | 'day'
}

interface IRatelimitState {
    count: number
    windowStart: number
    queue: Array<() => Promise<void>>
    flushTimer: ReturnType<typeof setTimeout> | undefined
}

export class RatelimitSender implements ISender {
    readonly id = 'ratelimit'
    readonly senderType = 'filter' as const
    private configs = new Map<string, IRatelimitSenderConfig>()
    private states = new Map<string, IRatelimitState>()

    addConfig(config: ISenderConfig): void {
        const rc = config as IRatelimitSenderConfig
        if (!rc.limit) rc.limit = 10
        if (!rc.interval) rc.interval = 1
        if (!rc.unit) rc.unit = 'min'
        this.configs.set(rc.name, rc)
    }

    removeConfig(name: string): void {
        const state = this.states.get(name)
        if (state?.flushTimer) clearTimeout(state.flushTimer)
        this.states.delete(name)
        this.configs.delete(name)
    }

    hasConfig(name: string): boolean {
        return this.configs.has(name)
    }

    getConfigNames(): string[] {
        return Array.from(this.configs.keys())
    }

    getNodeMeta() {
        return { label: 'Rate limit', icon: 'Speed', description: 'Limits message delivery rate. Excess messages are queued and delivered in the next time window.' }
    }

    async send(_configName: string, _message: ISenderMessage): Promise<void> {}

    async evalFilter(configName: string, _message: ISenderMessage, forward: () => Promise<void>): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) return
        const intervalMs = config.interval * (UNIT_MS[config.unit] ?? 60_000)
        const now = Date.now()
        let state = this.states.get(configName)
        if (!state) {
            state = { count: 0, windowStart: now, queue: [], flushTimer: undefined }
            this.states.set(configName, state)
        }
        if (now - state.windowStart >= intervalMs) {
            state.count = 0
            state.windowStart = now
        }
        if (state.count < config.limit) {
            state.count++
            await forward()
        } else {
            state.queue.push(forward)
            if (!state.flushTimer) {
                const remaining = intervalMs - (now - state.windowStart)
                state.flushTimer = setTimeout(() => { this.flush(configName) }, remaining)
            }
        }
    }

    private async flush(configName: string): Promise<void> {
        const state = this.states.get(configName)
        if (!state) return
        state.flushTimer = undefined
        const config = this.configs.get(configName)
        if (!config) return
        const intervalMs = config.interval * (UNIT_MS[config.unit] ?? 60_000)
        state.count = 0
        state.windowStart = Date.now()
        const toFlush = state.queue.splice(0, config.limit)
        state.count = toFlush.length
        if (state.queue.length > 0) {
            state.flushTimer = setTimeout(() => { this.flush(configName) }, intervalMs)
        }
        for (const fwd of toFlush) await fwd()
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name',     label: 'Name',     required: true },
            { name: 'limit',    label: 'Limit',    type: 'number' },
            { name: 'interval', label: 'Interval', type: 'number' },
            { name: 'unit',     label: 'Unit',     type: 'select', options: ['sec', 'min', 'hour', 'day'] },
        ]
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}

    async stopSender(): Promise<void> {
        for (const state of this.states.values()) {
            if (state.flushTimer) clearTimeout(state.flushTimer)
        }
        this.states.clear()
    }
}

export default RatelimitSender
