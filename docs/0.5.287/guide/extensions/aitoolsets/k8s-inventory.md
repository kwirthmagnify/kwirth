# K8s Inventory (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `@kwirthmagnify/kwirth-aitoolset-k8s-inventory`<br>
> **Tools:** 7<br>
> **Needs from the host:** cluster access (`K8S`)

## What it does

**What there is.** This is the toolset that lets the model *name things*: which namespaces exist, which
workloads run in them, what services and ingresses expose them, how big the cluster is. Nothing here changes
anything, and nothing here diagnoses anything — it answers *what*, not *why*.

It is the first toolset to grant, and the one whose absence is most obvious: without it an AI channel cannot
so much as tell you how many pods are running, because it has no way to look.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `list_namespaces` | read | public | Lists all namespaces in the cluster with their status and labels. |
| `get_cluster_data` | read | public | Returns general cluster info: name, flavour (AKS/EKS/GKE/k3s/k3d), total vCPUs, total memory, node count and readiness status. |
| `get_node_data` | read | public | Returns configuration info about all Kubernetes nodes (name, IP, max pods). Configuration only — not workload or usage data. |
| `get_workload_data` | read | public | Returns all workloads in the cluster: deployments, statefulsets, daemonsets, pods and services. Optionally filter by namespace. |
| `list_services` | read | public | Lists all Services in the cluster with full details (type, clusterIP, ports, selector). Optionally filter by namespace. |
| `list_ingresses` | read | public | Lists all Ingresses in the cluster (hosts, paths, TLS, backend services). Optionally filter by namespace. |
| `get_workload_config_refs` | read | internal | Given a Deployment, lists the ConfigMaps and Secrets its pods consume (via envFrom, env valueFrom and volumes), each with its lastModified time and resourceVersion. Use it on a crash to find a config source that CHANGED WITHOUT A ROLLOUT: editing a ConfigMap/Secret value keeps the same env spec (no new revision) yet can break the pod — compare each reference lastModified against when the pods started crashing. |

## When to grant it

**Always**, to any AI channel you expect to answer questions about the cluster. It is the floor, not an
option: every other toolset assumes the model can already find the object it is being asked about.

## Notes

- Everything is `read` and, with one exception, `public`.
- **`get_workload_config_refs` is `internal`** even though it returns only *names*. Knowing that a Deployment
  consumes a Secret called `payments-db-credentials` tells you something about the deployment that a list of
  pods does not — the names are the map of where the sensitive material lives.
- This is the **worked example** for writing your own toolset: small package, every tool read-only, and that
  one `internal` among `public`s showing why effect and sensitivity are separate fields.

---

← Back to [AI toolsets](index)
