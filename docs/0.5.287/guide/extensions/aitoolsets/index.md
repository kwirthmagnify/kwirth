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

They are two different axes on purpose, and confusing them is how dangerous tools get treated as harmless:
reading a Kubernetes **Secret** is a `read` — it changes nothing — and it is still the most sensitive thing a
tool can do in a cluster. One axis says *what it touches*, the other *what it reveals*.

The toolset itself also declares **what it needs from the host** (`requires`): cluster access, metrics, events,
source repositories. kwirth provisions only what is declared, so a toolset that only does arithmetic never
receives a Kubernetes client.

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

The layout is the one every extension family uses — see [Extending kwirth](../../admin/08-extending-kwirth) for
the common flow. Two details are specific to this family:

| Element | What it shows |
|---|---|
| **tools chip** | How many tools the toolset actually **brought into the running core**, not how many its package claims. A toolset whose code failed to load shows **no** chip rather than an inflated number. |
| **No ⚙ settings** | A toolset has nothing to configure at install time. **Which** toolsets a channel may use, and which of their tools are switched off, is decided per channel — not here. |

Installing from a URL or a local file works exactly as in the other families: paste the package URL and click
⬇, or use **Browse…** to upload a `.tgz`.

## Where tools are switched on

Installing a toolset makes it **available**; it does not give it to anybody. Each AI-enabled channel decides
which toolsets it may use and may switch off individual tools inside them:

```
effective tools = (union of the enabled toolsets) − (tools disabled inside them)
```

So the granularity you get is: **pick a toolset, then turn off the tools you don't want**. A channel with no
configuration has **no** tools.

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

## Reference toolset

**Playground** (`@kwirthmagnify/kwirth-aitoolset-playground`) is a deliberately harmless toolset with two toy
tools — `times_two` and `father_of`. It touches nothing, reads nothing and cannot break anything, so it is the
one to install when you want to see how the machinery behaves end to end before writing your own.

---

← Back to [Extension manuals](../index)
