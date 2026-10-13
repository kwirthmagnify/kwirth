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

/*
    🔴 GANA EL PRIMERO, no el último. Antes cada llamada pisaba la anterior, y como el logger es UNO para
    todo el proceso, el resultado era que **el último plugin en arrancar se quedaba con el log SQL de
    todos**: los errores del pool de `excubitor` salían firmados `[agora]` (visto en dev, 2026-10-08). Eso
    no es un detalle cosmético — manda a buscar la fuga al plugin equivocado, y costó un rato.

    El primero es siempre el **core**, que lo instala al configurar el servidor, antes de arrancar ningún
    plugin. Su etiqueta (`[stor]`) es neutral y el `owner` del pool ya va en cada línea —`sql: excubitor:
    …`—, así que se sabe de quién es sin necesidad de que cada plugin reclame el canal.

    Un plugin que llame a esto después no rompe nada: simplemente no se le hace caso.
*/
let loggerClaimed = false

export const setSqlLogger = (logger: ISqlLogger): void => {
    if (loggerClaimed) return
    loggerClaimed = true
    log = logger
}

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
/*  Tope de una consulta. Una conexión cuya consulta no termina NUNCA vuelve al pool, así que sin esto un
    corte de red —failover, firewall, un `kubectl port-forward` degradado, la base reiniciándose— agota el
    pool de forma permanente y el canal deja de escribir hasta que alguien reinicie el proceso.

    🔴 Tiene que quedar POR DEBAJO de `acquireConnectionTimeout` (30 s), y ese es el único criterio que
    importa. Con un tope mayor —se probó con 60 s— el que espera una conexión se rinde ANTES de que la
    colgada se libere: el hueco llega cuando ya nadie lo quiere, y mientras tanto cada operación que pase
    por ahí suma su propio error. En un minuto de red rota eso son cientos de líneas de log por un fallo
    que ya estaba diagnosticado. Con 20 s, la conexión vuelve al pool **dentro** del presupuesto de espera
    del siguiente, que es lo que convierte el corte en un tropiezo en vez de en una caída.

    Holgado igualmente para este producto: lo más pesado que emite es un bulk insert de unos cientos de
    findings, que con la base sana se resuelve en milisegundos. 20 s no es el tiempo de una consulta lenta,
    es el tiempo de una consulta que no va a volver. */
const QUERY_TIMEOUT_MS = 20_000
/*  Transacción ABIERTA y sin hacer nada. Es un problema distinto del de la consulta y necesita su propio
    número: una transacción retiene locks mientras vive, así que conviene cortarla, pero el reloj corre
    ENTRE sus operaciones, no durante una de ellas.

    🔴 Cinco minutos, no los 20 s de la consulta. Se probó con 20 s y abortaba transacciones **legítimas**
    en pleno `COMMIT` (`[iter] handleEvent failed: COMMIT; - terminating connection due to
    idle-in-transaction timeout`, dev 2026-10-12): con la base lenta, el hueco entre dos operaciones de una
    transacción sana se pasa de 20 s con facilidad, y abortar ahí no protege de nada — destruye trabajo en
    curso. Una transacción que pasa CINCO MINUTOS parada, en cambio, no la está usando nadie. */
const IDLE_TX_TIMEOUT_MS = 5 * 60_000
/*
    Identidad de ESTA ejecución del proceso. Va en el `application_name` de cada conexión, y es lo que
    permite distinguir —desde el servidor y sin adivinar— una conexión VIVA de una ABANDONADA: las de otra
    ejecución del mismo consumidor son, por definición, de un proceso que ya no es éste.

    Es lo que convierte la limpieza en determinista. Un `idle_session_timeout` a secas no sabe la diferencia
    entre una conexión en reposo y una huérfana, así que o es corto y mata las vivas, o es largo y deja el
    problema ahí durante horas. Con la etiqueta no hay que elegir: se recogen al arrancar, al instante.
*/
const RUN_ID = `${process.pid}-${Date.now().toString(36)}`
const appName = (consumerId: string): string => `kwirth:${consumerId}:${RUN_ID}`
/*  Cuánto tiene que llevar OCIOSA una conexión de otra ejecución para darla por abandonada.

    No es cero por el caso de ALTA DISPONIBILIDAD: dos instancias del core contra la misma base comparten
    `consumerId` y, para el servidor, la una es "otra ejecución" de la otra. Diez minutos ociosa es algo que
    una instancia con tráfico no alcanza —el pool recicla a los 30 s lo que pasa de `min`— pero una huérfana
    sí, siempre: no la va a usar nadie nunca más. */
const ORPHAN_IDLE_MINUTES = 10
/*  Caducidad de una sesión OCIOSA: limpia las huérfanas de un proceso que murió sin poder despedirse.

    🔴 Una hora, no quince minutos. El pool CONSERVA sus conexiones mínimas (`min`) abiertas aunque no se
    usen, así que un tope corto no distingue una huérfana de una conexión viva en reposo: Postgres la cierra,
    knex no se entera hasta que intenta usarla, y la operación que le toque falla. Se vio en dev el
    2026-10-12 con 15 min — `terminating connection due to idle-session timeout` sobre conexiones del pool
    activo, no sobre fantasmas.

    Una hora sigue limpiando lo que hay que limpiar (las huérfanas medidas llevaban DÍAS, no minutos) y no
    alcanza a una instalación con tráfico, por poco que tenga. */
const IDLE_SESSION_TIMEOUT_MS = 60 * 60_000

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
    const opts: IPoolOptions = { ...POOL_DEFAULT, ...(pool ?? {}) }
    const k = knexFactory({
        client: s.client,
        connection: {
            host: s.host, port: s.port, user: s.user, password: s.password, database: dbName,
            ...(s.ssl ? { ssl: { rejectUnauthorized: false } } : {}),
            /*
                🔴 TCP keepalive. Sin esto, una conexión que muere SIN avisar —un `kubectl port-forward` que
                corta el stream, un failover, un firewall que descarta la sesión— se queda en el pool como si
                estuviera viva: tarn se la entrega al siguiente que la pida y la consulta se cuelga hasta
                agotar `acquireConnectionTimeout`. El pool acaba lleno de fantasmas, el error que sale es
                *"the pool is probably full"* —que manda a mirar a `max_connections`, donde no hay nada— y el
                servidor, mientras tanto, tan tranquilo con conexiones ociosas que ya nadie va a usar.

                Con keepalive el socket roto se detecta en segundos y la conexión se descarta y se repone.
                Solo para pg: es una opción de node-postgres, y pasársela a otro driver sería ruido.
            */
            /*
                🔴 Y un tope para la CONSULTA, no solo para conseguir la conexión.

                Lo de arriba detecta un socket que ya está roto; esto rescata el caso en que **se rompe con
                una consulta dentro**. Esa consulta no falla: se queda esperando una respuesta que no va a
                llegar, y para el pool la conexión sigue *en uso*. El keepalive acaba enterándose, pero el
                TCP tarda minutos en darse por vencido, y mientras tanto la conexión no vuelve al pool.

                Diez veces lo mismo y el pool queda agotado PARA SIEMPRE, con una firma inconfundible:

                    used=10/10 free=0 waiting=2     ← nadie en cola: no sobran peticiones, faltan conexiones

                `waiting` bajo es lo que lo distingue de una avalancha: no hay trabajo de más esperando, hay
                diez conexiones secuestradas. No se recupera solo; hay que reiniciar el proceso. Medido en dev
                durante cinco días seguidos (2026-10-07 a 10-12), con `kubectl port-forward` degradándose bajo
                carga y arrastrando a TODOS los canales del core, no solo al que escribía.

                `query_timeout` lo corta desde el CLIENTE —aborta y destruye la conexión, que es lo que
                devuelve el hueco al pool— y `statement_timeout` desde el SERVIDOR, para que la consulta no
                siga consumiendo recursos allí. El minuto es holgadísimo para cualquier consulta legítima de
                este producto (lo más pesado es un bulk insert de unos cientos de findings) y a la vez corta
                la fuga mucho antes de que el pool se vacíe.
            */
            ...(s.client.startsWith('pg') ? {
                keepAlive: true,
                keepAliveInitialDelayMillis: 10_000,
                query_timeout: QUERY_TIMEOUT_MS,
                statement_timeout: QUERY_TIMEOUT_MS,
                idle_in_transaction_session_timeout: IDLE_TX_TIMEOUT_MS,
                /*
                    🔴 Y que la sesión ABANDONADA se muera sola, que es lo que de verdad se acumulaba.

                    Cuando el proceso del back muere —un reinicio, un crash, un `kubectl port-forward` que
                    se corta— el cierre TCP no siempre llega al servidor, y Postgres se queda la sesión
                    viva e **ociosa para siempre**: su `idle_session_timeout` viene a 0 de fábrica y sus
                    keepalives tardan DOS HORAS en preguntar. Medido en dev el 2026-10-12: veinte sesiones
                    contra la base de un canal cuyo pool admite diez, dieciséis de ellas de procesos muertos
                    hacía uno y dos días.

                    No es cosmético. Cada sesión es un stream del túnel —por eso el port-forward acababa
                    dando `error creating error stream`— y en producción, con `max_connections` a 100, un
                    back que deja veinte huérfanas por reinicio agota el servidor en cinco reinicios y se
                    lleva por delante a todo lo que comparta esa base.

                    ⚠️ Va por `options`, NO como una opción más del cliente: `node-postgres` solo traduce
                    `statement_timeout` e `idle_in_transaction_session_timeout` (ver `connection-parameters.js`),
                    y cualquier otra la **ignora en silencio** — se escribiría el parámetro, no fallaría nada,
                    y las sesiones seguirían acumulándose igual. `options` llega al servidor tal cual en el
                    paquete de arranque, así que la sesión nace con su propia fecha de caducidad sin tocar la
                    configuración del servidor ni depender de quien lo administre.

                    Quince minutos queda muy por encima de lo que el pool mantiene ociosa una conexión por
                    encima de `min` (30 s), así que solo alcanza a las que ya no tienen dueño.
                */
                options: `-c idle_session_timeout=${IDLE_SESSION_TIMEOUT_MS}`,
                /*  La etiqueta que permite reconocer, desde el servidor, de QUÉ ejecución es cada conexión.
                    Es lo que hace posible recoger las huérfanas al arrancar sin tocar las vivas: ver
                    `reapOrphanSessions`. También sale en `pg_stat_activity`, así que diagnosticar deja de
                    ser adivinar de quién es cada sesión. */
                application_name: appName(who)
            } : {})
        },
        /*
            🔴 `createTimeoutMillis` por DEBAJO del `acquireConnectionTimeout`, y los dos holgados.

            Esto es lo que rompe la espiral que se vio en dev el 2026-10-09. Con 5 s de espera, el
            arranque —que pide una docena de conexiones a la vez a través de un `kubectl port-forward`—
            vencía antes de que el handshake terminase. Pero el handshake NO fallaba: la conexión acababa
            estableciéndose **en el servidor**, y el cliente ya la había abandonado. El servidor se
            quedaba con ella viva y ociosa, el pool volvía a intentarlo, y dejaba otra.

                cliente:   used=1/10 free=0 waiting=14
                servidor:  24 conexiones idle de ese mismo consumidor

            Cada abandono deja basura que hace más lento el intento siguiente —más sockets, más streams en
            el túnel—, así que la cosa EMPEORA con el tiempo en vez de estabilizarse. Cinco segundos no
            significaban "ha fallado", significaban "todavía no ha llegado".

            Con `createTimeoutMillis` el que se rinde es tarn, que sí cancela la creación, en vez de que se
            rinda el que espera dejando el socket a medias. Y queda margen para que el pool reintente
            dentro del presupuesto de `acquireConnectionTimeout`.
        */
        pool: { ...opts, createTimeoutMillis: 15_000 },
        acquireConnectionTimeout: 30_000,
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
    instrumentPool(k, who, opts.max ?? POOL_DEFAULT.max)
    return k
}

/** Lo mínimo que se le pide al pool de tarn que knex lleva dentro. Tipado a mano: knex no lo expone. */
interface ITarnPool {
    on?: (event: string, listener: (...args: unknown[]) => void) => void
    numUsed?: () => number
    numFree?: () => number
    numPendingAcquires?: () => number
}

/*
    🔴 Que el fallo DIGA cuál de los dos es.

    Knex da el mismo mensaje —"Timeout acquiring a connection. The pool is probably full"— para dos cosas
    que no se arreglan igual: que de verdad no queden huecos (`used` = `max`, hay quien espera) o que no se
    pueda ABRIR una conexión nueva (red, credenciales, el servidor caído). El 2026-10-09 costó media mañana
    distinguirlas a mano, con el servidor en 44 conexiones de 100 — o sea, el mensaje era falso.

    tarn ya emite los dos eventos; solo había que escucharlos y contar lo que se ve desde dentro.
*/
const instrumentPool = (k: Knex, who: string, max: number): void => {
    const p = (k.client as unknown as { pool?: ITarnPool }).pool
    if (!p?.on) return
    const census = (): string => `used=${p.numUsed?.() ?? '?'}/${max} free=${p.numFree?.() ?? '?'} waiting=${p.numPendingAcquires?.() ?? '?'}`
    p.on('createFail', (_eventId: unknown, err: unknown) =>
        log.warning(`${who}: could not OPEN a new connection (${census()}) — ${describeError(err)}`))
    p.on('acquireFail', (_eventId: unknown, err: unknown) =>
        log.warning(`${who}: could not TAKE a connection from the pool (${census()}) — ${describeError(err)}`))
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

/*
    🔴 Toda operación de mantenimiento pasa por aquí, y un fallo de conexión TIRA EL POOL.

    Un pool puede quedarse con conexiones que ya no existen —el otro extremo se fue sin avisar— y, sin algo
    que las descarte, tarn se las sigue entregando a quien pida: cada intento se cuelga sus 5 s y falla.
    Como ese pool es el que usa `ensureDb` para comprobar la base, el consumidor reintenta, vuelve a
    colgarse, y queda un bucle perfecto cada 5 s. Pasó en dev el 2026-10-09 con `iter`:

        10:23:10 maintenance: Acquire connection error → iter: provisioning 'kwirth_iter'
        10:23:15 maintenance: Acquire connection error → iter: provisioning 'kwirth_iter'
        10:23:20 … y así indefinidamente

    El `keepAlive` de `knexForDb` evita llegar hasta aquí en la mayoría de los casos, pero no en todos, y
    un pool de mantenimiento envenenado deja al producto SIN poder aprovisionar nada. Reciclarlo cuesta una
    reconexión y se recupera solo; no hacerlo cuesta el proceso entero hasta que alguien lo reinicia.

    🔴 Solo se recicla ante fallos de CONEXIÓN. Un error de SQL —una clave duplicada, por ejemplo— no tiene
    nada que ver con el pool, y tirarlo por eso sería cambiar un problema por otro peor.
*/
const CONNECTION_FAILURE = /timeout acquiring a connection|operation timed out|econnrefused|econnreset|etimedout|connection terminated|server closed the connection/i

const withAdmin = async <T>(what: string, fn: (k: Knex) => Promise<T>): Promise<T> => {
    try {
        return await fn(admin())
    }
    catch (err) {
        if (CONNECTION_FAILURE.test(describeError(err))) {
            const dead = adminPool
            adminPool = undefined        // el siguiente `admin()` abre uno nuevo, con conexiones nuevas
            log.warning(`maintenance: recycling the pool after a connection failure during ${what} — ${describeError(err)}`)
            if (dead) { try { await dead.destroy() } catch { /* best-effort: ya estaba roto */ } }
        }
        throw err
    }
}

// Budget warning: the SUM of the `max` of every pool (consumers + admin) competes for Postgres's GLOBAL
// max_connections. When Σmax exceeds max_connections − headroom, a warning goes to the console with the
// per-consumer breakdown (so you know who to trim). Best-effort: if max_connections cannot be read, it
// stays quiet.
const warnIfBudgetExceeded = async (): Promise<void> => {
    try {
        if (maxConnections === undefined) {
            const r = await withAdmin('SHOW max_connections', k => k.raw('SHOW max_connections'))
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
        const r = await withAdmin('reapStaleSessions', k => k.raw(
            `select pg_terminate_backend(pid) from pg_stat_activity
             where datname like 'kwirth\\_%' and state = 'idle in transaction'
               and state_change < now() - (? || ' minutes')::interval and pid <> pg_backend_pid()`,
            [STALE_TX_MINUTES]
        ))
        const n = (r.rows as unknown[]).length
        if (n > 0) log?.(`[common-sql] reaped ${n} stale session(s) left 'idle in transaction' by a previous run`)
        return n
    }
    catch (err) {
        log?.(`[common-sql] could not reap stale sessions (ignored): ${err}`)
        return 0
    }
}

/*
    Recoge las conexiones ABANDONADAS de este consumidor: las que dejó una ejecución ANTERIOR del proceso.

    🔴 Esto es lo que distingue una conexión en reposo de una huérfana, que es la pregunta que un
    `idle_session_timeout` a secas no sabe responder: o lo pones corto y matas conexiones vivas que estaban
    esperando trabajo, o lo pones largo y te comes el problema durante horas. La diferencia no está en
    cuánto lleva ociosa, sino en **de quién es**: cada conexión lleva en su `application_name` el id de la
    ejecución que la abrió, así que una con otro id es, por definición, de un proceso que ya no es éste.

    Se hace al ARRANCAR, que es cuando se sabe con certeza que lo anterior ya no existe, y el efecto es
    inmediato: no hay que esperar a que caduque nada.

    Las tres condiciones, y por qué cada una:
      · misma base y mismo consumidor  — no se toca nada que no sea nuestro
      · `application_name` de OTRA ejecución — es la marca de la huérfana
      · estado `idle` y más de `ORPHAN_IDLE_MINUTES` — nunca `active`: eso es trabajo en curso. Y el margen
        cubre el caso de ALTA DISPONIBILIDAD, donde dos instancias comparten `consumerId` y cada una es
        "otra ejecución" para la otra: una instancia con tráfico no tiene conexiones diez minutos sin tocar,
        una huérfana sí, siempre.

    Best-effort: si falla (sin permisos para `pg_terminate_backend`) se avisa y se sigue. No poder limpiar
    no puede impedir arrancar.
*/
export const reapOrphanSessions = async (consumerId: string, log?: (msg: string) => void): Promise<number> => {
    try {
        const name = physicalDbName(consumerId)
        const r = await withAdmin('reapOrphanSessions', k => k.raw(
            `select pg_terminate_backend(pid) from pg_stat_activity
             where datname = ? and application_name like ? and application_name <> ?
               and state = 'idle' and state_change < now() - (? || ' minutes')::interval
               and pid <> pg_backend_pid()`,
            [name, `kwirth:${consumerId}:%`, appName(consumerId), ORPHAN_IDLE_MINUTES]
        ))
        const n = (r.rows as unknown[]).length
        if (n > 0) log?.(`[common-sql] ${consumerId}: reaped ${n} orphan connection(s) left behind by a previous run`)
        return n
    }
    catch (err) {
        log?.(`[common-sql] ${consumerId}: could not reap orphan connections (ignored): ${err}`)
        return 0
    }
}

export const dbExists = async (name: string): Promise<boolean> => {
    const r = await withAdmin('dbExists', k => k.raw('select 1 from pg_database where datname = ?', [name]))
    return r.rows.length > 0
}

export const createDb = async (name: string): Promise<void> => {
    if (await dbExists(name)) return
    await withAdmin('createDb', k => k.raw('create database "' + safeIdent(name) + '"'))
}

export const dropDb = async (name: string): Promise<void> => {
    // close any pool pointing at this physical DB
    for (const [cid, k] of [...pools]) {
        if (physicalDbName(cid) === name) { await k.destroy(); pools.delete(cid); configuredMax.delete(cid) }
    }
    await withAdmin('dropDb', k => k.raw('drop database if exists "' + safeIdent(name) + '"'))
}

export const listDbs = async (): Promise<string[]> => {
    const r = await withAdmin('listDbs', k => k.raw('select datname from pg_database where datistemplate = false order by 1'))
    return r.rows.map((x: { datname: string }) => x.datname)
}

/*
    Aprovisionamientos EN VUELO, para que un consumidor no arranque dos a la vez.

    🔴 `ensureDb` solo registra el pool en `pools` si TODO salió bien, así que un fallo lo deja sin
    registrar y la siguiente llamada vuelve a empezar. Mientras el servidor contesta eso está bien —se
    reintenta—, pero cuando no contesta se convierte en un bucle que se alimenta solo: cada intento espera
    los 5 s del `acquireConnectionTimeout`, falla, y el siguiente que pida la base lo repite. Visto en dev
    el 2026-10-09: `provisioning 'kwirth_excubitor'` una y otra vez, emparejado siempre con un timeout del
    pool de mantenimiento, martilleando justo la conexión que no iba.

    Con esto, N peticiones concurrentes comparten UN intento. No se cachea el fallo: cuando el servidor
    vuelva, el siguiente que pregunte lo consigue.
*/
const provisioning = new Map<string, Promise<Knex>>()

/** PROVISIONING (async, once): ensures the consumer's DB and opens the pool. Returns the ready Knex. */
export const ensureDb = async (consumerId: string, pool?: IPoolOptions): Promise<Knex> => {
    const existing = pools.get(consumerId)
    if (existing) return existing
    const inFlight = provisioning.get(consumerId)
    if (inFlight) return inFlight
    const attempt = provisionNow(consumerId, pool)
    provisioning.set(consumerId, attempt)
    try { return await attempt }
    finally { provisioning.delete(consumerId) }
}

const provisionNow = async (consumerId: string, pool?: IPoolOptions): Promise<Knex> => {
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
    // Lo que dejó la ejecución anterior se recoge AQUÍ, con la base ya accesible y antes de empezar a
    // trabajar: es el único momento en que se sabe a ciencia cierta que aquel proceso ya no existe.
    void reapOrphanSessions(consumerId, m => log.info(m))
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
