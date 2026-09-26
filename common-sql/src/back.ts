// common-sql (back) — provisioned relational storage service (pg).
//
// - The core calls configure(server) at startup (an admin-provided connection).
// - Each extension asks for its store: ensureDb(consumerId) (async, provisioning, once) and
//   then getDb(consumerId) (SYNCHRONOUS, returns the ready Knex — compatible with Defender's
//   inline use: getDb('x')(TABLE).insert(...), transactions, generics).
// - Isolation: one DB per consumer -> the physical DB 'kwirth_<consumerId>'.
// - Engine: pg (through knex). The ISqlServer.client type leaves the hook for other engines later.

import knexFactory from 'knex'
import type { Knex } from 'knex'
import { ISqlServer } from './index'

// Re-exported so extensions do not bundle the driver.
export { default as knex } from 'knex'
export type { Knex } from 'knex'

/*
    Where this library writes. The console by default, and the consumer passes in its own with
    setSqlLogger() — the same pattern as setLogger() in providers and channels.

    It is needed because knex brings its OWN logger, which writes straight to console. Its messages came
    out loose, with no time, no level and no mention of which extension they belonged to: a bare "Acquire
    connection error" in the middle of the log, indistinguishable from any other trace and impossible to
    filter out.
*/
export interface ISqlLogger {
    info(message: unknown): void
    warning(message: unknown): void
    error(message: unknown): void
}

let log: ISqlLogger = {
    info: (message: unknown) => console.log(`[sql] ${message}`),
    warning: (message: unknown) => console.warn(`[sql] ${message}`),
    error: (message: unknown) => console.error(`[sql] ${message}`)
}

export const setSqlLogger = (logger: ISqlLogger): void => { log = logger }

/*
    Un error de base de datos, en una línea y DICIENDO ALGO.

    🔴 El caso que obliga a esto: cuando el host resuelve a varias direcciones, Node las prueba todas y, si
    fallan todas, lanza un **AggregateError** cuyo `toString()` es literalmente "AggregateError". Las causas
    reales —ECONNREFUSED, a qué dirección y a qué puerto— viven dentro de `.errors` y nadie las mira. El
    resultado es un log que dice que algo falló y ni una pista de qué, justo cuando más falta hace: con la
    base de datos caída, TODA llamada falla a la vez y todas dicen lo mismo.
*/
const oneLine = (err: unknown): string => {
    const e = err as { code?: string, address?: string, port?: number, message?: string } | undefined
    if (!e) return String(err)
    const where = e.address ? ` ${e.address}${e.port ? ':' + e.port : ''}` : ''
    return e.code ? `${e.code}${where}` : (e.message ?? String(err))
}

export const describeError = (err: unknown): string => {
    const causes = (err as { errors?: unknown[] })?.errors
    if (Array.isArray(causes) && causes.length > 0) {
        // Deduplicated: trying six addresses and failing at all of them is not six pieces of news, it is one.
        const seen = [...new Set(causes.map(oneLine))]
        return `${(err as Error)?.name ?? 'AggregateError'}: ${seen.join(' · ')}`
    }
    return oneLine(err)
}

/** A consumer's connection pool sizing. Each extension passes its own in ensureDb. */
export interface IPoolOptions {
    min?: number                 // connections always kept WARM (>0 avoids creating one on every query)
    max?: number                 // ceiling of simultaneous connections for THIS pool
    idleTimeoutMillis?: number   // life of an idle connection above `min` (knex/tarn default: 30s)
}
// Pool default: min>0 keeps connections warm → no ~1-2s connection setup when the pool goes idle. Each
// extension raises or lowers its own (iter/excubitor min:4, agora min:1, say) through ensureDb.
const POOL_DEFAULT: Required<Pick<IPoolOptions, 'min' | 'max'>> = { min: 2, max: 10 }
const POOL_HEADROOM = 5   // connections reserved (superuser / other clients) when computing the budget

let server: ISqlServer | undefined
const pools = new Map<string, Knex>()          // consumerId -> Knex (BD del consumidor)
let adminPool: Knex | undefined                // pool a la BD de mantenimiento (CREATE/DROP/list DATABASE)
const schemaReady = new Map<string, Promise<void>>()
const configuredMax = new Map<string, number>()   // consumerId (+ '#admin') -> max del pool, para el presupuesto
let maxConnections: number | undefined            // cache de SHOW max_connections (se lee una vez)

const requireServer = (): ISqlServer => {
    if (!server) throw new Error('[common-sql] not configured: call configure(server) first')
    return server
}

/** Physical name of a consumer's DB. */
export const physicalDbName = (consumerId: string): string =>
    'kwirth_' + consumerId.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()

const knexForDb = (dbName: string, pool?: IPoolOptions): Knex => {
    const s = requireServer()
    return knexFactory({
        client: s.client,
        connection: {
            host: s.host, port: s.port, user: s.user, password: s.password, database: dbName,
            ...(s.ssl ? { ssl: { rejectUnauthorized: false } } : {})
        },
        pool: { ...POOL_DEFAULT, ...(pool ?? {}) },
        acquireConnectionTimeout: 5000,
        /*
            El logger de knex, redirigido al nuestro. Sin esto escribe a console por su cuenta y sus
            mensajes salen sin hora, sin nivel y sin dueño — y pasados por describeError además DICEN qué
            pasó, en vez de un "AggregateError" pelado.
        */
        log: {
            warn: (message: unknown) => log.warning(describeError(message)),
            error: (message: unknown) => log.error(describeError(message)),
            deprecate: (message: unknown) => log.warning(describeError(message)),
            debug: (message: unknown) => log.info(describeError(message))
        }
    })
}

const admin = (): Knex => {
    const s = requireServer()
    // The MAINTENANCE pool is used on rare occasions (createDb/dropDb/SHOW): it keeps NO warm connections
    // (min:0). It also lets short-lived processes (tests and scripts) finish without live connections
    // hanging the process (consumer pools do keep them, but they are closed with closeDb).
    if (!adminPool) { adminPool = knexForDb(s.maintenanceDb ?? 'postgres', { min: 0 }); configuredMax.set('#admin', POOL_DEFAULT.max) }
    return adminPool
}

// Budget warning: the SUM of the `max` of every pool (consumers + admin) competes for Postgres's GLOBAL
// max_connections. When Σmax exceeds max_connections − headroom, a warning goes to the console with the
// per-consumer breakdown (so you know who to trim). Best-effort: if max_connections cannot be read, it
// stays quiet.
const warnIfBudgetExceeded = async (): Promise<void> => {
    try {
        if (maxConnections === undefined) {
            const r = await admin().raw('SHOW max_connections')
            maxConnections = Number(r.rows?.[0]?.max_connections ?? 0) || undefined
        }
        if (!maxConnections) return
        const sum = [...configuredMax.values()].reduce((a, b) => a + b, 0)
        if (sum > maxConnections - POOL_HEADROOM) {
            const breakdown = [...configuredMax.entries()].map(([c, m]) => `${c}=${m}`).join(', ')
            // eslint-disable-next-line no-console
            console.warn(`[common-sql] pool budget exceeded: Σmax=${sum} > max_connections=${maxConnections} − headroom ${POOL_HEADROOM}. Per-consumer max: ${breakdown}`)
        }
    }
    catch { /* best-effort: no rompemos la provisión por no poder avisar */ }
}

// sanitised identifier for DB names (they cannot be parameterised in CREATE/DROP DATABASE)
const safeIdent = (name: string): string => name.replace(/[^a-zA-Z0-9_]/g, '_')

/** Called by the CORE at startup: it pins the connection to the SQL server. */
export const configure = (s: ISqlServer): void => { server = s }

export const dbExists = async (name: string): Promise<boolean> => {
    const r = await admin().raw('select 1 from pg_database where datname = ?', [name])
    return r.rows.length > 0
}

export const createDb = async (name: string): Promise<void> => {
    if (await dbExists(name)) return
    await admin().raw('create database "' + safeIdent(name) + '"')
}

export const dropDb = async (name: string): Promise<void> => {
    // close any pool pointing at this physical DB
    for (const [cid, k] of [...pools]) {
        if (physicalDbName(cid) === name) { await k.destroy(); pools.delete(cid); configuredMax.delete(cid) }
    }
    await admin().raw('drop database if exists "' + safeIdent(name) + '"')
}

export const listDbs = async (): Promise<string[]> => {
    const r = await admin().raw('select datname from pg_database where datistemplate = false order by 1')
    return r.rows.map((x: { datname: string }) => x.datname)
}

/** PROVISIONING (async, once): ensures the consumer's DB and opens the pool. Returns the ready Knex. */
export const ensureDb = async (consumerId: string, pool?: IPoolOptions): Promise<Knex> => {
    const existing = pools.get(consumerId)
    if (existing) return existing
    const name = physicalDbName(consumerId)
    await createDb(name)
    const opts: IPoolOptions = { ...POOL_DEFAULT, ...(pool ?? {}) }
    const k = knexForDb(name, opts)
    await k.raw('select 1')          // validates the connection
    pools.set(consumerId, k)
    configuredMax.set(consumerId, opts.max ?? POOL_DEFAULT.max)
    await warnIfBudgetExceeded()
    return k
}

/** EVERYDAY USE (SYNCHRONOUS): returns the already provisioned Knex. Throws if ensureDb was not called first. */
export const getDb = (consumerId: string): Knex => {
    const k = pools.get(consumerId)
    if (!k) throw new Error(`[common-sql] getDb('${consumerId}') called before ensureDb('${consumerId}')`)
    return k
}

/** Idempotent schema, memoised by schemaId. It does NOT cache a rejected promise (it retries if the DB was down). */
export const ensureSchemaOnce = (db: Knex, schemaId: string, fn: (db: Knex) => Promise<void>): Promise<void> => {
    let p = schemaReady.get(schemaId)
    if (!p) {
        p = fn(db).catch(err => { schemaReady.delete(schemaId); throw err })
        schemaReady.set(schemaId, p)
    }
    return p
}

export const closeDb = async (consumerId?: string): Promise<void> => {
    if (consumerId) {
        const k = pools.get(consumerId)
        if (k) { await k.destroy(); pools.delete(consumerId); configuredMax.delete(consumerId) }
        return
    }
    for (const [, k] of pools) await k.destroy()
    pools.clear()
    if (adminPool) { await adminPool.destroy(); adminPool = undefined }
    schemaReady.clear()
    configuredMax.clear()
}
