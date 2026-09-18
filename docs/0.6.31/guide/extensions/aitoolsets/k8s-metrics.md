# K8s Metrics (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `@kwirthmagnify/kwirth-aitoolset-k8s-metrics`<br>
> **Tools:** 7<br>
> **Needs from the host:** cluster access (`K8S`) + the metrics buffer (`METRICS`)

## What it does

**How much it consumes — now and over the recent readings.** Usage figures for the cluster as a whole, a
node, a deployment or a namespace, each in a *current* and a *historical* flavour.

This is the toolset that turns "it feels slow" into a number, and a number into a comparison: the historical
tools are what let the model say *three times its usual* instead of *high*.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `get_cluster_usage` | read | public | Returns current overall cluster resource usage: CPU%, memory%, network Mbps, total vCPUs and total memory GB. |
| `get_node_usage` | read | public | Returns current CPU and memory usage for one node or all nodes from the latest metrics reading. |
| `get_deployment_usage` | read | public | Returns current aggregated CPU and memory usage for all pods belonging to a specific deployment. |
| `get_prev_cluster_usage` | read | public | Returns historical overall cluster usage over the last N metrics readings (CPU%, memory%, network Mbps). |
| `get_prev_node_usage` | read | public | Returns historical CPU and memory usage for one or all nodes over the last N metrics readings. |
| `get_prev_deployment_usage` | read | public | Returns historical aggregated CPU and memory usage for a deployment over the last N metrics readings. |
| `get_prev_space_data` | read | public | Returns historical aggregated CPU and memory usage for all pods in a namespace over the last N metrics readings. |

## When to grant it

For channels that reason about capacity, saturation or anomalies. A metric alert investigated without this
toolset is a bot being asked to explain a number it cannot see.

## Notes

- Needs the **metrics provider** to be running and feeding kwirth (capability `METRICS`); the tools read the
  samples kwirth keeps in memory, they do not scrape anything themselves.
- The `get_prev_*` tools take *N readings*, not minutes. How much wall-clock time that covers depends on the
  provider's sampling interval — which is a cluster-wide setting.
- All seven are `read` and `public`: resource usage reveals nothing that the cluster dashboard does not.

---

← Back to [AI toolsets](index)
