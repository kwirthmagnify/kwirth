import { Knex } from '@kwirthmagnify/kwirth-common-sql/back'
import { ensureDb } from '@kwirthmagnify/kwirth-common-sql/back'
import { EUsageScope, IUsageAmounts, IUsageLimitExceeded, IUsageService } from '@kwirthmagnify/kwirth-common-ai/back'
import { ELogComponent, logError, logInfo, logWarning } from './Logging'

/*
    The counters behind Kwirth's AI usage control (plan: plans/ai-usage-control/PLAN.md, S1).

    common-ai wraps every LLM call, but it stores nothing: it asks whoever implements IUsageService. This
    is that implementation, and it is the core's because the core is what owns the AI configuration and
    the database — the channels do not, and Pinocchio and Censor never find out any of this exists.

    ⚠️ The counters are of THIS Kwirth and only this one. Each cluster runs its own, makes its own calls
    and keeps its own totals; they are deliberately not shared, because clusters may not even be able to
    see each other and pointing them all at one database would couple them where nothing couples them
    today. The consequence is in the guide: the same API key used in several Kwirth is billed whole by
    the provider, and no single Kwirth sees that total.
*/

const CONSUMER_ID = 'core-ai-usage'
const TABLE = 'ai_usage'

/* 2026-10-06 → '2026-10-06' and '2026-10'. The window resets on its own: a new key is a new row at zero. */
const dayKey = (now: Date): string => now.toISOString().slice(0, 10)
const monthKey = (now: Date): string => now.toISOString().slice(0, 7)

const ZERO: IUsageAmounts = { tokensIn: 0, tokensOut: 0, calls: 0, cost: 0 }

interface IUsageRow {
    tokens_in: string | number
    tokens_out: string | number
    calls: string | number
    cost: string | number
}

/* Postgres returns bigint and numeric as strings, to avoid losing precision silently. */
const toAmounts = (row: IUsageRow | undefined): IUsageAmounts => row
    ? { tokensIn: Number(row.tokens_in), tokensOut: Number(row.tokens_out), calls: Number(row.calls), cost: Number(row.cost) }
    : { ...ZERO }

/*
    One row per (axis, subject, window, period). No migrations: the dev database is disposable and the
    table is created when it is missing, like the rest of Kwirth.
*/
const createTable = async (db: Knex): Promise<void> => {
    if (await db.schema.hasTable(TABLE)) return
    await db.schema.createTable(TABLE, t => {
        t.string('scope', 16).notNullable()
        t.string('subject', 128).notNullable()
        t.string('period_kind', 8).notNullable()
        t.string('period_key', 16).notNullable()
        t.bigInteger('tokens_in').notNullable().defaultTo(0)
        t.bigInteger('tokens_out').notNullable().defaultTo(0)
        t.bigInteger('calls').notNullable().defaultTo(0)
        t.decimal('cost', 18, 6).notNullable().defaultTo(0)
        t.primary(['scope', 'subject', 'period_kind', 'period_key'])
    })
    logInfo(ELogComponent.CORE, `AI usage: table '${TABLE}' created`)
}

class SqlUsageService implements IUsageService {
    readonly durable = true
    private db: Knex

    constructor(db: Knex) { this.db = db }

    async read(scope: EUsageScope, subject: string): Promise<{ daily: IUsageAmounts, monthly: IUsageAmounts }> {
        const now = new Date()
        const rows = await this.db(TABLE)
            .where({ scope, subject })
            .whereIn(['period_kind', 'period_key'], [['day', dayKey(now)], ['month', monthKey(now)]])
            .select('period_kind', 'tokens_in', 'tokens_out', 'calls', 'cost')
        return {
            daily: toAmounts(rows.find(r => r.period_kind === 'day')),
            monthly: toAmounts(rows.find(r => r.period_kind === 'month'))
        }
    }

    /*
        🔴 An UPSERT with an increment IN THE DATABASE, never read-modify-write: two instances of the same
        channel answer at the same time, and adding in memory would lose one of the two without anything
        looking broken.
    */
    async add(scope: EUsageScope, subject: string, amounts: IUsageAmounts): Promise<void> {
        const now = new Date()
        const rows = [
            { scope, subject, period_kind: 'day', period_key: dayKey(now), tokens_in: amounts.tokensIn, tokens_out: amounts.tokensOut, calls: amounts.calls, cost: amounts.cost },
            { scope, subject, period_kind: 'month', period_key: monthKey(now), tokens_in: amounts.tokensIn, tokens_out: amounts.tokensOut, calls: amounts.calls, cost: amounts.cost }
        ]
        await this.db(TABLE).insert(rows).onConflict(['scope', 'subject', 'period_kind', 'period_key']).merge({
            tokens_in: this.db.raw(`${TABLE}.tokens_in + excluded.tokens_in`),
            tokens_out: this.db.raw(`${TABLE}.tokens_out + excluded.tokens_out`),
            calls: this.db.raw(`${TABLE}.calls + excluded.calls`),
            cost: this.db.raw(`${TABLE}.cost + excluded.cost`)
        })
    }

    onCut(detail: IUsageLimitExceeded): void { warnCut(detail) }
}

/*
    What there is when SQL is not configured. Kwirth works without a database — desktop and ECS are normal
    cases, not failures — so the choice is between counting in memory and not limiting at all.

    ⚠️ These counters are LOST on every restart, which is the one thing about them that has to be said out
    loud: at startup, and in the dialog where the limits are set. A ceiling that forgets itself is still
    better than none, but only if nobody believes it is durable.
*/
class MemoryUsageService implements IUsageService {
    readonly durable = false
    private totals = new Map<string, IUsageAmounts>()

    private at(scope: EUsageScope, subject: string, period: string): IUsageAmounts {
        const key = `${scope}|${subject}|${period}`
        let value = this.totals.get(key)
        if (!value) { value = { ...ZERO }; this.totals.set(key, value) }
        return value
    }

    async read(scope: EUsageScope, subject: string): Promise<{ daily: IUsageAmounts, monthly: IUsageAmounts }> {
        const now = new Date()
        return { daily: { ...this.at(scope, subject, dayKey(now)) }, monthly: { ...this.at(scope, subject, monthKey(now)) } }
    }

    async add(scope: EUsageScope, subject: string, amounts: IUsageAmounts): Promise<void> {
        const now = new Date()
        for (const period of [dayKey(now), monthKey(now)]) {
            const target = this.at(scope, subject, period)
            target.tokensIn += amounts.tokensIn
            target.tokensOut += amounts.tokensOut
            target.calls += amounts.calls
            target.cost += amounts.cost
        }
    }

    onCut(detail: IUsageLimitExceeded): void { warnCut(detail) }
}

/* The cut, said where an operator will see it. The exception reaches the channel; this reaches the log. */
const warnCut = (detail: IUsageLimitExceeded): void => {
    logWarning(ELogComponent.CORE, `AI call BLOCKED: the ${detail.period} limit of ${detail.unit} on ${detail.scope} is reached (${detail.current} of ${detail.limit})`)
}

/*
    Builds the service the core registers. SQL when it answers, memory when it does not — and the reason
    is logged either way, so 'why is nothing being counted' is never a mystery.
*/
export const createUsageService = async (): Promise<IUsageService> => {
    try {
        const db = await ensureDb(CONSUMER_ID, { min: 1, max: 4 })
        await createTable(db)
        logInfo(ELogComponent.CORE, 'AI usage control: counters in SQL, they survive a restart')
        return new SqlUsageService(db)
    }
    catch (err) {
        logWarning(ELogComponent.CORE, `AI usage control: no SQL available (${err instanceof Error ? err.message : String(err)})`)
        logWarning(ELogComponent.CORE, 'AI usage control: counting IN MEMORY — the totals are LOST on every restart, and so are the limits that depend on them')
        return new MemoryUsageService()
    }
}

export { SqlUsageService, MemoryUsageService, createTable, dayKey, monthKey }
