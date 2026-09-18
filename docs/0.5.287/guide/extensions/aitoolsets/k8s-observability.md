# K8s Observability (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `@kwirthmagnify/kwirth-aitoolset-k8s-observability`<br>
> **Tools:** 3<br>
> **Needs from the host:** cluster access (`K8S`) + the cluster-event buffer (`EVENTS`)

## What it does

**What happened, and what the pod said.** Two sources the model needs to reconstruct an incident: the
recent Kubernetes events buffered for the cluster (warnings such as CrashLoopBackOff, OOMKilled, FailedMount,
failed scheduling) and the container logs of a pod.

Between them they cover the two halves of a failure: the platform's account of it, and the application's.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `get_cluster_events` | read | public | Returns recent Kubernetes events buffered for this cluster: kube Events (warnings like crashloops/OOM/failed scheduling) and object lifecycle changes. Optionally filter to warnings only or by namespace. |
| `get_object_events` | read | public | Returns recent events for a specific Kubernetes object (by namespace and name): its lifecycle changes and related kube Events (via involvedObject). |
| `get_pod_logs` | read | internal | Returns recent container logs for a pod (equivalent to kubectl logs). For a crashing pod (CrashLoopBackOff) pass previous:true to read the CRASHED container instance logs — that is where the root cause usually is: the events only say it is restarting, not why. |

## When to grant it

For any channel that reacts to incidents — proactive alerting, on-call assistance, post-mortems. An alert
without this toolset can say *that* a pod crashed but never quote the line where it did.

## Notes

- **`get_pod_logs` is `internal` on purpose.** A log line can contain literally anything the application
  chose to print, including a token somebody logged by mistake. The effect is harmless; the content may not be.
- For a crashing pod it can read the **previous** container's logs — the ones that explain the crash, which the
  current container no longer has.
- The events come from kwirth's own buffer (capability `EVENTS`), not from a fresh API call, so the model sees
  the same history the rest of kwirth sees.

---

← Back to [AI toolsets](index)
