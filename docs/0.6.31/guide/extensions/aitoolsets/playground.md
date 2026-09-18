# Playground (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `@kwirthmagnify/kwirth-aitoolset-playground`<br>
> **Tools:** 2<br>
> **Needs from the host:** **nothing**

## What it does

**Two harmless toy tools** — multiply a number by two, and name somebody's father. They touch nothing,
need nothing, and mean nothing.

Their purpose is the machinery, not the answers: install, grant, ask the model something that forces a tool
call, and watch the whole path work end to end before you give a channel anything real.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `times_two` | read | public | Multiplies a number by two. |
| `father_of` | read | public | Returns the name of the father of a person. |

## When to grant it

While setting up or debugging an AI channel, and while writing your own toolset. There is no reason to
grant it in a working installation — and no harm if you forget to remove it.

## Notes

- Declares **no capabilities at all**, so its tools receive nothing but `host.trace`. That is the proof
  that provisioning follows what a toolset declares: a package doing arithmetic never sees a Kubernetes client.
- If a tool call works here and fails elsewhere, the problem is not the toolset machinery.

---

← Back to [AI toolsets](index)
