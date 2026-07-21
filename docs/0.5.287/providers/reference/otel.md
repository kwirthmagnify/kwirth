# OpenTelemetry (OTel)

The OTel provider turns Kwirth into an **OTLP/HTTP receiver**. It exposes three ingest endpoints (traces, metrics, logs) that any OpenTelemetry-compatible exporter can push data to. Received signals are normalized and distributed to subscribing channels grouped by space, with optional service-name filtering.

?> The OTel provider is an **installable provider** — it is not bundled in Kwirth core. Install it via the provider management UI or `kwirth-dev.json`.

## What for

  - Receive distributed traces, metrics, and logs from any OTel-instrumented service without deploying a separate collector.
  - Feed observability signals into channels like Pinocchio or Censor for AI-powered analysis.
  - Correlate application telemetry with Kubernetes events in real time.

## Features

  - **Three signal types** — `traces`, `metrics`, `logs`, each on its own endpoint.
  - **OTLP/HTTP JSON** — accepts `Content-Type: application/json`. Protobuf is not supported in this version.
  - **Space/service routing** — each space maps to one or more signals; an optional `services` list filters by the `service.name` resource attribute.
  - **Normalized events** — raw OTLP payloads are decoded into typed structs (`IOtelTraceEvent`, `IOtelMetricEvent`, `IOtelLogEvent`) before delivery to channels.

## OTLP endpoints

Configure your OTel exporters to point to:

```
http://<kwirth-host>:<port>/otlp/v1/traces
http://<kwirth-host>:<port>/otlp/v1/metrics
http://<kwirth-host>:<port>/otlp/v1/logs
```

## Subscribing from a channel

```typescript
this.clusterInfo.addSubscriber('otel', this, {
    spaces: [
        { name: 'observability', signals: ['traces', 'metrics', 'logs'] },
        { name: 'alerts', signals: ['logs'], services: ['payment-service'] }
    ]
} as IOtelProviderConfig)
```

Each call to `processProviderEvent` delivers a normalized event typed by signal:

| Signal | Event type | Key fields |
|---|---|---|
| `traces` | `IOtelTraceEvent` | `spans[]`, `resource`, `scope` |
| `metrics` | `IOtelMetricEvent` | `dataPoints[]`, `name`, `unit` |
| `logs` | `IOtelLogEvent` | `body`, `severity`, `attributes` |
