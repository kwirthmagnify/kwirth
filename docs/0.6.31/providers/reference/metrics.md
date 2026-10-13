# Metrics

The Metrics provider reads every node's kubelet (cAdvisor's `/metrics/cadvisor` and `/stats/summary`) at a configurable interval and distributes cluster-wide resource data to all subscribing channels. It is an **installable extension** (`@kwirthmagnify/kwirth-provider-metrics`, source in `providers/metrics`); it used to be compiled into the core. Its user-facing page is [Metrics (provider)](/0.6.31/guide/extensions/providers/metrics).

## What for

  - Feed real-time CPU, memory, network and disk metrics to channels (Metrics, Magnify, Alert, Pinocchio, Spectrum, Agora…).
  - Provide cluster-level resource usage to the kwirth home page and Magnify's overview.
  - Let channels define thresholds evaluated on each reading without polling Kubernetes themselves.

## Features

  - **Periodic reading** — reads every node every `metricsInterval` seconds (default `15`). The interval belongs to Kwirth's settings (**☰ → Kwirth settings**): the core writes it into `kwirthData.metricsInterval`, the same object the provider receives, and the provider reschedules itself on its next tick when it changes.
  - **Push distribution** — on each tick, every subscriber receives the full `IMetricsCluster` reading via `processProviderEvent`. A subscriber that throws does not stop the others.
  - **HTTP endpoints** — in its `configRouter`, which the core mounts **behind the caller's access key** at `/core/providerconfig/metrics`.
  - **No Kubernetes, no clock** — without a Kubernetes cluster behind Kwirth (`clusterType` other than `kubernetes`), or inside a cluster without a ServiceAccount token, it warns once and does not start reading.
  - **Custom kwirth metrics** — computed on top of the raw cAdvisor data:

| Metric | Description |
|---|---|
| `kwirth_container_cpu_percentage` | CPU used by the container relative to the whole cluster |
| `kwirth_container_memory_percentage` | Memory used by the container relative to the whole cluster |
| `kwirth_container_transmit_percentage` | Network bytes sent relative to the whole cluster |
| `kwirth_container_receive_percentage` | Network bytes received relative to the whole cluster |
| `kwirth_container_transmit_mbps` | Mbps sent during the last interval |
| `kwirth_container_receive_mbps` | Mbps received during the last interval |
| `kwirth_container_write_mbps` | Mbps written to disk during the last interval |
| `kwirth_container_read_mbps` | Mbps read from disk during the last interval |
| `kwirth_container_random_counter` | Accumulated container random counter |
| `kwirth_container_random_gauge` | Instant container random gauge |
| `kwirth_cluster_total_pods` | Total number of running pods in the cluster |
| `kwirth_cluster_pods_percentage` | Percentage of cluster pod capacity in use |
| `kwirth_cluster_memory_percentage` | Percentage of total cluster memory in use |
| `kwirth_cluster_cpu_percentage` | Percentage of total cluster CPU in use |

## HTTP endpoints

All of them require a valid access key (the core checks it before the provider sees the request).

| Method | Path | Description |
|---|---|---|
| `GET` | `/core/providerconfig/metrics` | The metrics catalogue (`metric`, `type`, `help`, `eval`) |
| `GET` | `/core/providerconfig/metrics/usage/cluster` | Aggregated cluster usage: `vcpus`, `memory`, `cpuUsage`, `memoryUsage`, `txmbps`, `rxmbps`, `pods`, `maxPods` |

> Up to the core version where the provider became an extension, these lived at `/provider/metrics` and `/provider/metrics/usage/cluster`, with a `GET|POST /provider/metrics/config` for the interval that nobody used and was not carried over. The front end asks the new path first and falls back to the old one on a 404, so a cluster list that mixes versions keeps working.

## Subscribing from a channel

```typescript
this.clusterInfo.addSubscriber('metrics', this, {})
```

Each call to `processProviderEvent` receives an `IMetricsCluster`: `{ metricsInterval, cluster, nodes, clusterMetricValues }`, with per-node (`IMetricsNode`) container, pod and machine values. The model lives in `providers/metrics/src/common/MetricsTypes.ts`; consumers keep a copy of the part they read. A plugin that depends on it declares `{ "extensionType": "provider", "id": "metrics", "minVersion": "0.1.0" }` in `requiresExtension`.
