# K8s Files (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `kwirth-aitoolset-k8s-files`, from a private marketplace<br>
> **Tools:** 2<br>
> **Needs from the host:** cluster access (`K8S`) and 🔴 **running inside containers (`EXEC`)**<br>
> **Settings:** yes — *Protected namespaces*

## What it does

**Reads and writes text files inside the containers of a deployment.** With it, an agent can answer
*"change the index.html of the nginx in demo to 'Hello'"* by reading the file, saying where it lives and
whether the change will last, rehearsing, and writing it in every pod once you confirm.

It is a separate package on purpose. Writing a file inside a container needs the **`EXEC`** capability —
running a command in the container— and with `EXEC` a toolset can run *anything* there. So it is granted
apart, only to whoever must have it, and [K8s Deploy](k8s-deploy) does not need it.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `read_file` | read | **secret** | Reads a text file (up to 1 MB) from a container of a running pod of the deployment, and says where its path falls. Any file can hold credentials, so it is only offered to channels that accept sensitive results. |
| `write_file` | **write** | public | Creates or replaces a text file (up to 1 MB) in the container of **every** running pod of the deployment, creating missing directories. |

## Where a path falls — and whether the change lasts

Before reading or writing, both tools look at the container's mounts and say where the path falls. **It
decides whether a written file survives:**

| The path is on | Kind | A written file |
|---|---|---|
| a **PersistentVolumeClaim** (or a `hostPath`, network storage) | **persistent** | survives the pod being recreated |
| an **emptyDir**, or no mount at all (the container's own layer) | **ephemeral** | is **lost** when the pod is recreated — a new image, a restart, a crash. The answer warns about it |
| a mounted **ConfigMap**, **Secret**, projected or downwardAPI volume, or a mount marked read-only | **read-only** | `write_file` **refuses**: change its source instead (for a ConfigMap, `create_configmap` in [K8s Deploy](k8s-deploy)) |

The mount with the longest path that contains the file decides: a file in `/data/cache` follows the mount at
`/data/cache`, not the one at `/data`.

!> **For a change that must last, a file inside a container is rarely the place.** It does not show in the
deployment, nobody sees it in a `kubectl get`, and on an ephemeral path it disappears without notice. Content
that must stay belongs in a ConfigMap mounted with `mount_configmap` (K8s Deploy), in a persistent volume, or
in the image.

## Every pod, once per shared volume

`write_file` writes in the container of **every running pod** of the deployment, and answers pod by pod:
where it was written and where it failed (and why). There is no automatic way back: if one pod fails, the
others keep the change, and the answer says so.

When the path is on the **same PVC in every pod** (a ReadWriteMany volume they share), it writes **once** —
every pod sees the same file— and says which volume they share.

`write_file` takes a **`dryRun`**: it resolves the pods and the kind of path and returns the **plan**, without
writing anything. Its description asks the model to read the file first, show the plan, and write only after
you confirm.

## Settings: protected namespaces

The same setting as K8s Deploy, in this toolset's **Settings** tab: **Protected namespaces**, a comma-separated
list of exact names (by default `kube-system, kube-public, kube-node-lease, kwirth`; empty means none). Both
tools refuse a namespace in the list before calling anything. It is applied by the toolset, so it is not a
security control: the grant and the RBAC are.

## What it needs

- **In the container:** a shell (`sh`, `cat`, `head`, `mkdir`). An image without one (*distroless*) cannot be
  read or written this way, and the answer says so with the reason.
- **In the cluster**, on kwirth's ServiceAccount: `deployments` `get`, `pods` `list`/`get`, and
  **`pods/exec` `create`**. Without `pods/exec` (a read-only deployment of kwirth) both tools fail saying that
  permission is missing.

## What its answers and traces carry

`write_file` never returns nor traces the content it wrote, only its size. `read_file` returns the content —
that is its job, and why it is `secret`— but never traces it. The path goes to the container as an argument,
never pasted into a command, so a path with quotes or `;` cannot become a command. Every run inside a container
is traced by kwirth with the pod, the command and the channel it ran for.

## When to grant it

Rarely, and on purpose. `read_file` alone, to an agent that diagnoses, already reveals what is in a
container. `write_file` changes running containers outside the deployment cycle. For most *"change this
content"* requests, K8s Deploy's `create_configmap` + `mount_configmap` is the durable answer.

## Not in this version

Deleting files, listing directories, binary files, files over 1 MB, and running free commands: the capability
would allow it, the toolset deliberately does not.

---

← Back to [AI toolsets](index)
