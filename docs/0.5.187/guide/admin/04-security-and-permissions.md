# 4. Security & permissions

Kwirth has three security layers:

1. **Administrator security** — the `admin` account and the `admin` scope (manage users, keys, IdPs).
2. **User security** — what each user may see and do, expressed as **scopes** on **resources**.
3. **API security** — keys for external tools and cross-cluster access (see [API management](05-api-management)).

This chapter explains the **permission model** you use when creating users.

## The model: resources = scopes + object filters

Every user carries a **list of resources**. Each **resource** is one permission entry made of two parts:

- **Scopes** — *what actions* are allowed (view, stream, operate, administer…).
- **Object filters** — *on which Kubernetes objects*: Namespaces, Deployments, ReplicaSets, ReplicationControllers, DaemonSets, StatefulSets, Pods and Containers.

A user is allowed to do something if **any** of their resources grants it. Within a resource, the scopes apply **only** to the objects that match the filters.

### Object filters

Each filter field takes a **comma-separated** list of names — **regular expressions are allowed** — and a **blank field means "all"**:

| Field value | Meaning |
|---|---|
| *(blank)* | all objects of that kind |
| `production` | exactly that namespace |
| `production,staging` | either namespace |
| `web-.*` | every object whose name matches the regex |

So a resource with **Namespaces = `production`** and everything else blank means *"these scopes, on all objects inside `production`"*.

## The scopes

When you edit a resource, **Scopes** is a **searchable selector** (filter box + checkbox per scope, with a tooltip describing each):

![Scopes selector](../../_media/guide/admin-scopes.png)

| Scope | Grants |
|---|---|
| `admin` | **Administrative access** — manage users, API keys and identity providers (unlocks the security menus). |
| `cluster` | **Full access** — effectively admin-level; can do everything. Some channels also require it to operate at the cluster level (e.g. mutating actions in Topology/Magnify). |
| `api` | Create **API keys** (the API Security features). |
| `view` | **View** data from a channel (logs). |
| `filter` | View data with **filtering** applied. |
| `stream` | Receive a **live stream** of data from instances. |
| `snapshot` | Read a **point-in-time snapshot** (no continuous streaming). |
| `create` | **Create** instances a channel supports (e.g. alerts). |
| `subscribe` | **Subscribe** to a channel's output (e.g. alerts). |
| `ops$get` | Ops: **read/inspect** resources. |
| `ops$restart` | Ops: **restart / delete** workloads. |
| `trivy$workload` | Trivy: access **workload-scoped** reports (vulnerabilities, config audit, secrets). |
| `trivy$kubernetes` | Trivy: access **cluster-scoped** reports (RBAC, infra assessment). |
| `fileman$read` | Fileman: **browse / view / download** files. |
| `fileman$write` | Fileman: everything read can do **plus** edit, upload, create, rename, move/copy, delete. |
| `none` | Placeholder — no capability. |

> **Plugins can add their own scopes.** The list above is the **core** catalog plus the Ops/Trivy channel scopes, but the Scopes selector is **populated at runtime** from every installed channel/plugin (`ops$…`, `trivy$…`, and any a plugin declares). So after installing a new channel you may see **extra scopes** appear here automatically. There is **no** `ops$xterm` / `ops$execute` scope — opening a shell or running a command in [Ops](../extensions/plugins/ops) is not behind its own scope in the current version.

> **The `admin` scope is powerful.** It grants the whole security surface (users, keys, IdPs). Give it only to real administrators. The built-in `admin` account already carries it (plus `cluster`).

## How to think about it (grant least privilege)

Start from *what the person needs to do*, pick the **matching scopes**, then **narrow the objects** with filters. Leaving filters blank grants the scopes cluster-wide — deliberate for admins, usually too broad for everyone else.

## Worked examples

**A) A full administrator**

- One resource: **Scopes** `admin`, `cluster` · all filters blank.

**B) A production log/metrics viewer**

- **Scopes** `view`, `stream` · **Namespaces** `production` · rest blank.
- Can watch logs and metrics in `production`; cannot operate anything or see other namespaces.

**C) An operator for one app**

- **Scopes** `ops$get`, `ops$restart` · **Namespaces** `payments` · **Deployments** `checkout` · rest blank.
- Can inspect and restart the `checkout` Deployment in `payments` — and nothing else. *(Opening a shell isn't a separate scope; anyone who can reach the Ops channel on these objects can use the terminal.)*

**D) A security auditor**

- **Scopes** `trivy$workload`, `trivy$kubernetes` · filters blank.
- Can run vulnerability scans across the cluster, but has no log/ops access.

**E) An external integration (API)**

- **Scopes** `api` (plus the streaming scopes the integration needs, e.g. `view`, `stream`) · filters narrowed to what it should reach.
- Pair this with an **API key** — see [API management](05-api-management).

## A note on IdP users

Scopes and resources define **authorization** — *what a user can do*. For **authentication** — *proving who they are* — a user can use a Kwirth password or an external Identity Provider. The permission model above is identical either way; IdP only changes how they log in. See [IdP integration](07-idp-integration).

Next: [API management →](05-api-management)
