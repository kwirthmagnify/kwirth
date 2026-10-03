import { EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction } from '@kwirthmagnify/kwirth-common'

/**
 * High-score table. Lives in the back, in a cluster ConfigMap (`writeStorage`).
 * `LocalScoreStore` is a safety net for when there is no socket.
 */

export interface IScoreEntry {
    name: string
    score: number
    level: number
    /** ISO 8601. The real date is set by the back on save. */
    date: string
}

export interface IScoreStore {
    load(): Promise<IScoreEntry[]>
    submit(entry: IScoreEntry): Promise<IScoreEntry[]>
}

export const MAX_SCORES = 10
export const MAX_NAME = 24

export const MSG_SCORES_GET = 'rallyx-scores-get'
export const MSG_SCORE_SUBMIT = 'rallyx-score-submit'
export const MSG_SCORES = 'rallyx-scores'

/** Maximum wait time for the back to answer. */
const TIMEOUT_MS = 5000

export const sortAndTrim = (entries: IScoreEntry[]): IScoreEntry[] =>
    [...entries].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES)

/** A score enters the table if there is room or it beats the last entry. */
export const qualifies = (entries: IScoreEntry[], score: number): boolean => {
    if (score <= 0) return false
    if (entries.length < MAX_SCORES) return true
    return score > entries[entries.length - 1].score
}

export const sanitizeEntries = (raw: any): IScoreEntry[] => {
    if (!Array.isArray(raw)) return []
    return sortAndTrim(raw
        .filter((e: any) => e && typeof e.score === 'number' && typeof e.name === 'string')
        .map((e: any): IScoreEntry => ({
            name: String(e.name).slice(0, MAX_NAME),
            score: e.score,
            level: typeof e.level === 'number' ? e.level : 0,
            date: typeof e.date === 'string' ? e.date : '',
        })))
}

// ── Cluster score store, against the back ──────────────────────────────────

export type TSend = (message: unknown) => boolean

export const socketSender = (getWebSocket: () => WebSocket | undefined): TSend =>
    (message: unknown): boolean => {
        try {
            const webSocket = getWebSocket()
            if (!webSocket || webSocket.readyState !== WebSocket.OPEN) return false
            webSocket.send(JSON.stringify(message))
            return true
        }
        catch {
            return false
        }
    }

export type TSendFailure = 'not-connected' | 'timeout'

export class BackScoreStore {
    private waiters: ((entries: IScoreEntry[]) => void)[] = []
    private timers: ReturnType<typeof setTimeout>[] = []

    lastFailure?: TSendFailure

    constructor(private readonly send: TSend, private readonly instanceId: () => string, private readonly accessKey: () => string) { }

    private request(msgtype: string, extra: Record<string, unknown> = {}): Promise<IScoreEntry[]> {
        const sent = this.send({
            msgtype,
            action: EInstanceMessageAction.COMMAND,
            flow: EInstanceMessageFlow.REQUEST,
            type: EInstanceMessageType.DATA,
            channel: 'rallyx',
            instance: this.instanceId(),
            accessKey: this.accessKey(),
            ...extra,
        })
        if (!sent) {
            this.lastFailure = 'not-connected'
            return Promise.resolve([])
        }
        this.lastFailure = undefined

        return new Promise<IScoreEntry[]>((resolve) => {
            const timer = setTimeout(() => {
                this.lastFailure = 'timeout'
                this.waiters = this.waiters.filter(w => w !== resolve)
                resolve([])
            }, TIMEOUT_MS)
            this.timers.push(timer)
            this.waiters.push(resolve)
        })
    }

    load(): Promise<IScoreEntry[]> {
        return this.request(MSG_SCORES_GET)
    }

    submit(entry: IScoreEntry): Promise<IScoreEntry[]> {
        return this.request(MSG_SCORE_SUBMIT, { entry })
    }

    resolve(entries: IScoreEntry[]): void {
        for (const timer of this.timers) clearTimeout(timer)
        this.timers = []
        const waiters = this.waiters
        this.waiters = []
        for (const waiter of waiters) waiter(entries)
    }
}

// ── Safety net: no socket, local score ──────────────────────────────────────

const STORAGE_KEY = 'kwirth.rallyx.scores'

export class LocalScoreStore {
    async load(): Promise<IScoreEntry[]> {
        try {
            const raw = localStorage.getItem(STORAGE_KEY)
            return raw ? sanitizeEntries(JSON.parse(raw)) : []
        }
        catch {
            return []
        }
    }

    async submit(entry: IScoreEntry): Promise<IScoreEntry[]> {
        const updated = sortAndTrim([...(await this.load()), entry])
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) }
        catch { /* disabled or full */ }
        return updated
    }
}
