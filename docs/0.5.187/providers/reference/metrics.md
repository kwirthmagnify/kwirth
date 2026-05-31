# Metrics

The Metrics provider polls the Kubernetes cAdvisor API at a configurable interval and distributes cluster-wide resource data to all subscribing channels. It also exposes its own HTTP endpoints so the frontend and external tools can query the current metrics catalogue and cluster usage directly.

## What for

  - Feed real-time CPU, memory, network, and disk metrics to channels (Metrics channel, Alert, Pinocchio, Censor…).
  - Provide cluster-level resource usage snapshots to the Kwirth frontend homepage.
  - Let channels define alert thresholds evaluated on each metrics tick without polling Kubernetes themselves.

## Features

  - **Periodic polling** — reads cAdvisor every `metricsInterval` seconds (default `15`). The interval is configurable at runtime via the `/metrics/config` endpoint.
  - **Push distribution** — on each tick, every subscribed channel receives the full `IMetricsCluster` snapshot via `processProviderEvent`.
  - **HTTP endpoints** — exposes `GET /metrics` (metrics catalogue), `GET /metrics/usage/cluster` (aggregated cluster usage), and `GET|POST /metrics/config` (read/set interval). All endpoints require a valid API key.
  - **Custom Kwirth metrics** — computes derived metrics on top of raw cAdvisor data:

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

## HTTP endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/metrics` | Returns the full metrics catalogue (name, type, help, eval expression) |
| `GET` | `/metrics/usage/cluster` | Returns aggregated cluster CPU/memory usage |
| `GET` | `/metrics/config` | Returns the current polling interval |
| `POST` | `/metrics/config` | Updates the polling interval (`{ "metricsInterval": 30 }`) |

## Subscribing from a channel

```typescript
this.clusterInfo.addSubscriber('metrics', this, {})
```

Each call to `processProviderEvent` receives an `IMetricsCluster` object containing per-node (`IMetricsNode`) and per-container metric values with timestamps.
