# Kwirth

[Kwirth](https://kwirthmagnify.dev) is a Kubernetes observability platform: logs, metrics, ops and a
marketplace of extensions (plugins, providers, senders, webhooks, IdP connectors...), served from a single
pod inside your cluster. Source and issues: <https://github.com/kwirthmagnify/kwirth>.

## Install

```bash
helm repo add kwirth https://kwirthmagnify.dev/helm-charts
helm repo update
helm install kwirth kwirth/kwirth -n kwirth --create-namespace
```

Then follow the notes Helm prints: without an Ingress, a `port-forward` to the service and
`http://localhost:3883/kwirth`.

**Read the notes before you close the terminal.** The chart generates the admin password on the first
install and prints it there; that is the only place it is shown in the clear. Until somebody logs in you
can still read it out of the `kwirth-users` Secret — the notes print the exact command — and after the
first login the core has replaced it with a bcrypt hash and it cannot be read back at all.

### Two modes

```bash
# everything works, including the actions that change the cluster
helm install kwirth kwirth/kwirth -n kwirth --create-namespace

# read-only: it can see everything and change nothing
helm install kwirth kwirth/kwirth -n kwirth --create-namespace \
  --set kwirth.mode=readonly --set kwirth.persistence.enabled=true
```

In `readonly` the ClusterRole is a single rule — `get`, `list`, `watch` — so the Magnify commands
(restart, scale, cordon, drain, evict, apply, delete) and the `ops` and `fileman` plugins answer 403
with the button still in the UI. Do not install those two there. Logs, metrics, events and the resource
browser work exactly the same.

That mode needs its configuration kept outside the cluster, which is what `persistence` is for; the
chart refuses to render without it rather than hand you an install that looks healthy and loses its
users on the first restart. See `kwirth.mode` under [Configuration](#configuration-config-one-env-var-each).

## Upgrade from chart 0.1.x

`helm upgrade` works as it is, with the same values file: the keys that still mean something are honoured
and the dead channel switches (`channelLog`, `channelOps`, `channelTrivy`, `channelEcho`, `channelFileman`,
`channelAlert`) are ignored, because those capabilities are plugins now. Two things change:

- The image is **pinned** to the chart `appVersion` instead of `latest`. Set `kwirth.image.tag` (or the
  0.1.x string form `kwirth.image: kwirthmagnify/kwirth:x.y.z`) to choose another.
- The `MASTERKEY` moves from the pod spec to a Secret (`<release>-env`).

Users and API keys survive the upgrade: the chart reads the live `kwirth-users` Secret and `kwirth.keys`
ConfigMap back and never overwrites them.

## Values

All under `kwirth:`.

### Image and pod

| key | default | what |
|---|---|---|
| `image.repository` / `image.tag` / `image.pullPolicy` | `kwirthmagnify/kwirth` / `""` (= appVersion) / `IfNotPresent` | The image. A plain string (`image: repo:tag`) is also accepted, and is pulled with `Always`. |
| `imagePullSecrets` | `[]` | For a private registry. |
| `replicas` | `1` | More than one needs sticky sessions at the Ingress (the nginx defaults set them). |
| `resources` | 256Mi..2Gi, up to 1 CPU | Pod resources. |
| `podAnnotations`, `podLabels`, `podSecurityContext`, `securityContext`, `nodeSelector`, `tolerations`, `affinity`, `priorityClassName` | empty | Passed through as they are. |
| `terminationGracePeriodSeconds` | `5` | |
| `probes.startup` / `probes.readiness` / `probes.liveness` | see values.yaml | Timings; all three hit `GET /healthz`. |
| `extraEnv`, `extraEnvFrom`, `extraVolumes`, `extraVolumeMounts` | `[]` | Anything else the container needs. IdP connectors resolve `${VAR}` placeholders against the environment, so this is where their client secrets go. |

### Configuration (`config.*`, one env var each)

`kwirth.mode` sits above this table rather than in it: it is `normal` or `readonly`, and it is the one
value that decides several others. See [Two modes](#two-modes).

| key | env var | default | what |
|---|---|---|---|
| `rootpath` | `ROOTPATH` | `/kwirth` | URL path Kwirth is served under. Empty = the root. |
| `port` | `PORT` | `3883` | Listening (and container) port. |
| `masterkey` | `MASTERKEY` | generated | Signs access keys and, with a filesystem store, encrypts secrets at rest. **Empty generates a random one on the first install** and keeps it in `<release>-kwirth-masterkey`, which is looked up on every upgrade and kept on uninstall. Changing it later is data loss: every access key stops validating and a filesystem store stops decrypting. Set your own if you deploy from rendered output (Argo CD and friends) — `helm template` has no cluster to look the live one up in, so it would mint a new key on every sync. |
| `auth` | `AUTH` | `kwirth` | `kwirth` (built-in users) or the id of an installed IdP connector. |
| `channelMetrics`, `channelMagnify` | `CHANNEL_METRICS`, `CHANNEL_MAGNIFY` | `true` | The two channels built into the core. |
| `metricsInterval` | `METRICSINTERVAL` | `15` | Seconds between metrics samples. |
| `previousLogLines` | `PREVIOUSLOGLINES` | unset | Lines of the previous container log shown after a restart. |
| `bodyLimit` | `BODYLIMIT` | `8mb` | Request body ceiling (log ingestion). |
| `keepAlive` | `KEEPALIVE` | `65000` | Idle connection keep-alive, ms. |
| `front` | `FRONT` | `true` | Serve the web front end. |
| `ansiLog` | `ANSILOG` | `true` | Colour in the log. |
| `exitLog` | `EXITLOG` | unset | Log the reason on exit. It also writes the post-mortem to a `kwirth-secure-log` ConfigMap, which mode `readonly` cannot. Unset means `true` in `normal` and `false` in `readonly`. |
| `clusterName` | `KWIRTH_CLUSTER_NAME` | unset | The name Kwirth gives its cluster. |
| `store` | `KWIRTH_STORE` | unset | Empty/`etcd` = Secrets and ConfigMaps in the namespace. A path = encrypted files there (see persistence). |
| `license` | `KWIRTH_LICENSE` | unset | The license blob for paid extensions. Delivered through a Secret. |

`existingSecret`: the name of a Secret of yours with `MASTERKEY` and, if needed, `KWIRTH_LICENSE` and
`KWIRTH_SQL_PASSWORD`. When set, the chart renders no Secret and ignores `masterkey`, `license` and
`sql.password`.

### Configuration persistence (`persistence.*`)

By default Kwirth keeps its configuration in Secrets and ConfigMaps of its own namespace. Where that is not
wanted, a volume:

| key | default | what |
|---|---|---|
| `persistence.enabled` | `false` | Mount a claim and set `KWIRTH_STORE` to `mountPath`. Switches the Deployment to `Recreate`. |
| `persistence.existingClaim` | `""` | Use this claim instead of creating one. |
| `persistence.storageClass`, `accessModes`, `size` | `""`, `[ReadWriteOnce]`, `1Gi` | The created claim. It is kept on uninstall. |
| `persistence.mountPath` | `/mnt/kwirth-data` | |

### Data persistence (`sql.*`)

Extensions with data of their own (findings, histories, conversations) use a PostgreSQL server that the
chart does **not** deploy. The core connects lazily, only when an extension asks.

| key | env var | default |
|---|---|---|
| `sql.enabled` | | `false` |
| `sql.client` | `KWIRTH_SQL_CLIENT` | `pg` |
| `sql.host`, `sql.port` | `KWIRTH_SQL_HOST`, `KWIRTH_SQL_PORT` | `""`, `5432` |
| `sql.user`, `sql.password` | `KWIRTH_SQL_USER`, `KWIRTH_SQL_PASSWORD` (Secret) | `postgres`, `""` |
| `sql.ssl` | `KWIRTH_SQL_SSL` | `false` |
| `sql.maintenanceDb` | `KWIRTH_SQL_MAINTDB` | `postgres` |

### Users

| key | default | what |
|---|---|---|
| `users.bootstrap` | unset | Create the `kwirth-users` Secret on the first install. Never overwritten afterwards; kept on uninstall (delete it by hand for a clean wipe). Unset means `true` in mode `normal` and `false` in `readonly`, where the core keeps its users on the volume and seeds the admin itself. |
| `users.adminId` / `users.adminName` | `admin` / `Nicklaus Wirth` | Who the bootstrap admin is. |
| `users.adminPassword` | `""` | **Empty generates one and prints it in the install notes.** Set your own to skip that; either way it is stored as a bcrypt hash, never in the clear. |
| `users.admin` | `""` | The whole user as base64 JSON, for full control. Wins over the three above, and then nothing is generated or printed. |

The password is stored as `bcrypt(sha256(password))`, which is how the core compares it — the browser
sends the SHA-256, never the clear text. **A password stored in the clear is refused at login**, so do
not hand-craft a `users.admin` blob with one inside.

### RBAC and service account

The ClusterRole follows `kwirth.mode`. In `readonly` it is one rule, `get`/`list`/`watch` on everything,
and the keys below that shape the permissive role are **ignored** — the wildcard already covers them,
CustomResourceDefinitions included, which is why it is a wildcard. The chart refuses to render
`readonly` together with `rbac.clusterAdmin`, or with an `rbac.extraRules` that grants a write verb,
rather than letting either quietly undo the mode.

| key | default | what |
|---|---|---|
| `serviceAccount.create` / `name` / `annotations` | `true` / `<release>-sa` / `{}` | Annotations are where IRSA / Workload Identity go. The 0.1.x `sa.serviceAccount.annotations` still works. |
| `rbac.create` | `true` | ClusterRole + ClusterRoleBinding. |
| `rbac.clusterAdmin` | `false` | `*` on `*` (the 0.1.x behaviour). Refused in mode `readonly`. |
| `rbac.apiGroups` | core, apps, batch, autoscaling, policy, coordination, metrics, rbac, networking, storage, apiextensions, admissionregistration, node, scheduling, events, discovery, aquasecurity.github.io | Every verb on every resource of these groups. Ignored in mode `readonly`. |
| `rbac.extraApiGroups` | `[]` | For providers that watch CRDs (`fleet.cattle.io`, `longhorn.io`, `openreports.io`...). Ignored in mode `readonly`. |
| `rbac.extraRules` | `[]` | Whole PolicyRule objects. In mode `readonly` only `get`, `list` and `watch` are accepted. |

### Service and Ingress

| key | default | what |
|---|---|---|
| `service.type` / `service.port` / `service.annotations` | `ClusterIP` / `3883` / `{}` | |
| `ingress.enabled` | `false` | |
| `ingress.controller` | `nginx` | `nginx`, `agic` or `generic`. nginx gets sticky sessions and one-hour proxy timeouts (websockets); agic gets its health probe settings. |
| `ingress.className` | controller default | `nginx` / `azure-application-gateway`; required for `generic`. |
| `ingress.annotations` | `{}` | Merged over the controller defaults; yours win. |
| `ingress.hostname` | `www.myhost.com` | |
| `ingress.tls` | `[]` | Generic TLS: `[{ secretName, hosts }]`. |
| `ingress.nginx.tls` / `ingress.nginx.secret` | `false` / — | TLS the 0.1.x way. |
| `ingress.agic.privateip` / `ingress.agic.timeout` | `false` / `"300"` | |

The Ingress path is `rootpath` (or `/`), `Prefix`.

## Examples

Pinned image, nginx with TLS, a PostgreSQL for the extensions:

```yaml
kwirth:
  image:
    tag: 0.6.38
  config:
    rootpath: /kwirth
    masterkey: change-me
  ingress:
    enabled: true
    controller: nginx
    hostname: kwirth.example.com
    nginx:
      tls: true
      secret: kwirth-example-com-tls
  sql:
    enabled: true
    host: postgres.data.svc
    user: kwirth
    password: change-me-too
```

Configuration on a volume, no writes to Secrets/ConfigMaps, license for the paid extensions:

```yaml
kwirth:
  persistence:
    enabled: true
    size: 2Gi
  config:
    license: <the license blob>
  rbac:
    extraApiGroups:
      - fleet.cattle.io
```
