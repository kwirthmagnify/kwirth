# @kwirthmagnify/kwirth-common-sql

Shared relational storage service for **[Kwirth](https://kwirthmagnify.dev)** extensions — PostgreSQL via
[knex](https://knexjs.org/).

The core calls `configure(server)` at startup (from `KWIRTH_SQL_*` env vars). Each extension asks for its own
store: `ensureDb(consumerId)` (async, provisioning, once) and then `getDb(consumerId)` (synchronous, returns
the ready Knex instance). One database per consumer (`kwirth_<consumerId>`), so extensions never share a
schema.

## What it provides

- `configure(server)` — pin the SQL server connection (called by the core at startup).
- `ensureDb(consumerId, pool?)` — provision the consumer's database and open its pool.
- `getDb(consumerId)` — get the already-provisioned Knex instance (throws if `ensureDb` was not called).
- `listDbs()` / `dbExists(name)` / `createDb(name)` / `dropDb(name)` — database management.
- `listPools()` — runtime stats of every open connection pool (used by the Status plugin).
- `ensureSchemaOnce(db, schemaId, fn)` — idempotent schema creation, memoised by `schemaId`.
- `closeDb(consumerId?)` — destroy pools.
- `describeError(err)` — one-line description of a database error (unwraps `AggregateError`).

## Install

This is a shared library used by the Kwirth core and its extensions; you do not install it directly. See
**[Kwirth](https://kwirthmagnify.dev)** and the [source repo](https://github.com/kwirthmagnify/kwirth).
