# IRIA K8s Ops (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `@iriaoperae/kwirth-aitoolset-k8s-ops`<br>
> **Tools:** 8<br>
> **Needs from the host:** cluster access (`K8S`)

## What it does

**The write set.** Scale a deployment up or down, rollout-restart it, delete a pod, and add, remove, stop
or start a cluster node. Every tool here **changes the cluster**.

It exists as a separate package for one reason: so that denying it denies *all* writing in a single move, with
no dependency on anyone getting a per-tool flag right.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `add_replica` | **write** | public | Scales up a deployment by adding one replica. |
| `remove_replica` | **write** | public | Scales down a deployment by removing one replica. Minimum of 1 replica is enforced. |
| `restart_deployment` | **write** | public | Rollout-restarts a deployment (equivalent to `kubectl rollout restart`): recreates its pods gracefully, respecting the rolling-update strategy, by stamping the kubectl.kubernetes.io/restartedAt annotation on the pod template. Restarts a workload WITHOUT changing its spec — recover stuck/crashing pods or pick up a changed ConfigMap/Secret. Preferred over delete_pod for a whole workload. |
| `delete_pod` | **write** | public | Deletes a single pod (equivalent to `kubectl delete pod`). Its controller (Deployment/StatefulSet/DaemonSet) recreates it — a surgical way to restart ONE stuck or misbehaving pod. Does not respect a rolling update; for a whole workload prefer restart_deployment. |
| `add_node` | **write** | public | Adds a new agent node to the cluster. For k3d uses `k3d node create`. Cloud providers not yet implemented. |
| `remove_node` | **write** | public | Removes a node from the cluster (cordon + delete). For k3d uses `k3d node delete`. Cloud providers not yet implemented. |
| `stop_node` | **write** | public | Stops a running cluster node: cordons it then stops the container. For k3d uses `k3d node stop`. |
| `start_node` | **write** | public | Starts a previously stopped cluster node and uncordons it. For k3d uses `k3d node start`. |

## When to grant it

Only when you want the bot to **act**, not just advise — and only after reading how the two locks work. A
granted toolset is not enough by itself: the person asking must also hold the channel's write permission, or
the tool is denied at invocation and the bot reports that it lacks the permission.

Alerts the bot raises **by itself** always run read-only, whatever is granted. Nobody is on the other side to
take responsibility for a change.

## Notes

- Every tool is `write` and **`public`**: deleting a pod changes the cluster and its answer reveals
  nothing. All of the danger is in the effect, none in the result — the textbook case for two axes.
- `remove_replica` enforces a **minimum of one replica**, so the model cannot scale a workload to zero by
  arithmetic.
- The **node** tools are implemented for **k3d** today; cloud providers are not wired yet and say so rather
  than pretending to succeed.

---

← Back to [AI toolsets](index)
