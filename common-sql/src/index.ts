// common-sql — isomorphic types (back/front) of the shared relational storage service.

// Common storage key where the core keeps the SQL server(s) config
// (like common-ai's STORAGE_KEY_PROVIDERS/STORAGE_KEY_LLMS). It is written as a secret.
export const STORAGE_KEY_SQL_SERVERS = 'kwirth-sql-servers'

// Config of a SQL server. The admin provides it and the core injects it with configure().
export interface ISqlServer {
    id: string
    name: string
    client: string           // motor (knex). Hoy: 'pg'. Hook para otros motores en el futuro (carga dinámica del driver).
    host: string
    port: number
    user: string
    password: string
    ssl: boolean
    maintenanceDb?: string   // BD de mantenimiento para CREATE/DROP/list DATABASE (default 'postgres')
}

/** Runtime stats of one consumer's connection pool, for observability (Status plugin). */
export interface IPoolInfo {
    /** The consumer id (as passed to ensureDb). */
    consumerId: string
    /** The physical database name (`kwirth_<consumerId>`). */
    dbName: string
    /** Connections currently acquired (in use). */
    used: number
    /** Connections currently idle in the pool. */
    free: number
    /** The pool's max (ceiling of simultaneous connections for this pool). */
    max: number
    /** Most connections in use at once since the pool opened. */
    peak: number
    /** When that peak was reached (ISO). Absent while the pool has never lent a connection. */
    peakAt?: string
    /** When the pool opened (ISO): the peak counts from here. */
    openedAt: string
}

/** The server's client connections, by what they are doing right now. */
export interface ISqlConnectionCounts {
    /** Running a query. */
    active: number
    /** Open and waiting for the next query. */
    idle: number
    /** Inside a transaction that is not doing anything: holds locks while it waits. */
    idleInTransaction: number
    /** Any other state (fast-path calls, disabled, unknown). */
    other: number
}

/** One table of a database (largest first). */
export interface ISqlTableStats {
    schema: string
    name: string
    /** Table + indexes + TOAST, on disk. */
    totalBytes: number
    /** PostgreSQL's estimate of live rows (from its statistics, not a COUNT). */
    rows: number
}

/**
 * One database: what it takes on disk, who is connected and what it has done. The counters are PostgreSQL's,
 * accumulated since its statistics were last reset (usually, the server's start): a rate needs two readings.
 */
export interface ISqlDatabaseStats {
    name: string
    sizeBytes: number
    connections: number
    commits: number
    rollbacks: number
    /** Blocks read from disk. */
    blocksRead: number
    /** Blocks found in the cache. */
    blocksHit: number
    rowsRead: number
    /** Inserted + updated + deleted. */
    rowsWritten: number
    deadlocks: number
    /** Bytes written to temporary files: queries that did not fit in memory. */
    tempBytes: number
    statsResetAt?: string
    /** Its tables; absent when they could not be read (no permission on that database, say). */
    tables?: ISqlTableStats[]
}

/** The SQL server as a whole (common-sql's serverStats(), for the Status plugin's SQL tab). */
export interface ISqlServerStats {
    serverVersion: string
    /** When the server started (ISO). */
    startedAt: string
    maxConnections: number
    connections: ISqlConnectionCounts
    databases: ISqlDatabaseStats[]
}
