import { ISender, ISenderAccess, ISenderConfig, ISenderFieldDef, ISenderMessage } from '@kwirthmagnify/kwirth-common-back'

const TIMEZONES = [
    'UTC',
    // Europe
    'Europe/London', 'Europe/Dublin', 'Europe/Lisbon',
    'Europe/Madrid', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Amsterdam',
    'Europe/Brussels', 'Europe/Vienna', 'Europe/Zurich', 'Europe/Stockholm', 'Europe/Oslo',
    'Europe/Copenhagen', 'Europe/Helsinki', 'Europe/Warsaw', 'Europe/Prague', 'Europe/Budapest',
    'Europe/Bucharest', 'Europe/Athens', 'Europe/Istanbul', 'Europe/Kiev', 'Europe/Moscow',
    // Americas
    'America/New_York', 'America/Toronto', 'America/Montreal',
    'America/Chicago', 'America/Winnipeg',
    'America/Denver', 'America/Edmonton',
    'America/Los_Angeles', 'America/Vancouver',
    'America/Phoenix', 'America/Anchorage', 'America/Honolulu',
    'America/Mexico_City', 'America/Bogota', 'America/Lima',
    'America/Santiago', 'America/Buenos_Aires', 'America/Sao_Paulo',
    'America/Caracas', 'America/Halifax', 'America/St_Johns',
    // Asia
    'Asia/Jerusalem', 'Asia/Beirut', 'Asia/Riyadh', 'Asia/Dubai', 'Asia/Tehran',
    'Asia/Karachi', 'Asia/Kolkata', 'Asia/Colombo', 'Asia/Dhaka',
    'Asia/Bangkok', 'Asia/Jakarta', 'Asia/Singapore', 'Asia/Kuala_Lumpur',
    'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Taipei',
    'Asia/Seoul', 'Asia/Tokyo',
    // Africa
    'Africa/Casablanca', 'Africa/Lagos', 'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Cairo',
    // Pacific / Australia
    'Australia/Perth', 'Australia/Adelaide', 'Australia/Darwin',
    'Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne',
    'Pacific/Auckland', 'Pacific/Fiji', 'Pacific/Honolulu',
]

// ─── Config ────────────────────────────────────────────────────────────────────

export interface ITimedSenderRule {
    from: string
    to: string
    days?: number[]
    action: 'send' | 'drop'
}

export interface ITimedSenderConfig extends ISenderConfig {
    name: string
    rules: ITimedSenderRule[]
    defaultAction?: 'send' | 'drop'
    timezone?: string
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function tzOffset(tz: string): string {
    try {
        const part = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
            .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? ''
        return part.replace('GMT', 'UTC')
    } catch { return '' }
}

function parseMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
}

function currentContext(timezone?: string): { minutes: number; day: number } {
    const now = timezone
        ? new Date(new Date().toLocaleString('en-US', { timeZone: timezone }))
        : new Date()
    return { minutes: now.getHours() * 60 + now.getMinutes(), day: now.getDay() }
}

function matchesWindow(rule: ITimedSenderRule, minutes: number, day: number): boolean {
    if (rule.days && rule.days.length > 0 && !rule.days.includes(day)) return false
    const from = parseMinutes(rule.from)
    const to   = parseMinutes(rule.to)
    return from <= to
        ? minutes >= from && minutes < to                // normal: 09:00–18:00
        : minutes >= from || minutes < to                // overnight: 22:00–06:00
}

// ─── Sender ────────────────────────────────────────────────────────────────────

export class TimedSender implements ISender {
    readonly id = 'timed'
    readonly senderType = 'filter' as const
    private configs = new Map<string, ITimedSenderConfig>()

    addConfig(config: ISenderConfig): void {
        const tc = config as ITimedSenderConfig
        if (!Array.isArray(tc.rules)) tc.rules = []
        this.configs.set(tc.name, tc)
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

    getNodeMeta() {
        return { label: 'Timed filter', icon: 'AccessTime', description: 'Routes or drops messages based on time-of-day windows and day-of-week rules.' }
    }

    async send(_configName: string, _message: ISenderMessage): Promise<void> {}

    async evalFilter(configName: string, _message: ISenderMessage, forward: () => Promise<void>): Promise<void> {
        const config = this.configs.get(configName)
        if (!config) return
        const { minutes, day } = currentContext(config.timezone)
        for (const rule of config.rules ?? []) {
            if (!matchesWindow(rule, minutes, day)) continue
            if (rule.action === 'send') await forward()
            return
        }
        if ((config.defaultAction ?? 'drop') === 'send') await forward()
    }

    getConfigSchema(): ISenderFieldDef[] {
        return [
            { name: 'name',          label: 'Name',           required: true },
            { name: 'timezone',      label: 'Timezone',       type: 'select', options: TIMEZONES, labels: TIMEZONES.map(tz => { const off = tzOffset(tz); return off ? `${tz} (${off})` : tz }) } as unknown as ISenderFieldDef,
            { name: 'rules',         label: 'Rules (JSON)',   type: 'json' },
            { name: 'defaultAction', label: 'Default action', type: 'select', options: ['drop', 'send'] },
        ]
    }

    async startSender(_senders: ISenderAccess): Promise<void> {}

    async stopSender(): Promise<void> {}
}

export default TimedSender
