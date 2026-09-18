# K8s Describe (AI toolset)

> **Type:** AI toolset<br>
> **Package:** `@kwirthmagnify/kwirth-aitoolset-k8s-describe`<br>
> **Tools:** 12<br>
> **Needs from the host:** cluster access (`K8S`)

## What it does

**What is wrong with this one.** Where *Inventory* lists, *Describe* goes deep into a single object: the
`kubectl describe` view of a pod, service, ingress, controller or namespace, the full manifests, and the
rollout history of a Deployment.

This is where most root causes are actually found. A pod in CrashLoopBackOff tells you almost nothing from a
list; its describe output names the exit code, the failing probe, the image that cannot be pulled.

## The tools

| Tool | Effect | Sensitivity | What it does |
|---|---|---|---|
| `describe_pod` | read | public | Returns a diagnostic summary of a pod (equivalent to kubectl describe pod): phase, conditions, and per-container status — waiting reason (CrashLoopBackOff/ImagePullBackOff…), last termination reason + exitCode (137=OOMKilled, 1=app error, 143=SIGTERM), restart count, image, resources and probes. Best first step to categorize a pod failure. |
| `describe_service` | read | public | Diagnostic summary of a Service (equivalent to kubectl describe service): type, clusterIP, ports, selector, sessionAffinity, external/loadBalancer, AND its live Endpoints — the pod IPs currently backing it (ready vs not-ready). Best tool to see WHY traffic is not reaching pods (empty/not-ready endpoints = selector mismatch or unready pods). |
| `describe_ingress` | read | public | Diagnostic summary of an Ingress (equivalent to kubectl describe ingress): ingressClass, the routing rules (host → path → backend service:port), the default backend, TLS (hosts + secret), and the load-balancer address assigned by the controller. Use to see how external traffic is routed to services. |
| `describe_controller` | read | public | Diagnostic summary of a workload controller (equivalent to kubectl describe deployment/statefulset/daemonset/replicaset): replica counts (desired/ready/available/updated), rollout strategy, conditions (Available/Progressing + reason — why it is not fully rolled out), selector, and its pod template (image, resources, probes). Parametrised by kind, so one call covers any controller type. |
| `get_space_data` | read | public | Describes a Kubernetes namespace (equivalent to kubectl describe namespace plus a rollup): its status and labels, ResourceQuota usage (used vs hard) and LimitRange defaults, plus the resources in it — pods (with restart count), deployments, services and configmap names. |
| `get_rollout_history` | read | internal | Returns the rollout history (revisions) of a Deployment via its ReplicaSets: per revision the image(s), replicas and pod-template summary (env with inline VALUES and their configMap/secret source, resources, command). Use to see WHAT CHANGED recently — a new image tag, a changed inline env value, a resource/command change — that may have broken the pods. Compare the newest revision against the previous one. NOTE: a change to a ConfigMap/Secret VALUE does NOT create a revision — use get_workload_config_refs for that. |
| `get_pod_yaml` | read | internal | Returns the full Kubernetes Pod manifest (equivalent to kubectl get pod -o yaml): complete spec (env, volumes, resources, probes) and status. Use for deeper misconfiguration analysis after describe_pod. |
| `get_deployment_yaml` | read | internal | Returns the full Kubernetes Deployment manifest (equivalent to kubectl get deployment -o yaml): the pod template (image, env, resources, probes) and strategy. Use to check if a pod problem comes from the owning workload spec. |
| `get_controller_yaml` | read | internal | Returns the full manifest of a workload controller (equivalent to kubectl get <kind> -o yaml), for ANY kind — Deployment, StatefulSet, DaemonSet or ReplicaSet. Complete metadata (uid, labels, annotations), spec (pod template, strategy) and status. Use when you need a specific field the describe summary does not include. |
| `get_service_yaml` | read | public | Returns the full Kubernetes Service manifest (equivalent to kubectl get service -o yaml) for a given namespace and service name. |
| `get_ingress_yaml` | read | public | Returns the full Kubernetes Ingress manifest (equivalent to kubectl get ingress -o yaml) for a given namespace and ingress name. |
| `get_namespace_yaml` | read | public | Returns the full Kubernetes Namespace manifest (equivalent to kubectl get namespace -o yaml): complete metadata (uid, labels, annotations, creationTimestamp), spec (finalizers) and status. Use when you need a specific field the namespace summary does not include (e.g. its uid). |

## When to grant it

Together with **Inventory**, for any channel meant to *diagnose* rather than merely report. A bot that
can list but not describe will keep telling you that something is wrong without ever being able to say why.

## Notes

- The `*_yaml` tools and the rollout history are **`internal`**: a full manifest carries environment
  variables, image references, node selectors and internal hostnames. Nothing secret by definition, but not
  something to hand around either.
- `get_space_data` lived in *Inventory* until it moved here — describing one namespace is "what is wrong with
  this", not "what there is".

---

← Back to [AI toolsets](index)
