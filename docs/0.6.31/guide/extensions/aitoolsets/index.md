# AI toolsets (tools for the LLM)

> **Type:** AI toolset  
> **Managed from:** ☰ → Manage extensions → AI toolsets

## What an AI toolset is

Channels that talk to an LLM — Pinocchio, Censor and any plugin you write — don't just send it text. They also
offer it **tools**: functions the model can decide to call, such as *list the pods of a namespace* or *read the
last lines of a log*. The model chooses **whether** to call one and **with what arguments**; kwirth runs it and
hands back the result.

An **AI toolset** is a packaged, installable group of those tools. It is an extension like any other: it has an
id, a version, a description, and it is installed, listed and removed from its own manager.

Why a group and not individual tools? Because a tool on its own has no useful boundary — *delete a pod* only
makes sense next to *list pods* and *describe pod*. Toolsets are **thematic**: a Kubernetes toolset, a source
repository toolset, a metrics toolset. If you ever need to govern one single tool, package a toolset that
contains exactly that tool: **there is no such thing as a loose tool** in kwirth.

## What a toolset declares

Every tool carries, besides its name and description, two independent pieces of information:

| Field | Values | What it is for |
|---|---|---|
| `effect` | `read` · `write` | Whether the tool only observes, or changes something. |
| `sensitivity` | `public` · `internal` · `secret` | How dangerous the **result** is, regardless of the effect. |

They are two different axes on purpose, and confusing them is how dangerous tools get treated as harmless.
One axis says *what it touches*, the other *what it reveals* — and the real toolsets show how far apart they
can be:

- Every tool in **K8s Ops** is `write` and **`public`**: deleting a pod changes the cluster and its answer
  reveals nothing. All the danger is in the effect.
- **`get_configmap`** is `read` and **`secret`**: it changes nothing and returns the raw values — and a
  ConfigMap is exactly where credentials end up when somebody skips the Secret.
- **`get_secret`**, despite the name, is only `internal`: it returns the **keys** and when they last changed.
  It never returns the values.

The toolset itself also declares **what it needs from the host** (`requires`): cluster access, metrics, events,
source repositories. kwirth provisions only what is declared, so a toolset that only does arithmetic never
receives a Kubernetes client.

## What a tool receives when it runs

Each tool is called with its arguments **and a host object** built from its toolset's `requires`:

```ts
execute: async (args, host) => {
    host.trace('list_namespaces', {})            // always available; it is not a capability
    const cluster = host.k8s                     // only because the toolset declared ECapability.K8S
    return await cluster.coreApi.listNamespace()
}
```

| Declared | The tool receives |
|---|---|
| *(nothing)* | `host.trace` and `host.config` only |
| `configSchema` (not a capability) | `host.config` — the toolset's **settings** as the admin saved them, defaults applied; `{}` when it declares none. See [Settings](#settings-how-the-toolset-behaves-here) |
| `ECapability.K8S` | `host.k8s` — cluster name, flavour, vCPUs, memory, the node map, and the `CoreV1Api`, `AppsV1Api` and `NetworkingV1Api` clients |
| `ECapability.METRICS` | `host.metrics` — the metric samples kwirth keeps in memory |
| `ECapability.EVENTS` | `host.events` — the recent cluster-event buffer |
| `ECapability.REPOS` | `host.repos` — source repository credentials |
| `ECapability.PROVIDERS` | `host.providers.get(id)` — the handle of a provider the toolset **names** in `providers: [...]`: its reads (`getData`) and its operations (`getOperations`, `runOperation`). A provider it does not name is `undefined` |

The Kubernetes clients are **the ones kwirth itself uses** — the same authenticated instances, not new
connections. What a toolset does *not* get is equally deliberate: the other API clients kwirth holds, the
service-account token, senders, webhooks and the Docker client stay out. The set can be widened later, but
it is widened on purpose rather than handed over wholesale.

**Through a provider, not with its credential.** A toolset that reads a cloud declares `ECapability.PROVIDERS` and
the providers it uses (`providers: ['aws']`, for example), and asks them. The credential and
its IAM policy stay in the provider; the toolset holds none. Every operation the provider runs for a tool is
logged by kwirth with the channel the tool ran for.

> **A tool that needs a capability it was not given should say so.** If `host.k8s` is missing, fail with a
> message that names the tool and the reason — an error deep inside a client call tells nobody anything.

## Built-in and installed toolsets

Two kinds of toolset live side by side:

- **Built-in** — shipped inside the kwirth core. They are always available and **cannot be installed or
  uninstalled**, because they are not packages: they come with the image.
- **Installed** — packaged extensions you add yourself, from the catalog, a URL or a file.

A third-party toolset **cannot take the id of a built-in one**. The attempt is rejected at install time, before
anything is written — an entry that could never be registered is worse than a failed install, because the
manager would list something that does not work.

## The AI toolsets manager

Open **☰ → Manage extensions → AI toolsets**.

![AI toolsets manager](../../../_media/guide/manage-aitoolsets.png)
*Each card carries the number of tools it really loaded and how many plugins it has been granted to. A new
installation starts with **No plugin** everywhere: toolsets present, nothing reachable by anybody.*

The layout is the one every extension family uses — see [Extending kwirth](../../admin/08-extending-kwirth) for
the common flow. Three details are specific to this family:

| Element | What it shows |
|---|---|
| **tools chip** | How many tools the toolset actually **brought into the running core**, not how many its package claims. A toolset whose code failed to load shows **no** chip rather than an inflated number. |
| **plugins chip** | How many plugins are granted **at least one** of its tools — `No plugin` when nobody is. A plugin whose grant was emptied does not count. |
| **⚙ settings** | Opens the toolset's dialog, **AI toolset: *name***, with two tabs: **Grants** — which plugins may use it, and which of its tools each one (see [Granting](#granting-installing-is-not-giving)) — and **Settings** — how the toolset behaves in this installation (see [Settings](#settings-how-the-toolset-behaves-here)). *Which* of the granted toolsets a channel actually uses, in what order, and which tools it switches off, is decided per channel. |

Installing from a URL or a local file works exactly as in the other families: paste the package URL and click
⬇, or use **Browse…** to upload a `.tgz`.

## Granting: installing is not giving

Installing a toolset and **granting** it are two different acts, and keeping them apart is the whole point of
the design. Installing puts the tools in the building; granting hands someone the key.

| | Where | Who decides | Answers |
|---|---|---|---|
| **Grant** | this manager, the ⚙ on each card | an **admin** — the only route of this API that demands the `admin` scope | *may this plugin use this toolset, and which of its tools?* |
| **Configuration** | inside each channel | whoever configures that channel | *of what it may use, what does it use, in what order, and with which tools switched off?* |

A plugin needs **both**. The grant is the ceiling and the configuration is what is picked from underneath it:
a channel that asks for a toolset nobody granted it simply does not receive those tools, and the core traces
the fact rather than failing silently.

> **The question this answers.** *"Who can change my cluster through an LLM?"* is a question you must be able
> to answer in seconds, and here you answer it by looking at **who has been granted `k8s-ops`** — one line,
> one dialog. That is why the grants are held per toolset and not scattered across each channel's settings.

### The Grants tab

![AI toolset grant](../../../_media/guide/aitoolset-grant.png)
*The toolset's dialog opens on **Grants**: one row per installed plugin, one column per tool of the toolset,
each with its effect (`read` / `write`).*

For each plugin you choose one of two ways of granting:

| | What the plugin receives | When the toolset is upgraded |
|---|---|---|
| **All** switch on | every tool of the toolset | the tools the new version brings are granted **too** |
| ticked boxes | only the ticked tools | new tools are **not** granted until you tick them |

So `k8s-ops` can be given to a plugin for scaling deployments and **not** for deleting pods — both tools live
in the same toolset, and the grant tells them apart.

- With **All** on, the boxes show ticked and greyed out. The ticks underneath are kept: switching **All** off
  gives you back the selection you had.
- Nothing ticked and **All** off means *not granted*: the plugin gets nothing from this toolset.
- A plugin that has a grant but is not installed here is listed greyed out as *not installed*, so the grant
  can still be taken away.
- If a new version of the toolset drops or renames a tool that was granted, it appears in a column of its own,
  struck through and marked *removed*: it is ignored while it is there, and saving removes it from the grant.
- Nothing is applied until **Save**; **Cancel** leaves the grant as it was. Save and Cancel cover **both**
  tabs: one Save stores what changed in Grants and in Settings, one Cancel discards both.

Three consequences worth knowing before you grant:

- **A freshly installed AI channel has no tools.** It can reason and write prose, but it cannot see your
  cluster until someone grants it a toolset. This is deliberate — capability is given, never assumed — but it
  means granting is part of setting up such a channel, and a plugin that suddenly answers worse after an
  upgrade is usually a plugin whose grants nobody has set.
- **Revoking is immediate and needs no restart.** Take the grant away and the next bot run is offered fewer
  tools. Nothing is cached behind your back.
- **Updating a toolset keeps its grants.** Installing a newer version of a toolset —or rebuilding one you
  are developing— leaves untouched who may use it: the grant belongs to the toolset *id*, not to the version
  you happened to install. Only a plugin granted with **All** picks up the tools the new version adds.
- **Uninstalling keeps them too, unless you ask.** The uninstall confirmation carries the box **Also delete
  its configuration**, unticked. Left unticked, the toolset's grants **and** its settings are kept: while it
  is not installed nobody can use it, and installing it again brings both back exactly as they were. Ticked,
  both are deleted, and a later install starts as a first one — granted to nobody, settings at their
  defaults. Tick it when you are removing a toolset for good, so that installing it again some day does not
  hand its tools back to the plugins that had them.

> ⚠️ **Upgrading from a Kwirth with whole-toolset grants.** Grants used to be *toolset → plugins*, with no
> choice of tools. That format is **not** migrated: after the upgrade every toolset reads **No plugin** and
> AI channels have no tools until you grant them again in this dialog. The core logs a warning for each
> grant it discarded.

## Settings: how the toolset behaves here

Some toolsets need to know something about **this installation** before their tools are useful — which
namespace they may deploy to, whether they only plan or also apply, a token for a service they call. That
is the toolset's **settings**: **one** configuration per installed toolset, global to the whole Kwirth, the
same for every plugin it is granted to.

![AI toolset settings](../../../_media/guide/aitoolset-settings.png)
*The **Settings** tab draws the fields the toolset declares, with their defaults until you save anything.*

- **What you see is what the toolset declares.** The form is built from the toolset's own list of settings,
  with the same kinds of field as every other configuration in Kwirth — text, numbers, switches, lists,
  passwords. A toolset that declares none shows the tab **greyed out**, and hovering it says *"This
  toolset declares no settings"*.
- **Never saved means the defaults.** Until you save, the tools work with the defaults the toolset declares,
  and the form shows them.
- **Passwords and tokens come back as they are**, masked: the eye shows the value already saved, so you
  can check it without typing it again.
- **Required fields.** While one is empty, **Save** stays greyed out and its tooltip names the fields that
  are missing. Anything else the toolset refuses is marked in red on its field, the tab reads
  **Settings (errors)**, and the dialog stays open so you can fix it. Nothing is stored until it fits.
- **It applies at once.** The tools read their settings on **every** call: what you save is in force from
  the next one, without restarting anything.

> ⚠️ **Settings are not a security control.** They tell a well-behaved toolset how to behave, and it is the
> toolset that applies them. What does not depend on how a toolset was written is the **grant**: if a plugin
> must not change your cluster, do not grant it the tools that do — do not rely on a setting saying
> *"plan only"*.

The settings are kept in **one Secret per toolset** (`kwirth-aitoolset-<id>-config`), the way every other
extension keeps its configuration. They travel in **☰ Kwirth export** next to the toolset's grants, with the
passwords emptied unless you include credentials. Uninstalling keeps them unless you tick **Also delete its
configuration** (see [above](#granting-installing-is-not-giving)).

## Where tools are switched on

Installing a toolset makes it **available** and granting it makes it **reachable** by one plugin — all of
it or some of its tools. What the channel then *uses* is the third step: each AI-enabled channel is assigned
an **ordered list** of toolsets — picked from those granted to it — and may switch off individual tools
inside them:

```
effective tools = (the assigned toolsets, in order)
                ∩ (the tools granted to the plugin)      ← decided by the admin
                − (the tools switched off)               ← decided in the channel
                  with the first toolset that provides a name winning it
```

So the granularity you get is: **the admin grants tools, the channel picks the toolsets, orders them and
turns off the ones it doesn't want**. A channel with no configuration has **no** tools.

A tool that was not granted takes no part in the race for a name: if `ts1` has a `get_logs` the plugin was not
granted and `ts2` also has one, the plugin gets the one from `ts2`. The same holds for a tool switched off.

Switching a tool off in the channel and not granting it look the same from the model's side — the tool is not
offered — but they are fixed in different places. The core keeps them apart in its trace (Pinocchio prints the
tools of a granted toolset that were not granted as `TOOLS NOT GRANTED [...]`), so you know whether to go to
the channel's configuration or to this grant.

### When two toolsets bring the same tool name

Nothing is renamed. **The order decides**: the first assigned toolset that provides a name is the one that
serves it, and the other one is *shadowed*.

```
ts1 provides:  ta tb tc td          assigned to the channel:  [ts1, ts2]
ts2 provides:  tf td tg

the channel gets:  ta tb tc  td (from ts1)  tf tg
                             ↑ ts2's td is shadowed
```

**Switching a tool off does not kill the name — it lets the next one surface.** You switch off a specific
tool of a specific toolset, not a name. Switch off `ts1/td` and the channel gets `ts2`'s `td` instead; to
lose `td` altogether, switch it off in both.

> **The order is configuration, not decoration.** Reordering the list changes *which code runs* for a
> shadowed name. Two consequences worth knowing: a tool shown as shadowed is doing nothing, so switching it
> off changes nothing; and if a toolset later publishes a version that adds a name another toolset was
> serving, the shadowing changes **without anyone editing the configuration**. Every invocation is traced
> with the toolset that served it, precisely so this is never a guess.

## Packaging a toolset

A toolset package is a plain `.tgz` with two files:

```
package/
├── package.json      # metadata (extensionType: "aitoolset")
└── back.js           # bundled code that EXPORTS the toolset
```

### `package.json`

```json
{
    "id": "my-toolset",
    "name": "@yourscope/kwirth-aitoolset-my-toolset",
    "displayName": "My Toolset",
    "version": "0.1.0",
    "description": "What these tools are for",
    "extensionType": "aitoolset"
}
```

> **`id` must match** the id of the toolset the module exports. If they differ, kwirth **refuses to register
> either of them**: the index would say one thing and the registry another, and uninstalling would not find it.

### `back.js`

The module **exports** its definition as the default export. It does **not** register itself — the host does
that, which is what keeps a single registry and makes reserved ids enforceable:

```ts
import { IAiToolset, z } from '@kwirthmagnify/kwirth-common-ai/back'
import { EToolEffect, EToolSensitivity } from '@kwirthmagnify/kwirth-common-ai'

const myToolset: IAiToolset = {
    id: 'my-toolset',
    version: '0.1.0',
    displayName: 'My Toolset',
    description: 'What these tools are for',
    requires: [],                       // nothing from the host
    tools: [
        {
            name: 'times_two',
            description: 'Multiplies a number by two.',
            effect: EToolEffect.READ,
            sensitivity: EToolSensitivity.PUBLIC,
            inputSchema: z.object({ data: z.number() }),
            execute: async (args) => (args.data as number) * 2
        }
    ]
}

export default myToolset
```

The `description` of each tool is not decoration: it is what the **model** reads to decide whether to call the
tool, so write it for the model, not for a developer.

### Settings: `configSchema` and `host.config`

A toolset that needs settings declares them in `configSchema`, with the same field definitions
(`IConfigFieldDef`) every Kwirth extension uses, and each tool reads them from `host.config`:

```ts
const myToolset: IAiToolset = {
    id: 'my-deployer',
    // ...
    requires: [ECapability.K8S],
    configSchema: [
        { name: 'namespace', label: 'Target namespace', required: true, default: 'apps' },
        { name: 'mode', label: 'Mode', type: 'select', options: ['plan', 'apply'], default: 'plan' },
        { name: 'registryToken', label: 'Registry token', type: 'password' }
    ],
    tools: [
        defineTool({
            name: 'deploy',
            description: 'Deploys an image to the configured namespace.',
            effect: EToolEffect.WRITE,
            sensitivity: EToolSensitivity.INTERNAL,
            inputSchema: z.object({ image: z.string() }),
            execute: async (args, host) => {
                const namespace = String(host.config.namespace)     // what the admin saved, or the default
                if (host.config.mode !== 'apply') return { plan: `would deploy ${args.image} to ${namespace}` }
                // ... apply it
            }
        })
    ]
}
```

- `host.config` is **always there**: the saved values with the defaults applied, or `{}` when the toolset
  declares no `configSchema`. Like `trace`, it is not a capability and needs no `requires`.
- It is read on **every** call, so the tool must not cache it: what the admin saves applies from the next one.
- Each call gets its **own copy**: a tool that changes it changes nothing for the next one.
- What does not fit the schema is refused when saving, so a tool can rely on required fields being there.
  Still, read them defensively: a newer toolset version may add a field that an older saved configuration
  does not have yet — that is what `default` is for.
- Mark secrets as `type: 'password'` (or `secret: true` on a multi-line field): the dialog masks them and
  ☰ Kwirth export empties them unless credentials are included.

Common packages (`kwirth-common`, `kwirth-common-ai`, `zod`) must **not** be bundled — the core serves them
through its back global, so that the toolset uses exactly the same registry and the same `zod` as kwirth
itself.

### Developing one

Point `kwirth-dev.json` at the build folder, as with any other extension:

```json
{
    "aitoolsets": {
        "my-toolset": "../aitoolsets/my-toolset/dist"
    }
}
```

A toolset loaded this way shows a **`dev`** badge, cannot be uninstalled from the manager (the file governs it,
not the dialog), and disappears when you remove it from `kwirth-dev.json` and restart the core.

Its settings can be given in the same file, with `${VAR}` replaced from the environment. They live in memory
only, **win over** whatever was saved from the dialog, and are never written anywhere:

```json
{
    "aitoolsetConfigs": {
        "my-deployer": { "namespace": "dev-apps", "mode": "apply", "registryToken": "${REGISTRY_TOKEN}" }
    }
}
```

## Available toolsets

Each one has its own page, with the full list of its tools and the effect and sensitivity of every one:

| Toolset | Tools | Needs | What it is for |
|---|---|---|---|
| **[K8s Inventory](k8s-inventory)** (`k8s-inventory`) | 7 | `K8S` | What there is: namespaces, nodes, workloads, services, ingresses, and the ConfigMaps/Secrets a Deployment consumes. |
| **[K8s Describe](k8s-describe)** (`k8s-describe`) | 12 | `K8S` | What is wrong with one object: `describe` and full manifests for pods, controllers, services, ingresses and namespaces, plus the rollout history. |
| **[K8s Observability](k8s-observability)** (`k8s-observability`) | 3 | `K8S` + `EVENTS` | What happened and what the pod said: recent cluster events and container logs. |
| **[K8s Metrics](k8s-metrics)** (`k8s-metrics`) | 7 | `K8S` + `METRICS` | How much it consumes, now and over the recent readings — cluster, node, deployment or namespace. |
| **[K8s Config & Secrets](k8s-secrets)** (`k8s-secrets`) | 3 | `K8S` | The configuration a workload really consumes: ConfigMap data, Secret keys (never values) and TLS certificate details. |
| **[K8s Ops](k8s-ops)** (`k8s-ops`) | 8 | `K8S` | 🔴 **The write operations**: scale, restart, delete a pod, manage nodes. Every tool here changes the cluster. |
| **[K8s Deploy](k8s-deploy)** (`k8s-deploy`) | 9 | `K8S` | 🔴 **Creates, changes and deletes workloads**: deployments, services, configmaps (and mounts them) and namespaces, each with a server-side `dryRun`. Settings: protected namespaces. |
| **[Source Repos](source-repos)** (`source-repos`) | 5 | `REPOS` | Reads a source file from GitHub or GitLab at a given revision, to inspect the code actually running; compares two revisions, to say what went in with a deploy; and finds the code without guessing where it is — repository tree, text search and per-file history. |
| **[Playground](playground)** (`playground`) | 2 | *(nothing)* | Two harmless toy tools (`times_two`, `father_of`). Install it to watch the machinery work end to end before writing your own. |

Together they are the 43 tools kwirth has always had —plus the first one that never lived in the core,
`compare_revisions`, added once the toolsets were packages of their own— now split so they can be granted
separately. Two of them deserve a second look before you hand them out:

- **K8s Ops is exactly the write set.** Denying a channel this toolset denies it *all* writing, in one move,
  without depending on anyone getting a per-tool flag right.
- **Source Repos is the only one that talks outside the cluster** and the only one that needs credentials of
  its own — which is why it declares `REPOS` and nothing else does.

> **Where to start reading.** `k8s-inventory` is the worked example for writing your own: every tool is
> `read`, the package is small, and one of them (`get_workload_config_refs`) is `read` but `internal`,
> which shows why effect and sensitivity are separate fields.

---

← Back to [Extension manuals](../index)
