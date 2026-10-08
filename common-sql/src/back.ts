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
import { ISqlServer, IPoolInfo } from './index'

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
    A database error, on one line and SAYING SOMETHING.

    🔴 The case that forces this: when the host resolves to several addresses, Node tries them all and, if
    they all fail, throws an **AggregateError** whose `toString()` is literally "AggregateError". The real
    causes — ECONNREFUSED, to which address and to which port — live inside `.errors` and nobody looks at
    them. The result is a log that says something failed and not a hint of what, precisely when it is
    needed most: with the database down, EVERY call fails at once and they all say the same thing.
*/
const oneLine = (err: unknown): string => {
    const e = err as { code?: string, address?: string, port?: number, message?: string } | undefined
    if (!e) return String(err)
    const where = e.address ? ` ${e.address}${e.port ? ':' + e.port : ''}` : ''
    return e.code ? `${e.code}${where}` : (e.message ?? String(err))
}

export const describeError = (err: unknown): string => {
    /*
        🔴 knex does not hand its logger an Error, it hands it a STRING it has already formatted —
        "Acquire connection error: AggregateError [ECONNREFUSED]: \n    at internalConnectMultiple
        (node:net:1430:18)\n    at ...". Everything below works on objects, so without this the stack
        went to the log verbatim, four lines of node internals that say nothing, and the AggregateError
        stayed un-unwrapped because a string has no `.errors`.

        So a string is cut at its first stack frame and squeezed onto one line. What is kept is the
        part a human reads; what is dropped is where inside node's net module it happened, which is
        the same place every time.
    */
    if (typeof err === 'string') {
        const head = err.split(/\n\s*at /)[0]
        return head.replace(/\s+/g, ' ').trim()
    }

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

/*
    `owner` is who the pool belongs to, and it is on every line this pool writes.

    🔴 The reason it cannot live in the logger: setSqlLogger sets ONE logger for the whole process.
    A plugin that installs its own —agora does— ends up labelling every SQL message in the process
    as its own, whoever caused it, so a global logger cannot answer "who is trying to connect": it
    can only answer it wrong. The knex instance, on the other hand, is created per pool and knows.
*/
const knexForDb = (dbName: string, pool?: IPoolOptions, owner?: string): Knex => {
    const s = requireServer()
    const who = owner ?? dbName
    const say = (message: unknown): string => `${who}: ${describeError(message)}`
    return knexFactory({
        client: s.client,
        connection: {
            host: s.host, port: s.port, user: s.user, password: s.password, database: dbName,
            ...(s.ssl ? { ssl: { rejectUnauthorized: false } } : {})
        },
        pool: { ...POOL_DEFAULT, ...(pool ?? {}) },
        acquireConnectionTimeout: 5000,
        /*
            knex's logger, redirected to ours. Without this it writes to the console on its own and its
            messages come out with no time, no level and no owner — and, passed through describeError,
            they also SAY what happened instead of a bare "AggregateError".
        */
        log: {
            warn: (message: unknown) => log.warning(say(message)),
            error: (message: unknown) => log.error(say(message)),
            deprecate: (message: unknown) => log.warning(say(message)),
            debug: (message: unknown) => log.info(say(message))
        }
    })
}

const admin = (): Knex => {
    const s = requireServer()
    // The MAINTENANCE pool is used on rare occasions (createDb/dropDb/SHOW): it keeps NO warm connections
    // (min:0). It also lets short-lived processes (tests and scripts) finish without live connections
    // hanging the process (consumer pools do keep them, but they are closed with closeDb).
    /*  🔴 `min: 1`, no 0. Con 0 el pool no guarda ninguna conexión caliente, así que CADA uso paga el
        establecimiento — 1-2 s, como dice el comentario de POOL_DEFAULT. En el arranque eso es una ráfaga:
        todas las extensiones con SQL llaman a `ensureDb` casi a la vez y todas pasan por ESTE pool para
        comprobar o crear su base. Con `acquireConnectionTimeout` de 5 s, alguna pierde la carrera y el
        error que sale es el genérico de Knex, *"the pool is probably full"*, que manda a mirar al sitio
        equivocado: el servidor tenía 15 conexiones de 100 (visto en dev, 2026-10-08). Lo que vencía era el
        reloj, no el tope.  */
    if (!adminPool) { adminPool = knexForDb(s.maintenanceDb ?? 'postgres', { min: 1 }, 'maintenance'); configuredMax.set('#admin', POOL_DEFAULT.max) }
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

/*
    Recoge las sesiones que un Kwirth anterior dejó colgadas en sus bases (`kwirth_*`).

    Una conexión **`idle in transaction`** es una transacción que alguien abrió y nadie cerró: retiene su
    conexión y, según lo que tocara, los bloqueos que ya había tomado. Tras un reinicio sucio —un pod que
    muere, un `watch` que recarga el back— esas sesiones siguen vivas en el servidor porque el servidor no
    sabe que el proceso que las abrió ya no está. Visto en dev el 2026-10-08: `kwirth_iter` con una abierta
    desde hacía 23 minutos.

    🔴 **El criterio es deliberadamente estrecho, y conviene entender por qué.** NO se mata todo lo que sea
    `kwirth_*`: el mismo Postgres puede estar sirviendo a **otro Kwirth vivo**, y cortarle sus conexiones en
    pleno uso sería causar el problema que se viene a resolver. Solo se recogen las que cumplen las tres:

      · la base es `kwirth_*`                 — no se toca nada ajeno al producto
      · el estado es `idle in transaction`    — NUNCA `active`: eso es trabajo en curso de alguien
      · lleva así más de `STALE_TX_MINUTES`   — una transacción sana no pasa minutos sin hacer nada

    Con esas tres, un falso positivo exige que alguien tenga una transacción abierta y parada durante
    minutos, que ya es un bug por sí mismo.

    Best-effort: si falla (sin permisos para `pg_terminate_backend`, por ejemplo) se avisa y se sigue. No
    poder limpiar no puede impedir arrancar.
*/
const STALE_TX_MINUTES = 5

export const reapStaleSessions = async (log?: (msg: string) => void): Promise<number> => {
    try {
        const r = await admin().raw(
            `select pg_terminate_backend(pid) from pg_stat_activity
             where datname like 'kwirth\\_%' and state = 'idle in transaction'
               and state_change < now() - (? || ' minutes')::interval and pid <> pg_backend_pid()`,
            [STALE_TX_MINUTES]
        )
        const n = (r.rows as unknown[]).length
        if (n > 0) log?.(`[common-sql] reaped ${n} stale session(s) left 'idle in transaction' by a previous run`)
        return n
    }
    catch (err) {
        log?.(`[common-sql] could not reap stale sessions (ignored): ${err}`)
        return 0
    }
}

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
    /*
        Said BEFORE anything is attempted, and on purpose. Provisioning goes through the shared
        maintenance pool, so when the server is down the first error comes out labelled 'maintenance'
        and names no consumer: this is the line that says who asked for it, and where it was asked.
    */
    const s = requireServer()
    log.info(`${consumerId}: provisioning '${name}' on ${s.host}:${s.port}`)
    await createDb(name)
    const opts: IPoolOptions = { ...POOL_DEFAULT, ...(pool ?? {}) }
    const k = knexForDb(name, opts, consumerId)
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

/**
 * Runtime stats of every open connection pool, for observability (the Status plugin's SQL tab). Reads the
 * live tarn pool each Knex instance holds. Pools that have not been opened (ensureDb not called) do not
 * appear: this is what is running NOW, not what could run.
 */
export const listPools = (): IPoolInfo[] => {
    const result: IPoolInfo[] = []
    for (const [consumerId, k] of pools) {
        // knex's pool is tarn: numUsed()/numFree() are the live counts. The shape is narrowed here rather
        // than importing tarn's types, so this library does not drag them into its public surface.
        const pool = (k.client as unknown as { pool?: { numUsed?: () => number, numFree?: () => number } }).pool
        result.push({
            consumerId,
            dbName: physicalDbName(consumerId),
            used: pool?.numUsed?.() ?? 0,
            free: pool?.numFree?.() ?? 0,
            max: configuredMax.get(consumerId) ?? POOL_DEFAULT.max
        })
    }
    return result
}
