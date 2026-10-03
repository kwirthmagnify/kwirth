import { EInstanceMessageType, EInstanceMessageFlow, EInstanceMessageAction } from '@kwirthmagnify/kwirth-common'

/**
 * Marcador. Vive en el back, en un ConfigMap del cluster (`writeStorage`).
 * `LocalScoreStore` es red de seguridad para cuando no hay socket.
 */

export interface IScoreEntry {
    name: string
    score: number
    level: number
    /** ISO 8601. La fecha buena la pone el back al guardar. */
    date: string
}

export interface IScoreStore {
    load(): Promise<IScoreEntry[]>
    submit(entry: IScoreEntry): Promise<IScoreEntry[]>
}

export const MAX_SCORES = 10
export const MAX_NAME = 24

export const MSG_SCORES_GET = 'pacman-scores-get'
export const MSG_SCORE_SUBMIT = 'pacman-score-submit'
export const MSG_SCORES = 'pacman-scores'

/** Tiempo maximo de espera a que conteste el back. */
const TIMEOUT_MS = 5000

export const sortAndTrim = (entries: IScoreEntry[]): IScoreEntry[] =>
    [...entries].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES)

/** Una puntuacion entra en la tabla si hay hueco o supera a la ultima. */
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

// ── Marcador del cluster, contra el back ──────────────────────────────────

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
            channel: 'pacman',
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

// ── Red de seguridad: sin socket, marcador local ──────────────────────────

const STORAGE_KEY = 'kwirth.pacman.scores'

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
        catch { /* deshabilitado o lleno */ }
        return updated
    }
}
