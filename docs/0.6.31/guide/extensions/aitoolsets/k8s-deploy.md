# K8s Deploy (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `kwirth-aitoolset-k8s-deploy`, from a private marketplace<br>
> **Tools:** 7<br>
> **Needs from the host:** cluster access (`K8S`)<br>
> **Settings:** yes — *Protected namespaces*

## What it does

**Creates, changes and deletes workloads**: Deployments, the Services in front of them, ConfigMaps and
Namespaces. With it, an agent can answer *"deploy me an nginx in namespace demo with two replicas and expose
it by NodePort"* or *"change the image to 1.27"* without the user copying a `kubectl` command by hand.

It is a separate package from [K8s Ops](k8s-ops) on purpose. K8s Ops acts on what already exists (scale,
restart, delete a pod); creating and deleting is another level of risk, so it is granted apart: denying a
plugin **K8s Deploy** denies it creating and deleting, whatever it may do with K8s Ops.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `create_namespace` | **write** | public | Creates a namespace if it does not exist. An existing one is reported as such, not as an error. |
| `create_deployment` | **write** | public | Creates a Deployment with **one** container: image, replicas (1 by default), ports, plain environment variables, requests and limits. It does not create the namespace, and does not replace an existing deployment. |
| `expose_deployment` | **write** | public | Creates a Service (ClusterIP or NodePort) in front of an existing Deployment, copying the deployment's own selector — so it works with deployments this toolset did not create. With NodePort it returns the node port Kubernetes assigned. |
| `set_image` | **write** | public | Changes the image of one container (like `kubectl set image`), keeping the rest of the spec. Returns the **previous** image, so it can be undone with another `set_image`. |
| `set_env` | **write** | public | Adds or changes environment variables of one container, leaving every other variable and container as they are. Plain values only. |
| `create_configmap` | **write** | public | Creates a ConfigMap, or **replaces it whole** if it exists. |
| `delete_deployment` | **write** | public | Deletes a deployment and its pods. With `alsoService`, also the Services in front of it that **this toolset** created. |

## Rehearse first: `dryRun`

Every tool takes **`dryRun`**. With it, the **API server itself** runs the operation — admission, validation,
defaults, quotas, admission webhooks such as Kubewarden or Kyverno — and persists **nothing**. The answer
starts with `[DRY RUN]` and says what would be created or changed. The tool descriptions ask the model to
call with `dryRun: true` first, show the user what would happen, and apply only after the user confirms.

!> **The "are you sure?" depends on the model.** Asking for a dry run first is an instruction to the model,
not a control: nothing stops a model from calling with `dryRun: false` straight away. The real control is the
**grant**. If an agent must not create without supervision, do not grant it this toolset.

Two limits of a dry run worth knowing:

- **A new namespace.** While a namespace does not exist yet, the API server cannot validate anything inside
  it: the dry run of a deployment or a service there fails with *not found*. With a new namespace, the full
  rehearsal is only possible after creating it — a good agent says so and asks before applying.
- **It is not a guarantee.** Between the rehearsal and the real operation the cluster can change: somebody
  takes the same name, a quota fills up.

## Settings: protected namespaces

In the toolset's **Settings** tab (☰ → Manage extensions → AI toolsets → ⚙ on its card), **Protected
namespaces** is a comma-separated list of namespace names. Every tool **refuses** to touch a namespace in the
list — dry runs included — before calling the API server, with *"Namespace 'kube-system' is protected by this
toolset's settings (Protected namespaces)"*. `create_namespace` also refuses to create one with such a name.

- **By default:** `kube-system, kube-public, kube-node-lease, kwirth`.
- **Empty means nothing is protected.** It is a valid value, and your decision.
- Names are **exact**: `prod` does not protect `prod-2`.
- It is read on **every** call: a change applies from the next one, without restarting anything.
- It is **one list for the whole installation**, the same for every plugin the toolset is granted to.

⚠️ **`kwirth` is an assumption.** The toolset does not know in which namespace kwirth runs. If yours runs in
another one, add it to the list.

⚠️ **It is not a security control.** The toolset applies the list itself. What does not depend on the toolset
is the **grant** and, for a hard limit, the **RBAC** of kwirth's ServiceAccount (see below).

## What it creates is labelled

Everything this toolset **creates** carries `app.kubernetes.io/managed-by: kwirth-k8s-deploy`, and a
deployment and its service share `app.kubernetes.io/name: <deployment>`. So you can always tell what the AI
created:

```bash
kubectl get deploy,svc,cm,ns -A -l app.kubernetes.io/managed-by=kwirth-k8s-deploy
```

That label is also what makes `delete_deployment` safe with `alsoService`: it deletes **only** the Services
that select the deployment's pods **and** carry the label. A Service created in any other way is never
deleted as a side effect, even if it selects the same pods; the answer reports it as kept.

## What its answers reveal

All seven are **`public`**: none returns the object the API server answers, because an existing deployment
may carry credentials in clear in its environment. They return a **summary** of what they touched — names,
image, replicas, ports, and the **keys** of environment variables and ConfigMap data, never their values. The
invocation trace does not carry those values either.

## Permissions it needs in the cluster

Granting the toolset does **not** give anybody permissions in the cluster: it lets the agent **try**. Who
writes is **kwirth's ServiceAccount**, and the default deployment gives it what it needs. With a read-only
deployment (`kwirth-full-ro`, `kwirth-zero`, or the Helm chart's `readOnly`) **every tool fails**, and says
which permission is missing — for example *"Kwirth's ServiceAccount is not allowed to create deployments in
namespace 'demo'. Kwirth may be deployed read-only (kwirth-full-ro)"*.

The minimum, if you write your own role:

| Resource | Verbs |
|---|---|
| `deployments` (apps) | `get`, `create`, `patch`, `delete` |
| `services` | `get`, `list`, `create`, `delete` |
| `configmaps` | `get`, `create`, `update` |
| `namespaces` | `get`, `create` |

## When to grant it

Only to an agent that has to **deploy**, and with the tools it needs. A typical split: everything but
`delete_deployment` for an agent that deploys and fixes but does not remove (*"deploys but does not delete"*).
As with K8s Ops, the person asking must also hold the channel's write permission, or the tool is denied at
invocation.

## Not in this version

- A generic *apply this YAML* (`apply_manifest`): it cannot be bounded — granting "create deployments" would
  be granting "create anything".
- Deleting namespaces, StatefulSets / DaemonSets / Jobs / Ingresses / Secrets / volumes, environment variables
  from Secrets, rollback, and waiting for a rollout to finish (ask the read toolsets for its state).
- Mounting a ConfigMap as a volume: `create_configmap` creates it, but no tool mounts it into a deployment
  yet.

---

← Back to [AI toolsets](index)
