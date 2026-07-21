# OpenTelemetry (provider)

> **Type:** Provider (installable)<br>
> **Package:** `@kwirthmagnify/kwirth-provider-otel`

## What it does

The **OpenTelemetry (OTel)** provider turns Kwirth into an **OTLP/HTTP receiver**. Any OTel-instrumented service can push **traces, metrics and logs** straight to Kwirth — no separate collector needed — and those signals are normalized and delivered to subscribing channels grouped by **space**, with optional service-name filtering.

## When to use it

- Receive **traces / metrics / logs** from instrumented services directly.
- Feed telemetry into **[Pinocchio](../plugins/pinocchio)** / **[Censor](../plugins/censor)** for AI-powered analysis.
- Correlate application telemetry with Kubernetes events in real time.

## Configuration

Point your OTel exporters (OTLP/HTTP, **JSON**) at Kwirth's endpoints:

```
http://<kwirth-host>:<port>/otlp/v1/traces
http://<kwirth-host>:<port>/otlp/v1/metrics
http://<kwirth-host>:<port>/otlp/v1/logs
```

A subscription declares **spaces**, each mapping a `name` to one or more **signals** (`traces` / `metrics` / `logs`) with an optional **services** filter (by the `service.name` resource attribute). See the reference [OpenTelemetry provider](../../providers/reference/otel).

## Notes

- Accepts **OTLP/HTTP JSON** (`Content-Type: application/json`); Protobuf isn't supported in this version.
- The ingest endpoints are network-facing — protect them like any other ingress.

---

← Back to [Providers](index)
