// common-sql (back) — servicio de almacenamiento relacional provisionado (pg).
//
// - El core llama configure(server) al arranque (conexión admin-provista).
// - Cada extensión pide su almacén: ensureDb(consumerId) (async, provisión, una vez) y
//   luego getDb(consumerId) (SÍNCRONO, devuelve el Knex ya listo — compat con el uso inline
//   de Defender: getDb('x')(TABLE).insert(...), transacciones, genéricos).
// - Aislamiento: BD-por-consumidor -> BD física 'kwirth_<consumerId>'.
// - Motor: pg (via knex). El tipo ISqlServer.client deja el hook para otros motores en el futuro.

import knexFactory from 'knex'
import type { Knex } from 'knex'
import { ISqlServer } from './index'

// Re-export para que las extensiones no bundleen el driver.
export { default as knex } from 'knex'
export type { Knex } from 'knex'

/** Dimensión del pool de conexiones de un consumidor. Cada extensión pasa la suya en ensureDb. */
export interface IPoolOptions {
    min?: number                 // conexiones mantenidas CALIENTES siempre (>0 evita crear conexión en cada query)
    max?: number                 // tope de conexiones simultáneas de ESTE pool
    idleTimeoutMillis?: number   // vida de una conexión ociosa por encima de `min` (default knex/tarn: 30s)
}
// Default de pool: min>0 mantiene conexiones calientes → sin el ~1-2s de crear conexión cuando el pool queda
// ocioso. Cada extensión sube/baja lo suyo (p.ej. iter/excubitor min:4, agora min:1) vía ensureDb.
const POOL_DEFAULT: Required<Pick<IPoolOptions, 'min' | 'max'>> = { min: 2, max: 10 }
const POOL_HEADROOM = 5   // conexiones reservadas (superusuario / otros clientes) al calcular el presupuesto

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

/** Nombre físico de la BD de un consumidor. */
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
        acquireConnectionTimeout: 5000
    })
}

const admin = (): Knex => {
    const s = requireServer()
    if (!adminPool) { adminPool = knexForDb(s.maintenanceDb ?? 'postgres'); configuredMax.set('#admin', POOL_DEFAULT.max) }
    return adminPool
}

// Aviso de presupuesto: la SUMA de los `max` de todos los pools (consumidores + admin) compite por el
// max_connections GLOBAL de Postgres. Si Σmax supera max_connections − headroom, se avisa por consola con el
// desglose por consumidor (para saber a quién recortar). Best-effort: si no se puede leer max_connections, calla.
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

// identificador saneado para nombres de BD (no parametrizables en CREATE/DROP DATABASE)
const safeIdent = (name: string): string => name.replace(/[^a-zA-Z0-9_]/g, '_')

/** La llama el CORE al arrancar: fija la conexión al servidor SQL. */
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
    // cerrar pool(s) que apunten a esta BD física
    for (const [cid, k] of [...pools]) {
        if (physicalDbName(cid) === name) { await k.destroy(); pools.delete(cid); configuredMax.delete(cid) }
    }
    await admin().raw('drop database if exists "' + safeIdent(name) + '"')
}

export const listDbs = async (): Promise<string[]> => {
    const r = await admin().raw('select datname from pg_database where datistemplate = false order by 1')
    return r.rows.map((x: { datname: string }) => x.datname)
}

/** PROVISIÓN (async, una vez): asegura la BD del consumidor y abre el pool. Devuelve el Knex listo. */
export const ensureDb = async (consumerId: string, pool?: IPoolOptions): Promise<Knex> => {
    const existing = pools.get(consumerId)
    if (existing) return existing
    const name = physicalDbName(consumerId)
    await createDb(name)
    const opts: IPoolOptions = { ...POOL_DEFAULT, ...(pool ?? {}) }
    const k = knexForDb(name, opts)
    await k.raw('select 1')          // valida conexión
    pools.set(consumerId, k)
    configuredMax.set(consumerId, opts.max ?? POOL_DEFAULT.max)
    await warnIfBudgetExceeded()
    return k
}

/** USO DIARIO (SÍNCRONO): devuelve el Knex ya provisionado. Lanza si no se llamó ensureDb antes. */
export const getDb = (consumerId: string): Knex => {
    const k = pools.get(consumerId)
    if (!k) throw new Error(`[common-sql] getDb('${consumerId}') called before ensureDb('${consumerId}')`)
    return k
}

/** Esquema idempotente, memoizado por schemaId. NO cachea promesa rechazada (reintenta si la BD estaba caída). */
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
