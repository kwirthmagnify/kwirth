# Persistence

Most of what kwirth does is **streaming**: data flows from the cluster to your browser and is gone. But not
everything can be forgotten. kwirth has to remember its users, its API keys, its settings and the extensions
you installed; and some extensions have to remember data of their own — a scan history, a set of findings,
a conversation, an audit trail.

Those are two different problems, so kwirth has **two kinds of persistence**, and they have nothing to do
with each other: different content, different mechanism, different place to look when something goes wrong.
The two sections below take one each.

| | [Configuration persistence](persistence?id=configuration-persistence) | [Data persistence](persistence?id=data-persistence) |
|---|---|---|
| **What it holds** | Users, API and access keys, kwirth settings, marketplaces and package registries, the configuration of every extension, and the installed extensions themselves | Whatever an extension accumulates: findings, histories, conversations, audit trails |
| **Shape** | A handful of documents, read often, written rarely, always in full | Rows, many of them, that need queries, indexes and transactions |
| **Mechanism** | The `IConfigMaps` and `ISecrets` interfaces of the core | A relational database (PostgreSQL) served by the core to each extension |
| **Where it lands** | Depends on the deployment mode: Kubernetes objects, or files | A database per extension, on a Postgres server you deploy |
| **Who uses it** | The core, and every extension for its own settings | Only extensions that need to store data |
| **Optional?** | No — kwirth cannot run without somewhere to keep its users | Yes — only needed if you install an extension that uses it |

!> The two are independent. The database is **optional and lazy**: the core does not connect until an
extension actually asks for its store, so kwirth boots and works perfectly with no Postgres anywhere. What
it cannot do without is configuration storage, and that one is always present.

## Configuration persistence

The `IConfigMaps` / `ISecrets` pair is an abstraction with several implementations, and the core picks one
at startup based on how it is running. The code above them never changes; only the backing store does.

| Deployment mode | Configuration goes to | Secrets go to |
|---|---|---|
| **Kubernetes** (default) | Real **ConfigMaps** in kwirth's own namespace | Real **Secrets** in the same namespace |
| **Kubernetes** with `KWIRTH_STORE=<path>` | JSON files under `<path>/configmaps/` | **Encrypted** files under `<path>/secrets/` |
| **Docker** | JSON files under `CONFIGMAPPATH` | Plain JSON files under `SECRETPATH` |
| **Desktop** (Electron / Tauri) | JSON files under `~/.kwirth/configmaps/` | **Encrypted** files under `~/.kwirth/secrets/` |

A few consequences worth knowing:

- **In Kubernetes, kwirth's state is Kubernetes state.** It lives in etcd, it is backed up by whatever backs
  up your cluster, and you can inspect it with `kubectl get configmap -n kwirth`. It also means kwirth needs
  RBAC permission to read and write ConfigMaps and Secrets in its namespace. Where that is not acceptable —
  or where you would rather keep everything in one volume — `KWIRTH_STORE` switches it to the filesystem;
  see [Storage configuration](installation?id=storage-configuration) in the installation page.
- **Encryption at rest depends on the mode, and not every mode has it.** In desktop mode and with
  `KWIRTH_STORE`, secret files are AES-256-GCM with a key derived from `MASTERKEY`; change `MASTERKEY` after
  the first run and the existing secret files become unreadable. Config maps are always plain JSON — they
  are not meant for anything sensitive. In **Docker mode, secrets are written as plain JSON too**, so
  protect that directory: whatever host path you mount for `SECRETPATH` holds passwords and tokens in the
  clear.
- **A filesystem store needs a real volume.** In Docker or in Kubernetes with `KWIRTH_STORE`, if the path
  is not on a mounted volume, everything kwirth remembers dies with the container — including the users.
- **The ~1 MiB ConfigMap cap is real.** It is why extension data does not live here, and it is also why a
  login extension's background image has a size limit: it travels inside a ConfigMap.

## Data persistence

The rest of this page is the other half: the database that extensions use for their own data.

### What the core exposes

The service lives in the package `@kwirthmagnify/kwirth-common-sql`, and the core publishes it as a **back
global** at startup, alongside the rest of the shared packages. That matters for two reasons:

- The extension **does not bundle** the database driver. `knex` and `pg` live once, in the core, no matter how
  many extensions use them.
- The extension **does not know** the server, the host, the user or the password. The core is configured once
  by the admin (see [Configuring kwirth](persistence?id=configuring-kwirth) below) and hands each extension a connection
  that is already open and already pointed at the right place.

The engine is **[knex](https://knexjs.org)** over **PostgreSQL**. Extensions get a plain `Knex` instance, so
everything knex can do — the query builder, raw SQL, transactions, the schema builder, TypeScript generics —
is available, and nothing kwirth-specific gets in the way.

This is the whole API:

| Function | When | What it does |
|---|---|---|
| `configure(server)` | core only, at startup | Fixes the SQL server. An extension never calls this. |
| `ensureDb(consumerId, pool?)` | once, on first use | Creates the extension's database if it is not there, opens its pool and returns the `Knex`. Idempotent. |
| `getDb(consumerId)` | every day | Returns the already-open `Knex`, **synchronously**. Throws if `ensureDb` was never called. |
| `ensureSchemaOnce(db, schemaId, fn)` | once, on first use | Runs your schema creation exactly once per process, memoized. Does not cache a failure, so it retries if the database was down. |
| `closeDb(consumerId?)` | shutdown, tests | Destroys one pool, or all of them. |
| `physicalDbName(consumerId)` | rarely | The physical database name an id maps to. |
| `dbExists` · `createDb` · `dropDb` · `listDbs` | administration | Database-level operations against the maintenance database. |

The package also re-exports `knex` itself and the `Knex` type, so an extension can type its repositories
without adding knex to its own dependencies.

### One database per extension

Extensions are **isolated from each other**: each one gets its own physical database, named
`kwirth_<consumerId>`. The `excubitor` plugin gets `kwirth_excubitor`, a plugin with id `my-plugin` gets
`kwirth_my_plugin` (anything that is not a letter, a digit or an underscore is replaced, and the name is
lowercased).

There is no shared schema, no table prefix convention and no way for one extension to read another's tables
by accident. Uninstalling an extension can drop its database and take nothing else with it.

### Using it from an extension

Two things are needed in the extension: the import must be mapped to the global at build time, and the store
must be provisioned before it is used.

**1. Map the package to the back global in `build.mjs`**, the same way `kwirth-common` and
`kwirth-common-back` are mapped, and list it as external so it is not bundled:

```js
const backGlobals = {
    '@kwirthmagnify/kwirth-common': 'global.__kwirth_back__.kwirthCommon',
    '@kwirthmagnify/kwirth-common-back': 'global.__kwirth_back__.kwirthCommonBack',
    '@kwirthmagnify/kwirth-common-sql/back': 'global.__kwirth_back__.kwirthCommonSql',
}
```

**2. Wrap the connection in one small module**, so the rest of the back does not repeat the consumer id:

```ts
import { ensureDb, getDb as _getDb, closeDb as _closeDb } from '@kwirthmagnify/kwirth-common-sql/back'
import type { Knex } from '@kwirthmagnify/kwirth-common-sql/back'

const CONSUMER = 'my-plugin'

/** Idempotent: ensures the database and opens the pool. Call it before the first query. */
export const provision = (): Promise<Knex> => ensureDb(CONSUMER, { min: 1, max: 5 })

/** The open connection. Synchronous, so repositories can use it inline. */
export const getDb = (): Knex => _getDb(CONSUMER)

export const closeDb = (): Promise<void> => _closeDb(CONSUMER)
```

**3. Create the schema once and query normally:**

```ts
import { ensureSchemaOnce } from '@kwirthmagnify/kwirth-common-sql/back'

const TABLE = 'findings'

export const ready = async (): Promise<void> => {
    const db = await provision()
    await ensureSchemaOnce(db, 'my-plugin-schema', async (db) => {
        if (await db.schema.hasTable(TABLE)) return
        await db.schema.createTable(TABLE, t => {
            t.increments('id').primary()
            t.string('namespace').notNullable()
            t.string('pod').notNullable()
            t.timestamp('seen_at').defaultTo(db.fn.now())
            t.index(['namespace', 'pod'])
        })
    })
}

export const add = (namespace: string, pod: string) =>
    getDb()(TABLE).insert({ namespace, pod })

export const recent = (namespace: string) =>
    getDb()(TABLE).where({ namespace }).orderBy('seen_at', 'desc').limit(50)
```

Call `ready()` at the start of whatever handles the first request; it costs nothing after the first time.

?> Because the schema is created by the extension itself, there are no migration files to ship and no
migration step to run. Make `ensureSchemaOnce` additive — create what is missing — and an upgrade of the
extension brings its schema along with it.

### Connection pools

Each extension asks for its own pool in `ensureDb`, with `min` (connections kept warm) and `max` (its
ceiling). The default is `{ min: 2, max: 10 }`. Keeping `min` above zero avoids paying one to two seconds to
open a connection every time the pool has gone idle, which is what a user notices.

Those pools all compete for the **`max_connections` of the Postgres server**, which is a global limit and is
100 by default. The service adds up the `max` of every pool — extensions plus its own maintenance pool — and
if the total goes over `max_connections` minus a small headroom it **writes a warning to the kwirth log with
the breakdown per extension**, so you can see who to trim. It is a warning, not a limit: the service will not
refuse to open a pool, but if you run out of connections Postgres will start rejecting them.

With a handful of extensions the defaults are fine. With a dozen, either raise `max_connections` on the
server or lower the `max` of the noisy ones.

### Configuring kwirth

The core reads the SQL server from environment variables at startup:

| Variable | Must you set it? | Default | Meaning |
|---|---|---|---|
| `KWIRTH_SQL_HOST` | **Yes**, unless Postgres runs on the same machine | `localhost` | Host of the Postgres server. |
| `KWIRTH_SQL_USER` | **Yes**, in practice | `postgres` | User kwirth connects as. **Needs `CREATEDB`** (see below). |
| `KWIRTH_SQL_PASSWORD` | **Yes**, in practice | *(empty)* | Password. Take it from a Secret, never write it in the Deployment. |
| `KWIRTH_SQL_PORT` | Only if not standard | `5432` | Port. |
| `KWIRTH_SQL_SSL` | Only if the server requires TLS | `false` | `true` to connect over TLS. |
| `KWIRTH_SQL_MAINTDB` | Rarely | `postgres` | Maintenance database, used only to create, drop and list databases. |
| `KWIRTH_SQL_CLIENT` | No | `pg` | Engine. Today only `pg`; the setting is there for future engines. |

!> **Those defaults describe a Postgres running on the same machine as kwirth**, which is the case when you
launch kwirth locally for development, and almost never the case anywhere else. In **Kubernetes**,
`localhost` is the kwirth pod itself, so the host has to be the Service's DNS name —
`kwirth-postgres.<namespace>.svc.cluster.local`, as in the example below. In **Docker**, it has to be a host
the kwirth container can reach: a container name on the same Docker network, or `host.docker.internal`, but
not `localhost`, which is the container.

Two more things are worth stressing:

!> **The user needs permission to create databases.** kwirth provisions one database per extension on demand,
so the user in `KWIRTH_SQL_USER` must be able to `CREATE DATABASE`. A plain owner of a single pre-created
database is not enough. If you cannot grant that, no extension will be able to provision its store.

?> **Nothing connects at startup.** The settings are only recorded. The first connection is opened when an
extension actually asks for its database, so a wrong host or a Postgres that is not up yet does not stop
kwirth from starting — it surfaces as an error in that extension, when it is first used.

### Deploying Postgres with hostPath

Below is a complete, working example: a single Postgres pinned to one node, storing its data in a directory
of that node's filesystem. It is the setup kwirth itself uses for development, and it is a reasonable
starting point for a lab, a demo or a small on-prem install.

!> **hostPath is node-local storage.** The data lives in a directory of *one specific node*, and nothing
replicates or backs it up. This example is for development and small installations. For anything you care
about, use a real `StorageClass` from your cluster's storage provider, or a managed database outside the
cluster — the only thing that changes is the `PersistentVolume`.

**The volume and its claim.** The `hostPath` directory is created on first use, and the volume is retained if
the claim is deleted, so a mistake does not take the data with it:

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: kwirth-postgres-pv
spec:
  capacity:
    storage: 2Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain
  storageClassName: kwirth-postgres
  hostPath:
    path: /var/lib/kwirth-postgres
    type: DirectoryOrCreate
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: kwirth-postgres-pvc
  namespace: kwirth-system
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: kwirth-postgres
  volumeName: kwirth-postgres-pv
  resources:
    requests:
      storage: 2Gi
```

**The credentials**, which the Postgres image reads to create its superuser:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: kwirth-postgres
  namespace: kwirth-system
type: Opaque
stringData:
  POSTGRES_USER: kwirth
  POSTGRES_PASSWORD: change-me
```

**The database itself:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: kwirth-postgres
  namespace: kwirth-system
  labels:
    app: kwirth-postgres
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: kwirth-postgres
  template:
    metadata:
      labels:
        app: kwirth-postgres
    spec:
      nodeSelector:
        kubernetes.io/hostname: my-node-name
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
          env:
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          envFrom:
            - secretRef:
                name: kwirth-postgres
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
          readinessProbe:
            exec:
              command: ['pg_isready', '-U', 'kwirth', '-d', 'postgres']
            initialDelaySeconds: 5
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 6
          livenessProbe:
            exec:
              command: ['pg_isready', '-U', 'kwirth', '-d', 'postgres']
            initialDelaySeconds: 20
            periodSeconds: 20
            timeoutSeconds: 5
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: kwirth-postgres-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: kwirth-postgres
  namespace: kwirth-system
spec:
  selector:
    app: kwirth-postgres
  ports:
    - port: 5432
      targetPort: 5432
```

Five details in those manifests are not decoration, and each one bites if you drop it:

- **`nodeSelector`.** A `hostPath` volume is a directory on *one* node. Without pinning, a rollout can
  schedule the pod on a different node, where that directory is empty — and Postgres will happily start with
  a brand new, empty cluster. It looks exactly like losing all your data, and moving the pod back brings it
  all home again. Pin the pod to the node that holds the directory, and do not restart it lightly.
- **`strategy: Recreate`.** The default rolling update would start a second Postgres against the same data
  directory before stopping the first. Two Postgres on one data directory is data corruption.
- **`PGDATA` pointing at a *subdirectory*** of the mount. Postgres refuses to initialise in a directory that
  is not empty, and a mount point often is not (`lost+found`, ownership leftovers). Giving it `pgdata`
  underneath keeps it happy.
- **Its own `storageClassName`, plus `volumeName` in the claim.** Together they force a *static* binding to
  the volume you wrote. Without them a dynamic provisioner — k3s and k3d ship one, `local-path` — hijacks the
  claim and gives it a different volume, and your `hostPath` is never used.
- **Probe `timeoutSeconds` well above 1.** With the default second, the probes flap whenever the node is
  under load: readiness drops and the Service stops routing, or worse, the liveness probe fails and the
  kubelet kills a perfectly healthy Postgres into `CrashLoopBackOff`.

?> There is deliberately **no `POSTGRES_DB`** in the Secret. The image's `initdb` already creates the
maintenance database `postgres`, which is all kwirth needs to connect; the actual data lives in the
`kwirth_<extension>` databases that the core creates on demand.

**Then point kwirth at it**, in the kwirth Deployment:

```yaml
        env:
          - name: KWIRTH_SQL_HOST
            value: kwirth-postgres.kwirth-system.svc.cluster.local
          - name: KWIRTH_SQL_PORT
            value: '5432'
          - name: KWIRTH_SQL_USER
            valueFrom:
              secretKeyRef:
                name: kwirth-postgres
                key: POSTGRES_USER
          - name: KWIRTH_SQL_PASSWORD
            valueFrom:
              secretKeyRef:
                name: kwirth-postgres
                key: POSTGRES_PASSWORD
```

The `POSTGRES_USER` of the official image is a superuser, so it can create databases and the requirement
above is met. If you prefer a dedicated, non-superuser account, create it and grant it `CREATEDB`:

```sql
create role kwirth with login password 'change-me' createdb;
```

### Checking it works

There is nothing to see until an extension asks for a store, which is the point: an empty server is a healthy
server. Install an extension that persists — Excubitor, for instance — use it once, and its database appears:

```bash
kubectl exec -n kwirth-system deploy/kwirth-postgres -- psql -U kwirth -d postgres -c '\l'
```

You should see a `kwirth_<extension>` database next to the default ones. If it is not there, look at the
kwirth log: a provisioning failure — wrong host, wrong password, or a user without `CREATEDB` — is reported
there, by the extension that tried.
