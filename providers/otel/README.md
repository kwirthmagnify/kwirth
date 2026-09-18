# OpenTelemetry Provider

Installable Kwirth **provider** that receives **OTLP/HTTP** signals — traces, metrics and logs —
normalizes them, and dispatches them to subscribing channels grouped by **spaces**.

It is an OTLP **receiver in its own right**: instrumented applications export straight to Kwirth, so
there is no OpenTelemetry Collector to deploy, configure or keep alive in between.

## What it supports

| | |
|---|---|
| **Transport** | OTLP over **HTTP** |
| **Encoding** | **JSON only** — `Content-Type: application/json` |
| **Signals** | `traces`, `metrics`, `logs` |
| **Authentication** | none on the ingestion router (see [Security](#security)) |

> ### Encoding: JSON, and what that means for your exporter
>
> This provider reads **OTLP/HTTP JSON**. A request carrying `Content-Type: application/x-protobuf`
> is answered with **`415 Unsupported Media Type`** and an explanatory message.
>
> That matters when choosing how to export, because the OpenTelemetry specification requires
> exporters to implement `http/protobuf` and leaves `http/json` **optional** — so support varies by
> language:
>
> | Runtime | Emits OTLP/HTTP JSON | Exports straight to this provider |
> |---|---|---|
> | **Node.js** | yes — it is the native wire format of `@opentelemetry/exporter-*-otlp-http` | **yes** |
> | .NET, Java, Python, Go | no — these SDKs emit protobuf | no |
>
> **gRPC** (the usual port `4317`) is not supported either: Kwirth mounts express routers, and
> express does not speak gRPC. Point your exporter at the HTTP endpoints below.

## Ingestion endpoints

The core mounts this provider under its router alias, which is **`otlp`** (not `otel`):

```
POST {clusterUrl}{ROOTPATH}/provider/otlp/v1/traces
POST {clusterUrl}{ROOTPATH}/provider/otlp/v1/metrics
POST {clusterUrl}{ROOTPATH}/provider/otlp/v1/logs
Content-Type: application/json
```

⚠️ Mind the `ROOTPATH`: if your Kwirth is served under a sub-path, it belongs in the URL. A missing
`ROOTPATH` is the most common cause of a silent 404 when wiring an exporter.

Standard OTLP exporters append `/v1/<signal>` themselves, so the value you configure is the base:

```
OTEL_EXPORTER_OTLP_ENDPOINT = http://<kwirth-host>:<port>{ROOTPATH}/provider/otlp
```

Responses: `200` on accepted, `400` on an empty body, `415` on an unsupported encoding, `500` on an
internal error.

## Exporting from a Node.js application

No application code changes are needed: the auto-instrumentation package is loaded through
`NODE_OPTIONS`, and the SDK reads its configuration from the environment.

```yaml
initContainers:
  - name: otel-install
    image: node:20-slim
    command: ["sh", "-c", "npm i --prefix /otel @opentelemetry/auto-instrumentations-node"]
    volumeMounts: [{ name: otel, mountPath: /otel }]
containers:
  - name: app
    env:
      - name: NODE_OPTIONS
        value: "--require /otel/node_modules/@opentelemetry/auto-instrumentations-node/register"
      - name: OTEL_EXPORTER_OTLP_ENDPOINT
        value: "http://kwirth.kwirth:3883/provider/otlp"
      - name: OTEL_SERVICE_NAME
        value: "my-service"
      - name: OTEL_RESOURCE_ATTRIBUTES
        value: "k8s.namespace.name=my-ns,k8s.deployment.name=my-deploy"
    volumeMounts: [{ name: otel, mountPath: /otel }]
volumes:
  - name: otel
    emptyDir: {}
```

`OTEL_SERVICE_NAME` becomes the `service.name` resource attribute, which is what the `services`
filter below matches on — set it deliberately.

## Subscriber config

A channel subscribes by declaring `otel` in its `requirements.providers` and calling
`addSubscriber('otel', this, config)` with:

```ts
interface IOtelProviderConfig {
    spaces: IOtelSpaceMapping[]
}

interface IOtelSpaceMapping {
    name: string           // logical space the matching signals are grouped under
    signals: OtelSignal[]  // 'traces' | 'metrics' | 'logs' — only these are delivered
    services?: string[]    // optional whitelist on the 'service.name' resource attribute;
                           // omit it to accept every service
}
```

A signal is delivered to a space when **both** conditions hold: its type is listed in `signals`, and
—if `services` is present and non-empty— its `service.name` is in that list.

Example — one space taking everything, another taking only the logs of a single service:

```ts
this.clusterInfo.addSubscriber('otel', this, {
    spaces: [
        { name: 'observability', signals: ['traces', 'metrics', 'logs'] },
        { name: 'alerts',        signals: ['logs'], services: ['payment-service'] }
    ]
})
```

The same event is delivered once **per matching space**, so a signal that matches two spaces arrives
twice, each time labelled with its own space.

## What a subscriber receives

Events reach the channel through `processProviderEvent(providerId, payload)`, where `payload.last`
carries the event just received and `payload.all` the accumulated store (`space → signal → events`):

```ts
{
  last: {
    type: 'event',
    timestamp: '1757155200000',
    event: { space: 'observability', type: 'traces', data: /* normalized event */ }
  },
  all: Map<string, Map<string, unknown[]>>
}
```

Payloads are normalized before dispatch, so a subscriber never parses raw OTLP. Every event carries
its `resource` attributes and `scope`, plus:

- **`IOtelTraceEvent`** — `spans[]` with `traceId`, `spanId`, `parentSpanId`, `name`, `kind`,
  `startTime`/`endTime` as ISO timestamps, **`durationMs`** already computed, `attributes`,
  `status`, `events[]` and `links[]`.
- **`IOtelMetricEvent`** — `metrics[]` with `name`, `unit`, `type` (`gauge`, `sum`, `histogram`,
  `exponentialHistogram`, `summary`), `isMonotonic`, `aggregationTemporality` and `dataPoints[]`
  (`value`, or `count`/`sum`/`bucketCounts`/`explicitBounds` for histograms).
- **`IOtelLogEvent`** — `records[]` with `timestamp`, `observedTimestamp`, `severityNumber`,
  `severityText`, `body`, `attributes` and the correlating `traceId`/`spanId`.

Nanosecond timestamps are converted to ISO strings, so no subscriber has to deal with OTLP's
`unixNano` encoding.

## Security

The ingestion router declares `requiresApiKeyApi = false` and therefore **accepts unauthenticated
requests** — unlike the `events` and `metrics` providers of the core, which require an accessKey.

That is deliberate: exporters live inside the workloads and are not Kwirth clients, so they hold no
Kwirth credential. Plan accordingly:

- expose the ingestion path **inside the cluster** and keep it off any public ingress, or
- put your own authenticating proxy in front of it if telemetry must arrive from outside.

Anyone able to reach the endpoint can push telemetry into the spaces that subscribing channels
listen to.

## Accumulation

The provider keeps received events in memory, grouped by space and signal, and hands the whole store
to subscribers on every dispatch. There is **no persistence and no retention policy**: the store
grows with traffic and is lost on restart. Channels that need history are expected to keep their
own.

## Install

Installable from the Kwirth marketplace like any other provider. It declares no
`requiresExtension` and no restart (`requiresRestart: false`).

```
@kwirthmagnify/kwirth-provider-otel
```
