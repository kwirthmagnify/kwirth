# Provider reference

Detailed reference for each available kwirth provider.

| Provider | Description |
|---|---|
| [Tick](tick) | Fires a periodic heartbeat event to subscribing channels |
| [Events](events) | Streams Kubernetes resource events (Pod, Deployment, Service…) to channels |
| [Business](business) | HTTP ingestion endpoint for external business events, routed by space/type |
| [Validating](validating) | Intercepts Kubernetes admission webhooks for real-time artifact validation |
| [Metrics](metrics) | Polls cAdvisor for cluster metrics and distributes them to subscribing channels |
| [Kafka](kafka) | Consumes Kafka topics and distributes messages to channels via space/type routing |
| [OpenTelemetry](otel) | OTLP/HTTP receiver for traces, metrics, and logs from any OTel-instrumented service |
| [HTTP Pull-Push](http-pull-push) | Polls remote HTTP endpoints on a schedule and pushes each result to the subscribing channels |
| [Sugarless](sugarless) | Reads glucose readings from LibreLinkUp, keeps a rolling history and pushes it to the subscribing channels |
| [Sample](sample) | Reference implementation — starting point for building custom providers |
